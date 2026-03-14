/**
 * ReAct Agent 循环
 *
 * 实现 Agent 的 ReAct（推理-行动）循环，负责协调 LLM 调用和工具执行
 */

import type { Message, ChatRequest, ToolCall, StreamChunk } from "../types.js";
import type { IProviderExtended } from "../provider/contract.js";
import type { ToolRegistry } from "../tool/registry.js";
import type { AgentConfig, AgentState, AgentEvent, AgentResult, ToolCallRecord } from "./types.js";

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
  ) {}

  /**
   * 运行 Agent
   * @param initialMessages - 初始消息列表
   * @returns Agent 执行结果
   */
  async run(initialMessages: Message[]): Promise<AgentResult> {
    const messages = [...initialMessages];
    const allToolCalls: ToolCallRecord[] = [];

    this.setState("thinking");

    for (let i = 0; i < this.config.maxIterations; i++) {
      try {
        // 1. 调用 LLM（支持流式输出）
        const response = await this.callLLM(messages);

        // 2. 无工具调用 → 返回结果
        if (!response.hasToolCall || !response.toolCalls?.length) {
          this.setState("responding");
          return {
            content: response.text,
            messages,
          };
        }

        // 3. 处理工具调用
        this.setState("tool_call");

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
        return {
          content: null,
          messages,
          error: err.message,
        };
      }
    }

    // 达到最大迭代次数
    this.setState("error");
    return {
      content: null,
      messages,
      error: `达到最大迭代次数: ${this.config.maxIterations}`,
    };
  }

  /**
   * 运行 Agent（流式输出版本）
   * @param initialMessages - 初始消息列表
   * @returns Agent 执行结果
   */
  async runStreaming(initialMessages: Message[]): Promise<AgentResult> {
    const messages = [...initialMessages];
    const allToolCalls: ToolCallRecord[] = [];

    this.setState("thinking");

    for (let i = 0; i < this.config.maxIterations; i++) {
      try {
        // 1. 调用 LLM（流式输出）
        const response = await this.callLLMStreaming(messages);

        // 2. 无工具调用 → 返回结果
        if (!response.hasToolCall || !response.toolCalls?.length) {
          this.setState("responding");
          return {
            content: response.text,
            messages,
          };
        }

        // 3. 处理工具调用
        this.setState("tool_call");

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
        return {
          content: null,
          messages,
          error: err.message,
        };
      }
    }

    // 达到最大迭代次数
    this.setState("error");
    return {
      content: null,
      messages,
      error: `达到最大迭代次数: ${this.config.maxIterations}`,
    };
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
    const request: ChatRequest = {
      model: this.config.model,
      messages,
      tools: this.tools.getDefinitions(),
    };

    return await this.provider.chat(request);
  }

  /**
   * 调用 LLM（流式输出）
   * @param messages - 消息列表
   * @returns 聊天响应
   */
  private async callLLMStreaming(messages: Message[]) {
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

    return await this.provider.streamChat(request, streamCallback);
  }

  /**
   * 执行工具调用
   * @param call - 工具调用
   * @returns 工具调用记录
   */
  private async executeToolCall(call: ToolCall): Promise<ToolCallRecord> {
    const startTime = Date.now();

    this.emit({
      type: "tool_start",
      toolName: call.name,
      timestamp: startTime,
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
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      result = `工具执行错误: ${errorMsg}`;

      this.emit({
        type: "error",
        toolName: call.name,
        error: new Error(errorMsg),
        timestamp: Date.now(),
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
    this.state = state;
    this.emit({ type: "state_change", state, timestamp: Date.now() });
  }

  /**
   * 发射事件
   * @param event - 事件对象
   */
  private emit(event: AgentEvent): void {
    for (const handler of this.handlers) {
      try {
        handler(event);
      } catch (error) {
        if (this.config.enableLogging) {
          console.error("[AgentLoop] Handler error:", error);
        }
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
    this.handlers.add(handler);
  }

  /**
   * 取消订阅
   * @param handler - 事件处理器
   */
  off(handler: AgentEventHandler): void {
    this.handlers.delete(handler);
  }

  /**
   * 获取当前状态
   * @returns Agent 状态
   */
  getState(): AgentState {
    return this.state;
  }
}
