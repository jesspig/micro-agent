/**
 * Observe 节点
 *
 * 职责：
 * 1. 将工具结果添加到消息历史
 * 2. 记录观察结果
 */

import { AIMessage, ToolMessage } from "@langchain/core/messages";
import type { RunnableConfig } from "@langchain/core/runnables";
import type { AgentState, AgentStateUpdate } from "../state";
import type { Observation } from "../types";

/**
 * 创建 Observe 节点
 */
export function createObserveNode() {
  return async (state: AgentState, _runConfig?: RunnableConfig): Promise<AgentStateUpdate> => {
    if (state.lastToolResults.length === 0) {
      return {};
    }

    // 构建新的消息
    const newMessages: Array<AIMessage | ToolMessage> = [];
    const observations: Observation[] = [];

    for (const { call, result } of state.lastToolResults) {
      // 添加工具结果消息
      const toolMessage = new ToolMessage({
        content: result.content,
        tool_call_id: call.id,
      });
      newMessages.push(toolMessage);

      // 记录观察结果
      observations.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        actionId: call.id,
        summary: result.content.slice(0, 200),
        timestamp: Date.now(),
        isError: result.isError ?? false,
      });
    }

    return {
      messages: newMessages,
      observations,
      lastToolResults: [],
      reactState: "observing",
    };
  };
}
