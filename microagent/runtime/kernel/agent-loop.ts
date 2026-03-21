/**
 * ReAct Agent 循环
 *
 * 实现 Agent 的 ReAct（推理 - 行动）循环，负责协调 LLM 调用和工具执行
 */

import type { Message, ChatRequest, ToolCall, StreamChunk, ChatResponse } from "../types.js";
import type { IProviderExtended } from "../provider/contract.js";
import type { ToolRegistry } from "../tool/registry.js";
import type { AgentConfig, AgentState, AgentEvent, AgentResult, ToolCallRecord } from "./types.js";
import { createTimer, sanitize, logMethodCall, logMethodReturn, logMethodError, truncateText, createDefaultLogger } from "../logger/index.js";
import { ToolExecutionError } from "../errors.js";

// ============================================================================
// 常量定义
// ============================================================================

/** 模块名称 */
const MODULE_NAME = "AgentLoop";

/** 默认兜底回复内容 */
const DEFAULT_FALLBACK_RESPONSE = "我已完成处理，但没有生成回复内容。";

// ============================================================================
// 类型定义
// ============================================================================

/**
 * Agent 事件处理器
 */
export type AgentEventHandler = (event: AgentEvent) => void | Promise<void>;

/**
 * LLM 响应结果
 */
interface LLMResponse {
  /** 是否有工具调用 */
  hasToolCall: boolean;
  /** 工具调用列表 */
  toolCalls?: ToolCall[];
  /** 回复文本 */
  text?: string;
  /** 推理过程 */
  reasoning?: string;
}

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 构建最终回复内容
 */
function buildFinalContent(text: string | undefined): string {
  return text?.trim() || DEFAULT_FALLBACK_RESPONSE;
}

// ============================================================================
// AgentLoop 类
// ============================================================================

/**
 * ReAct Agent 循环
 *
 * 负责管理 Agent 的推理 - 行动循环，协调 LLM 调用和工具执行
 */
export class AgentLoop {
  private state: AgentState = "idle";
  private handlers = new Set<AgentEventHandler>();
  private logger = createDefaultLogger("debug", ["runtime", "kernel", "agent-loop"]);

  constructor(
    private provider: IProviderExtended,
    private tools: ToolRegistry,
    private config: AgentConfig = { model: "default", maxIterations: 40, defaultTimeout: 30000 }
  ) {
    const timer = createTimer();
    logMethodCall(this.logger, { method: "constructor", module: MODULE_NAME, params: sanitize({ config: this.config }) as Record<string, unknown> });

    this.logger.info("AgentLoop 实例创建完成", { model: this.config.model, maxIterations: this.config.maxIterations });

    logMethodReturn(this.logger, { method: "constructor", module: MODULE_NAME, duration: timer() });
  }

  async run(initialMessages: Message[]): Promise<AgentResult> {
    return this.runAgentLoop(initialMessages, false);
  }

  async runStreaming(initialMessages: Message[]): Promise<AgentResult> {
    return this.runAgentLoop(initialMessages, true);
  }

  // ============================================================================
  // 核心方法 - 统一的 Agent 循环逻辑
  // ============================================================================

  /**
   * 运行 Agent 循环（统一实现）
   */
  private async runAgentLoop(initialMessages: Message[], streaming: boolean): Promise<AgentResult> {
    const timer = createTimer();
    logMethodCall(this.logger, { method: "runAgentLoop", module: MODULE_NAME, params: sanitize({ messageCount: initialMessages.length, streaming }) as Record<string, unknown> });

    const messages = [...initialMessages];
    const allToolCalls: ToolCallRecord[] = [];

    this.setState("thinking");
    this.logger.info(`Agent ${streaming ? "流式" : ""}运行开始`, { initialMessageCount: initialMessages.length, maxIterations: this.config.maxIterations });

    for (let i = 0; i < this.config.maxIterations; i++) {
      this.logger.debug("开始迭代", { iteration: i + 1, messageCount: messages.length });

      try {
        const response = await this.callLLM(messages, streaming);

        if (!response.hasToolCall || !response.toolCalls?.length) {
          return this.handleNoToolCall(response, messages, i, timer, streaming);
        }

        await this.processToolCalls(response, messages, allToolCalls);
        this.setState("thinking");
      } catch (error) {
        return this.handleError(error, messages, i, timer);
      }
    }

    return this.handleMaxIterationsReached(messages, timer);
  }

