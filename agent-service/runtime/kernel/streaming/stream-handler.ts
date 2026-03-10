/**
 * 流式处理器
 *
 * 处理 LangGraph 的流式事件，转换为 StreamCallbacks 调用
 */

import type { RunnableConfig } from "@langchain/core/runnables";
import type { StreamCallbacks, StateChangeCallbacks } from "../types";

/** 流式事件 */
interface StreamEvent {
  event: string;
  name: string;
  data?: {
    chunk?: string;
    input?: unknown;
    output?: unknown;
  };
}

/**
 * 流式处理器
 */
export class StreamHandler {
  private callbacks: StreamCallbacks;
  private stateCallbacks?: StateChangeCallbacks;

  constructor(callbacks: StreamCallbacks, stateCallbacks?: StateChangeCallbacks) {
    this.callbacks = callbacks;
    this.stateCallbacks = stateCallbacks;
  }

  /**
   * 创建流式配置
   */
  createStreamConfig(sessionKey: string): RunnableConfig {
    return {
      configurable: {
        thread_id: sessionKey,
      },
    };
  }

  /**
   * 处理流式事件
   */
  async handleStreamEvent(event: StreamEvent): Promise<void> {
    switch (event.event) {
      case "on_chat_model_stream":
        // LLM 流式输出
        if (event.data?.chunk) {
          await this.callbacks.onChunk(event.data.chunk);
        }
        break;

      case "on_chain_start":
        // 节点开始
        await this.stateCallbacks?.onStateChange?.(event.name, { started: true });
        break;

      case "on_chain_end":
        // 节点结束
        await this.stateCallbacks?.onStateChange?.(event.name, {
          completed: true,
          output: event.data?.output,
        });
        break;

      case "on_tool_start":
        // 工具开始执行
        await this.stateCallbacks?.onStateChange?.("executing", {
          tool: event.name,
          input: event.data?.input,
        });
        break;

      case "on_tool_end":
        // 工具执行完成
        await this.stateCallbacks?.onStateChange?.("observing", {
          tool: event.name,
          output: event.data?.output,
        });
        break;
    }
  }
}
