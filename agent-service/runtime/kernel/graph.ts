/**
 * LangGraph 图构建
 *
 * 构建 ReAct Agent 的状态图
 */

import { StateGraph, START, END, MemorySaver } from "@langchain/langgraph";
import { HumanMessage } from "@langchain/core/messages";
import { ReActAgentState, type AgentState } from "./state";
import {
  createBuildContextNode,
  createThinkingNode,
  createToolsNode,
  createObserveNode,
} from "./nodes";
import { createShouldContinueEdge, type RouteDecision } from "./edges/should-continue";
import type { LangGraphAgentConfig, InboundMessage, StreamCallbacks, StateChangeCallbacks } from "./types";

/**
 * 创建 Agent 图
 */
export function createAgentGraph(config: LangGraphAgentConfig) {
  // 创建节点
  const contextNode = createBuildContextNode(config);
  const thinkingNode = createThinkingNode(config);
  const toolsNode = createToolsNode(config);
  const observeNode = createObserveNode();

  // 创建条件边
  const shouldContinue = createShouldContinueEdge({
    maxConsecutiveErrors: config.maxConsecutiveErrors,
  });

  // 构建图
  const graph = new StateGraph(ReActAgentState)
    // 添加节点
    .addNode("context", contextNode)
    .addNode("thinking", thinkingNode)
    .addNode("tools", toolsNode)
    .addNode("observe", observeNode)

    // 添加边
    .addEdge(START, "context")
    .addEdge("context", "thinking")
    .addConditionalEdges(
      "thinking",
      shouldContinue,
      {
        tools: "tools",
        end: END,
        error: END,
      }
    )
    .addEdge("tools", "observe")
    .addEdge("observe", "thinking")

    // 编译图（使用 MemorySaver 作为 Checkpointer）
    .compile({
      checkpointer: new MemorySaver(),
    });

  return graph;
}

/**
 * LangGraph 版 Orchestrator
 */
export class LangGraphOrchestrator {
  private graph: ReturnType<typeof createAgentGraph>;
  private config: LangGraphAgentConfig;

  constructor(config: LangGraphAgentConfig) {
    this.config = config;
    this.graph = createAgentGraph(config);
  }

  /**
   * 处理用户消息（同步）
   */
  async processMessage(
    msg: InboundMessage,
    threadId?: string
  ): Promise<AgentState> {
    const sessionKey = threadId ?? `${msg.channel}:${msg.chatId}`;

    // 初始状态
    const initialState: Partial<AgentState> = {
      sessionKey,
      channel: msg.channel,
      chatId: msg.chatId,
      messages: [new HumanMessage(msg.content)],
      systemPrompt: this.config.systemPrompt,
      maxIterations: this.config.maxIterations,
      tokenBudget: {
        maxContextTokens: this.config.tokenBudget,
        reservedForResponse: 4096,
        usedTokens: 0,
      },
    };

    // 运行图
    const config = {
      configurable: {
        thread_id: sessionKey,
      },
    };

    const result = await this.graph.invoke(initialState, config);
    return result as AgentState;
  }

  /**
   * 流式处理用户消息
   */
  async processMessageStream(
    msg: InboundMessage,
    callbacks: StreamCallbacks,
    _stateCallbacks?: StateChangeCallbacks,
    threadId?: string
  ): Promise<AgentState> {
    const sessionKey = threadId ?? `${msg.channel}:${msg.chatId}`;

    // 初始状态
    const initialState: Partial<AgentState> = {
      sessionKey,
      channel: msg.channel,
      chatId: msg.chatId,
      messages: [new HumanMessage(msg.content)],
      systemPrompt: this.config.systemPrompt,
      maxIterations: this.config.maxIterations,
      isStreaming: true,
      tokenBudget: {
        maxContextTokens: this.config.tokenBudget,
        reservedForResponse: 4096,
        usedTokens: 0,
      },
    };

    // 运行配置
    const config = {
      configurable: {
        thread_id: sessionKey,
      },
    };

    try {
      // 使用 stream 模式
      const stream = await this.graph.stream(initialState, config);

      let finalState: AgentState | null = null;

      for await (const event of stream) {
        // 处理每个节点的输出
        for (const [nodeName, nodeOutput] of Object.entries(event)) {
          // 发送内容块（如果有）
          if (
            nodeName === "thinking" &&
            nodeOutput &&
            typeof nodeOutput === "object" &&
            "messages" in nodeOutput
          ) {
            const messages = nodeOutput.messages as Array<{ content: unknown }>;
            for (const m of messages) {
              if (m.content && typeof m.content === "string") {
                await callbacks.onChunk(m.content);
              }
            }
          }
        }
      }

      // 获取最终状态
      const stateSnapshot = await this.graph.getState(config);
      finalState = stateSnapshot.values as AgentState;

      await callbacks.onComplete();
      return finalState;
    } catch (error) {
      await callbacks.onError?.(error as Error);
      throw error;
    }
  }

  /**
   * 获取会话状态
   */
  async getSessionState(threadId: string): Promise<AgentState | null> {
    const config = {
      configurable: {
        thread_id: threadId,
      },
    };

    const stateSnapshot = await this.graph.getState(config);
    return (stateSnapshot.values as AgentState) ?? null;
  }

  /**
   * 清除会话
   */
  async clearSession(threadId: string): Promise<void> {
    // MemorySaver 没有直接的删除 API，需要重新初始化
    const config = {
      configurable: {
        thread_id: threadId,
      },
    };

    // 通过存储空状态来实现清除
    await this.graph.updateState(config, {
      messages: [],
      iterations: 0,
      reasoningChain: [],
      actionHistory: [],
      observations: [],
      errors: [],
      consecutiveErrors: 0,
      tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    } as Partial<AgentState>);
  }
}

export type { AgentState, LangGraphAgentConfig, InboundMessage, StreamCallbacks, StateChangeCallbacks };
