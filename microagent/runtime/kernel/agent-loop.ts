/**
 * ReAct Agent 循环
 *
 * 实现 Agent 的 ReAct（推理-行动）循环，负责协调 LLM 调用和工具执行
 */

import type { Message, ChatRequest, ToolCall, StreamChunk } from "../types.js";
import type { IProviderExtended } from "../provider/contract.js";
import type { ToolRegistry } from "../tool/registry.js";
import type { AgentConfig, AgentState, AgentEvent, AgentResult, ToolCallRecord } from "./types.js";
import { kernelLogger, createTimer, sanitize, logMethodCall, logMethodReturn, logMethodError } from "../../applications/shared/logger.js";

// ============================================================================
// 常量定义
// ============================================================================

/** 模块名称 */
const MODULE_NAME = "AgentLoop";

/** 日志文本截断长度 */
const LOG_TRUNCATE_LENGTH = 2000;

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 截断文本到指定长度
 * @param text - 原始文本
 * @param maxLength - 最大长度
 * @returns 截断后的文本
 */
function truncateText(text: string, maxLength: number = LOG_TRUNCATE_LENGTH): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.slice(0, maxLength) + `... (已截断，总长度: ${text.length})`;
}

// ============================================================================
// 类型定义
// ============================================================================

/**
 * Agent 事件处理器
 */
export type AgentEventHandler = (event: AgentEvent) => void | Promise<void>;

// ============================================================================
// 默认配置
// ============================================================================

/**
 * 默认 Agent 配置
 */
const DEFAULT_CONFIG: AgentConfig = {
  model: "default",
  maxIterations: 40,
  defaultTimeout: 30000,
  enableLogging: false,
};

// ============================================================================
// AgentLoop 类
// ============================================================================

/**
 * ReAct Agent 循环
 *
 * 负责管理 Agent 的推理-行动循环，协调 LLM 调用和工具执行
 */
export class AgentLoop {
  private state: AgentState = "idle";
  private handlers = new Set<AgentEventHandler>();
  private logger = kernelLogger();

  /**
   * 创建 AgentLoop 实例
   * @param provider - LLM 提供者
   * @param tools - 工具注册表
   * @param config - Agent 配置
   */
  constructor(
    private provider: IProviderExtended,
    private tools: ToolRegistry,
    private config: AgentConfig = DEFAULT_CONFIG
  ) {
    const timer = createTimer();
    logMethodCall(this.logger, {
      method: "constructor",
      module: MODULE_NAME,
      params: sanitize({ config: this.config }) as Record<string, unknown>,
    });
    this.logger.info("AgentLoop 实例创建完成", {
      model: this.config.model,
      maxIterations: this.config.maxIterations,
    });
    logMethodReturn(this.logger, {
      method: "constructor",
      module: MODULE_NAME,
      duration: timer(),
    });
  }

  /**
   * 运行 Agent
   * @param initialMessages - 初始消息列表
   * @returns Agent 执行结果
   */
  async run(initialMessages: Message[]): Promise<AgentResult> {
    const timer = createTimer();
    logMethodCall(this.logger, {
      method: "run",
      module: MODULE_NAME,
      params: sanitize({ messageCount: initialMessages.length }) as Record<string, unknown>,
    });

    const messages = [...initialMessages];
    const allToolCalls: ToolCallRecord[] = [];

    this.setState("thinking");
    this.logger.info("Agent 运行开始", {
      initialMessageCount: initialMessages.length,
      maxIterations: this.config.maxIterations,
    });

    for (let i = 0; i < this.config.maxIterations; i++) {
      this.logger.debug("开始迭代", { iteration: i + 1, messageCount: messages.length });

      try {
        // 1. 调用 LLM（支持流式输出）
        const response = await this.callLLM(messages);

        // 2. 无工具调用 → 返回结果
        if (!response.hasToolCall || !response.toolCalls?.length) {
          this.setState("responding");

          // 空响应兜底处理：当 LLM 返回空字符串时，返回默认消息
          const finalContent = response.text?.trim() || "我已完成处理，但没有生成回复内容。";

          this.logger.info("Agent 运行完成，无工具调用", {
            iterations: i + 1,
            totalToolCalls: allToolCalls.length,
            contentLength: finalContent.length,
            content: truncateText(finalContent),
          });
          const result = {
            content: finalContent,
            messages,
          };
          logMethodReturn(this.logger, {
            method: "run",
            module: MODULE_NAME,
            result: sanitize({ contentLength: finalContent.length, messageCount: messages.length }) as Record<string, unknown>,
            duration: timer(),
          });
          return result;
        }

        // 3. 处理工具调用
        this.setState("tool_call");
        this.logger.info("检测到工具调用", {
          toolCallCount: response.toolCalls.length,
          toolNames: response.toolCalls.map(c => c.name),
        });

        // 先将 assistant 消息（包含 tool_calls）添加到消息历史
        messages.push({
          role: "assistant",
          content: response.text || "",
          toolCalls: response.toolCalls,
        });

        for (const call of response.toolCalls) {
          const record = await this.executeToolCall(call);
          allToolCalls.push(record);

          // 将工具结果添加到消息历史
          messages.push({
            role: "tool",
            toolCallId: call.id,
            name: call.name,
            content: record.result ?? "",
          });
        }

        // 4. 继续循环
        this.setState("thinking");
      } catch (error) {
        this.setState("error");
        const err = error instanceof Error ? error : new Error(String(error));
        this.emit({ type: "error", error: err, timestamp: Date.now() });
        logMethodError(this.logger, {
          method: "run",
          module: MODULE_NAME,
          error: { name: err.name, message: err.message, ...(err.stack ? { stack: err.stack } : {}) },
          params: sanitize({ iteration: i + 1, messageCount: messages.length }) as Record<string, unknown>,
          duration: timer(),
        });
        return {
          content: null,
          messages,
          error: err.message,
        };
      }
    }

    // 达到最大迭代次数
    this.setState("error");
    this.logger.warn("达到最大迭代次数", { maxIterations: this.config.maxIterations });
    const result = {
      content: null,
      messages,
      error: `达到最大迭代次数: ${this.config.maxIterations}`,
    };
    logMethodReturn(this.logger, {
      method: "run",
      module: MODULE_NAME,
      result: sanitize(result),
      duration: timer(),
    });
    return result;
  }