  // ============================================================================
  // 分支处理方法
  // ============================================================================

  /**
   * 处理无工具调用的情况
   */
  private handleNoToolCall(response: LLMResponse, messages: Message[], iteration: number, timer: () => number, streaming: boolean): AgentResult {
    this.setState("responding");

    const finalContent = buildFinalContent(response.text);

    this.logger.info(`Agent ${streaming ? "流式" : ""}运行完成，无工具调用`, {
      iterations: iteration + 1,
      totalToolCalls: 0,
      contentLength: finalContent.length,
      content: truncateText(finalContent),
    });

    const result = { content: finalContent, messages };
    logMethodReturn(this.logger, { method: "runAgentLoop", module: MODULE_NAME, result: sanitize({ contentLength: finalContent.length, messageCount: messages.length }) as Record<string, unknown>, duration: timer() });

    return result;
  }

  /**
   * 处理错误情况
   */
  private handleError(error: unknown, messages: Message[], iteration: number, timer: () => number): AgentResult {
    this.setState("error");
    const err = error instanceof Error ? error : new Error(String(error));
    this.emit({ type: "error", error: err, timestamp: Date.now() });

    logMethodError(this.logger, {
      method: "runAgentLoop",
      module: MODULE_NAME,
      error: { name: err.name, message: err.message, ...(err.stack ? { stack: err.stack } : {}) },
      params: sanitize({ iteration: iteration + 1, messageCount: messages.length }) as Record<string, unknown>,
      duration: timer(),
    });

    return { content: null, messages, error: err.message };
  }

  /**
   * 处理达到最大迭代次数
   */
  private handleMaxIterationsReached(messages: Message[], timer: () => number): AgentResult {
    this.setState("error");
    this.logger.warn("达到最大迭代次数", { maxIterations: this.config.maxIterations });

    const result = { content: null, messages, error: `达到最大迭代次数：${this.config.maxIterations}` };
    logMethodReturn(this.logger, { method: "runAgentLoop", module: MODULE_NAME, result: sanitize(result), duration: timer() });

    return result;
  }

  // ============================================================================
  // LLM 调用方法
  // ============================================================================

  /**
   * 调用 LLM（支持流式）
   */
  private async callLLM(messages: Message[], streaming: boolean): Promise<LLMResponse> {
    const request: ChatRequest = { model: this.config.model, messages, tools: this.tools.getDefinitions() };

    const response = streaming
      ? await this.callLLMStreaming(request)
      : await this.callLLMStandard(request);

    return response as LLMResponse;
  }

  /**
   * 标准 LLM 调用
   */
  private async callLLMStandard(request: ChatRequest) {
    const timer = createTimer();
    logMethodCall(this.logger, { method: "callLLMStandard", module: MODULE_NAME, params: sanitize({ messageCount: request.messages.length }) as Record<string, unknown> });

    try {
      const response = await this.provider.chat(request);
      this.logLLMResponse(response, timer(), false);
      logMethodReturn(this.logger, { method: "callLLMStandard", module: MODULE_NAME, result: sanitize({ hasToolCall: response.hasToolCall, toolCallCount: response.toolCalls?.length }) as Record<string, unknown>, duration: timer() });
      return response;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logMethodError(this.logger, { method: "callLLMStandard", module: MODULE_NAME, error: { name: err.name, message: err.message, ...(err.stack ? { stack: err.stack } : {}) }, params: sanitize({ messageCount: request.messages.length }) as Record<string, unknown>, duration: timer() });
      throw error;
    }
  }

  /**
   * 流式 LLM 调用
   */
  private async callLLMStreaming(request: ChatRequest) {
    const timer = createTimer();
    logMethodCall(this.logger, { method: "callLLMStreaming", module: MODULE_NAME, params: sanitize({ messageCount: request.messages.length }) as Record<string, unknown> });

    const streamCallback = async (chunk: StreamChunk) => {
      this.emit({ type: "streaming", delta: chunk.delta, text: chunk.text, done: chunk.done, timestamp: Date.now() });
      if (this.config.onStreamChunk) {
        await this.config.onStreamChunk(chunk);
      }
    };

    try {
      const response = await this.provider.streamChat(request, streamCallback);
      this.logLLMResponse(response, timer(), true);
      logMethodReturn(this.logger, { method: "callLLMStreaming", module: MODULE_NAME, result: sanitize({ hasToolCall: response.hasToolCall, toolCallCount: response.toolCalls?.length }) as Record<string, unknown>, duration: timer() });
      return response;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logMethodError(this.logger, { method: "callLLMStreaming", module: MODULE_NAME, error: { name: err.name, message: err.message, ...(err.stack ? { stack: err.stack } : {}) }, params: sanitize({ messageCount: request.messages.length }) as Record<string, unknown>, duration: timer() });
      throw error;
    }
  }

