/**
 * Thinking 节点
 *
 * 职责：
 * 1. 调用 LLM
 * 2. 处理响应
 * 3. 提取工具调用
 * 4. 更新 Token 使用统计
 */

import { AIMessage, type BaseMessage } from "@langchain/core/messages";
import type { RunnableConfig } from "@langchain/core/runnables";
import type { AgentState, AgentStateUpdate } from "../state";
import type { LangGraphAgentConfig, LLMMessage, ToolCall, ReActState } from "../types";

/**
 * 将 LangGraph 消息转换为 LLM 消息格式
 */
function convertToLLMMessage(msg: BaseMessage): LLMMessage {
  const role = msg._getType() as "system" | "user" | "assistant" | "tool";
  const content = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);

  const llmMsg: LLMMessage = {
    role,
    content,
  };

  // 处理工具调用
  if (role === "assistant" && "tool_calls" in msg && msg.tool_calls) {
    llmMsg.toolCalls = (msg.tool_calls as Array<{ id: string; name: string; args: Record<string, unknown> }>).map(
      (tc) => ({
        id: tc.id,
        name: tc.name,
        arguments: tc.args,
      })
    );
  }

  // 处理工具消息
  if (role === "tool" && "tool_call_id" in msg) {
    llmMsg.toolCallId = msg.tool_call_id as string;
  }

  return llmMsg;
}

/**
 * 创建 Thinking 节点
 */
export function createThinkingNode(config: LangGraphAgentConfig) {
  const { llmProvider, toolRegistry, tokenBudget } = config;

  return async (state: AgentState, _runConfig?: RunnableConfig): Promise<AgentStateUpdate> => {
    // 1. 检查 Token 预算
    const budget = state.tokenBudget.maxContextTokens || tokenBudget;
    const used = state.tokenUsage.totalTokens;
    const remaining = budget - used;

    if (remaining <= 1000) {
      return {
        lastError: "Token 预算已用尽，请简化请求或开始新会话。",
        reactState: "error",
      };
    }

    // 2. 构建消息
    const messages: LLMMessage[] = [
      { role: "system", content: state.systemPrompt || config.systemPrompt },
      ...state.messages.map((m) => convertToLLMMessage(m as BaseMessage)),
    ];

    // 3. 获取工具定义
    const toolDefinitions = toolRegistry.getDefinitions().map((def) => ({
      type: "function" as const,
      function: {
        name: def.name,
        description: def.description,
        parameters: def.inputSchema,
      },
    }));

    // 4. 调用 LLM
    const response = await llmProvider.chat(
      messages,
      toolDefinitions,
      config.defaultModel,
      {}
    );

    // 5. 更新 Token 使用量
    const newTokens = response.usage?.totalTokens ?? 0;
    const tokenUpdate = {
      promptTokens: response.usage?.promptTokens ?? 0,
      completionTokens: response.usage?.completionTokens ?? 0,
      totalTokens: newTokens,
    };

    // 6. 创建 AI 消息
    const aiMessage = new AIMessage({
      content: response.content,
      tool_calls: response.toolCalls?.map((tc) => ({
        id: tc.id,
        name: tc.name,
        args: tc.arguments,
      })),
    });

    // 7. 记录推理步骤
    const reasoningStep = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      timestamp: Date.now(),
      thought: response.content ?? response.reasoning ?? "",
      confidence: 0.8,
      state: (response.hasToolCalls ? "acting" : "completed") as ReActState,
    };

    return {
      messages: [aiMessage],
      iterations: state.iterations + 1,
      tokenUsage: tokenUpdate,
      pendingToolCalls: response.toolCalls ?? [],
      reasoningChain: [reasoningStep],
      lastError: null,
      reactState: response.hasToolCalls ? "acting" : "completed",
    };
  };
}