  /**
   * 运行 Agent（流式输出版本）
   * @param initialMessages - 初始消息列表
   * @returns Agent 执行结果
   */
  async runStreaming(initialMessages: Message[]): Promise<AgentResult> {
    const timer = createTimer();
    logMethodCall(this.logger, {
      method: "runStreaming",
      module: MODULE_NAME,
      params: sanitize({ messageCount: initialMessages.length }) as Record<string, unknown>,
    });

    const messages = [...initialMessages];
    const allToolCalls: ToolCallRecord[] = [];

    this.setState("thinking");
    this.logger.info("Agent 流式运行开始", {
      initialMessageCount: initialMessages.length,
      maxIterations: this.config.maxIterations,
    });

    for (let i = 0; i < this.config.maxIterations; i++) {
      this.logger.debug("开始迭代（流式）", { iteration: i + 1, messageCount: messages.length });

      try {
        // 1. 调用 LLM（流式输出）
        const response = await this.callLLMStreaming(messages);

        // 2. 无工具调用 → 返回结果
        if (!response.hasToolCall || !response.toolCalls?.length) {
          this.setState("responding");

          // 空响应兜底处理：当 LLM 返回空字符串时，返回默认消息
          const finalContent = response.text?.trim() || "我已完成处理，但没有生成回复内容。";

          this.logger.info("Agent 流式运行完成，无工具调用", {
            iterations: i + 1,
            totalToolCalls: allToolCalls.length,
            contentLength: finalContent.length,
            content: truncateText(finalContent),
          });
          const result = {
            content: finalContent,
            messages,
          };
          logMethodReturn(this.logger, {
            method: "runStreaming",
            module: MODULE_NAME,
            result: sanitize({ contentLength: finalContent.length, messageCount: messages.length }) as Record<string, unknown>,
            duration: timer(),
          });
          return result;
        }

        // 3. 处理工具调用
        this.setState("tool_call");
        this.logger.info("检测到工具调用（流式）", {
          toolCallCount: response.toolCalls.length,
          toolNames: response.toolCalls.map(c => c.name),
        });

        // 先将 assistant 消息（包含 tool_calls）添加到消息历史
        messages.push({
          role: "assistant",
          content: response.text || "",
          toolCalls: response.toolCalls,
        });

        for (const call of response.toolCalls) {
          const record = await this.executeToolCall(call);
          allToolCalls.push(record);

          // 将工具结果添加到消息历史
          messages.push({
            role: "tool",
            toolCallId: call.id,
            name: call.name,
            content: record.result ?? "",
          });
        }

        // 4. 继续循环
        this.setState("thinking");
      } catch (error) {
        this.setState("error");
        const err = error instanceof Error ? error : new Error(String(error));
        this.emit({ type: "error", error: err, timestamp: Date.now() });
        logMethodError(this.logger, {
          method: "runStreaming",
          module: MODULE_NAME,
          error: { name: err.name, message: err.message, ...(err.stack ? { stack: err.stack } : {}) },
          params: sanitize({ iteration: i + 1, messageCount: messages.length }) as Record<string, unknown>,
          duration: timer(),
        });
        return {
          content: null,
          messages,
          error: err.message,
        };
      }
    }

    // 达到最大迭代次数
    this.setState("error");
    this.logger.warn("达到最大迭代次数（流式）", { maxIterations: this.config.maxIterations });
    const result = {
      content: null,
      messages,
      error: `达到最大迭代次数: ${this.config.maxIterations}`,
    };
    logMethodReturn(this.logger, {
      method: "runStreaming",
      module: MODULE_NAME,
      result: sanitize(result) as Record<string, unknown>,
      duration: timer(),
    });
    return result;
  }