  /**
   * 记录 LLM 响应日志
   */
  private logLLMResponse(response: ChatResponse, duration: number, streaming: boolean): void {
    this.logger.debug(`LLM ${streaming ? "流式" : ""}调用完成`, {
      hasToolCall: response.hasToolCall,
      toolCallCount: response.toolCalls?.length ?? 0,
      contentLength: response.text?.length ?? 0,
      duration,
      text: response.text ? truncateText(response.text) : undefined,
      reasoning: response.reasoning ? truncateText(response.reasoning) : undefined,
      toolCalls: response.toolCalls?.map((toolCall: ToolCall) => ({ id: toolCall.id, name: toolCall.name, arguments: toolCall.arguments })),
    });
  }

  // ============================================================================
  // 工具处理方法
  // ============================================================================

  /**
   * 处理所有工具调用
   */
  private async processToolCalls(response: LLMResponse, messages: Message[], allToolCalls: ToolCallRecord[]): Promise<void> {
    this.setState("tool_call");
    this.logger.info("检测到工具调用", { toolCallCount: response.toolCalls!.length, toolNames: response.toolCalls!.map(c => c.name) });

    messages.push({ role: "assistant", content: response.text || "", toolCalls: response.toolCalls! });

    for (const call of response.toolCalls!) {
      const record = await this.executeSingleToolCall(call);
      allToolCalls.push(record);

      messages.push({
        role: "tool",
        toolCallId: call.id,
        name: call.name,
        content: record.result ?? "",
      });
    }
  }

  /**
   * 执行单个工具调用
   * @throws ToolExecutionError 当工具执行失败时
   */
  private async executeSingleToolCall(call: ToolCall): Promise<ToolCallRecord> {
    const startTime = Date.now();
    this.emit({ type: "tool_start", toolName: call.name, timestamp: startTime });

    this.logger.info("开始执行工具", { toolName: call.name, toolCallId: call.id, arguments: call.arguments });

    try {
      const result = await this.tools.execute(call.name, call.arguments);
      this.emit({ type: "tool_end", toolName: call.name, message: result, timestamp: Date.now() });

      this.logger.info("工具执行完成", {
        toolName: call.name,
        resultLength: result.length,
        result: truncateText(result),
      });

      return { id: call.id, name: call.name, arguments: call.arguments, result, duration: Date.now() - startTime };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const err = error instanceof Error ? error : new Error(String(error));

      logMethodError(this.logger, {
        method: "executeSingleToolCall",
        module: MODULE_NAME,
        error: { name: err.name, message: err.message, ...(err.stack ? { stack: err.stack } : {}) },
        params: sanitize({ toolName: call.name, toolCallId: call.id }) as Record<string, unknown>,
      });

      // 抛出 ToolExecutionError，让调用方决定如何处理
      throw new ToolExecutionError(call.name, errorMsg, err);
    }
  }

  // ============================================================================
  // 状态和事件管理
  // ============================================================================

  private setState(state: AgentState): void {
    const previousState = this.state;
    this.state = state;
    this.emit({ type: "state_change", state, timestamp: Date.now() });
    this.logger.debug("状态变更", { previousState, newState: state });
  }

  private emit(event: AgentEvent): void {
    this.logger.debug("发射事件", { eventType: event.type, handlerCount: this.handlers.size });
    for (const handler of this.handlers) {
      try {
        handler(event);
      } catch (error) {
        this.logger.warn("事件处理器执行错误", { eventType: event.type, error: error instanceof Error ? error.message : String(error) });
      }
    }
  }

  // ============================================================================
  // 公共方法
  // ============================================================================

  on(handler: AgentEventHandler): void {
    this.handlers.add(handler);
    this.logger.debug("添加事件处理器", { handlerCount: this.handlers.size });
  }

  off(handler: AgentEventHandler): void {
    this.handlers.delete(handler);
    this.logger.debug("移除事件处理器", { handlerCount: this.handlers.size });
  }

  getState(): AgentState {
    return this.state;
  }
}