  // ============================================================================
  // 私有方法
  // ============================================================================

  /**
   * 调用 LLM
   * @param messages - 消息列表
   * @returns 聊天响应
   */
  private async callLLM(messages: Message[]) {
    const timer = createTimer();
    logMethodCall(this.logger, {
      method: "callLLM",
      module: MODULE_NAME,
      params: sanitize({ messageCount: messages.length, model: this.config.model }) as Record<string, unknown>,
    });

    const request: ChatRequest = {
      model: this.config.model,
      messages,
      tools: this.tools.getDefinitions(),
    };

    try {
      const response = await this.provider.chat(request);
      this.logger.debug("LLM 调用完成", {
        hasToolCall: response.hasToolCall,
        toolCallCount: response.toolCalls?.length ?? 0,
        contentLength: response.text?.length ?? 0,
        duration: timer(),
        text: response.text ? truncateText(response.text) : undefined,
        reasoning: response.reasoning ? truncateText(response.reasoning) : undefined,
        toolCalls: response.toolCalls?.map(tc => ({
          id: tc.id,
          name: tc.name,
          arguments: tc.arguments,
        })),
      });
      logMethodReturn(this.logger, {
        method: "callLLM",
        module: MODULE_NAME,
        result: sanitize({ hasToolCall: response.hasToolCall, toolCallCount: response.toolCalls?.length }) as Record<string, unknown>,
        duration: timer(),
      });
      return response;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logMethodError(this.logger, {
        method: "callLLM",
        module: MODULE_NAME,
        error: { name: err.name, message: err.message, ...(err.stack ? { stack: err.stack } : {}) },
        params: sanitize({ messageCount: messages.length }) as Record<string, unknown>,
        duration: timer(),
      });
      throw error;
    }
  }

  /**
   * 调用 LLM（流式输出）
   * @param messages - 消息列表
   * @returns 聊天响应
   */
  private async callLLMStreaming(messages: Message[]) {
    const timer = createTimer();
    logMethodCall(this.logger, {
      method: "callLLMStreaming",
      module: MODULE_NAME,
      params: sanitize({ messageCount: messages.length, model: this.config.model }) as Record<string, unknown>,
    });

    const request: ChatRequest = {
      model: this.config.model,
      messages,
      tools: this.tools.getDefinitions(),
    };

    // 流式回调：发射 streaming 事件
    const streamCallback = async (chunk: StreamChunk) => {
      // 发射 streaming 事件（包含完整 chunk 信息）
      this.emit({
        type: "streaming",
        delta: chunk.delta,
        text: chunk.text,
        done: chunk.done,
        timestamp: Date.now(),
      });

      // 调用用户配置的流式回调（用于 Channel 消息更新）
      if (this.config.onStreamChunk) {
        await this.config.onStreamChunk(chunk);
      }
    };

    try {
      const response = await this.provider.streamChat(request, streamCallback);
      this.logger.debug("LLM 流式调用完成", {
        hasToolCall: response.hasToolCall,
        toolCallCount: response.toolCalls?.length ?? 0,
        contentLength: response.text?.length ?? 0,
        duration: timer(),
        text: response.text ? truncateText(response.text) : undefined,
        reasoning: response.reasoning ? truncateText(response.reasoning) : undefined,
        toolCalls: response.toolCalls?.map(tc => ({
          id: tc.id,
          name: tc.name,
          arguments: tc.arguments,
        })),
      });
      logMethodReturn(this.logger, {
        method: "callLLMStreaming",
        module: MODULE_NAME,
        result: sanitize({ hasToolCall: response.hasToolCall, toolCallCount: response.toolCalls?.length }) as Record<string, unknown>,
        duration: timer(),
      });
      return response;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logMethodError(this.logger, {
        method: "callLLMStreaming",
        module: MODULE_NAME,
        error: { name: err.name, message: err.message, ...(err.stack ? { stack: err.stack } : {}) },
        params: sanitize({ messageCount: messages.length }) as Record<string, unknown>,
        duration: timer(),
      });
      throw error;
    }
  }

  /**
   * 执行工具调用
   * @param call - 工具调用
   * @returns 工具调用记录
   */
  private async executeToolCall(call: ToolCall): Promise<ToolCallRecord> {
    const timer = createTimer();
    logMethodCall(this.logger, {
      method: "executeToolCall",
      module: MODULE_NAME,
      params: sanitize({ toolName: call.name, toolCallId: call.id }) as Record<string, unknown>,
    });

    const startTime = Date.now();

    this.emit({
      type: "tool_start",
      toolName: call.name,
      timestamp: startTime,
    });

    this.logger.info("开始执行工具", {
      toolName: call.name,
      toolCallId: call.id,
      arguments: call.arguments,
    });

    let result: string;
    try {
      result = await this.tools.execute(call.name, call.arguments);

      this.emit({
        type: "tool_end",
        toolName: call.name,
        message: result,
        timestamp: Date.now(),
      });

      this.logger.info("工具执行完成", {
        toolName: call.name,
        resultLength: result.length,
        duration: timer(),
        result: truncateText(result),
      });

      logMethodReturn(this.logger, {
        method: "executeToolCall",
        module: MODULE_NAME,
        result: sanitize({ toolName: call.name, resultLength: result.length }) as Record<string, unknown>,
        duration: timer(),
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      result = `工具执行错误: ${errorMsg}`;

      this.emit({
        type: "error",
        toolName: call.name,
        error: new Error(errorMsg),
        timestamp: Date.now(),
      });

      const err = error instanceof Error ? error : new Error(String(error));
      logMethodError(this.logger, {
        method: "executeToolCall",
        module: MODULE_NAME,
        error: { name: err.name, message: err.message, ...(err.stack ? { stack: err.stack } : {}) },
        params: sanitize({ toolName: call.name, toolCallId: call.id }) as Record<string, unknown>,
        duration: timer(),
      });
    }

    return {
      id: call.id,
      name: call.name,
      arguments: call.arguments,
      result,
      duration: Date.now() - startTime,
    };
  }

  /**
   * 设置状态
   * @param state - 新状态
   */
  private setState(state: AgentState): void {
    const previousState = this.state;
    this.state = state;
    this.emit({ type: "state_change", state, timestamp: Date.now() });
    this.logger.debug("状态变更", { previousState, newState: state });
  }

  /**
   * 发射事件
   * @param event - 事件对象
   */
  private emit(event: AgentEvent): void {
    this.logger.debug("发射事件", { eventType: event.type, handlerCount: this.handlers.size });
    for (const handler of this.handlers) {
      try {
        handler(event);
      } catch (error) {
        // 静默处理处理器错误
        this.logger.warn("事件处理器执行错误", {
          eventType: event.type,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  // ============================================================================
  // 公共方法
  // ============================================================================

  /**
   * 订阅事件
   * @param handler - 事件处理器
   */
  on(handler: AgentEventHandler): void {
    const timer = createTimer();
    logMethodCall(this.logger, {
      method: "on",
      module: MODULE_NAME,
      params: {},
    });
    this.handlers.add(handler);
    this.logger.debug("添加事件处理器", { handlerCount: this.handlers.size });
    logMethodReturn(this.logger, {
      method: "on",
      module: MODULE_NAME,
      result: { handlerCount: this.handlers.size },
      duration: timer(),
    });
  }

  /**
   * 取消订阅
   * @param handler - 事件处理器
   */
  off(handler: AgentEventHandler): void {
    const timer = createTimer();
    logMethodCall(this.logger, {
      method: "off",
      module: MODULE_NAME,
      params: {},
    });
    this.handlers.delete(handler);
    this.logger.debug("移除事件处理器", { handlerCount: this.handlers.size });
    logMethodReturn(this.logger, {
      method: "off",
      module: MODULE_NAME,
      result: { handlerCount: this.handlers.size },
      duration: timer(),
    });
  }

  /**
   * 获取当前状态
   * @returns Agent 状态
   */
  getState(): AgentState {
    const timer = createTimer();
    logMethodCall(this.logger, {
      method: "getState",
      module: MODULE_NAME,
      params: {},
    });
    const state = this.state;
    logMethodReturn(this.logger, {
      method: "getState",
      module: MODULE_NAME,
      result: { state },
      duration: timer(),
    });
    return state;
  }
}
