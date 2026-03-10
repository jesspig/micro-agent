/**
 * Tools 节点
 *
 * 职责：
 * 1. 执行工具调用
 * 2. 处理执行结果
 * 3. 错误追踪
 */

import { ToolMessage } from "@langchain/core/messages";
import type { RunnableConfig } from "@langchain/core/runnables";
import type { AgentState, AgentStateUpdate } from "../state";
import type { LangGraphAgentConfig, ToolCall, ToolContext } from "../types";
import type { ContentPart } from "../../../types/tool";

/**
 * 提取工具结果内容
 */
function extractToolResultContent(content: ContentPart[]): string {
  return content
    .filter((c): c is { type: "text"; text: string } => c.type === "text")
    .map((c) => c.text)
    .join("\n");
}

/**
 * 创建 Tools 节点
 */
export function createToolsNode(config: LangGraphAgentConfig) {
  const { toolRegistry, workspace, knowledgeBase } = config;

  return async (state: AgentState, _runConfig?: RunnableConfig): Promise<AgentStateUpdate> => {
    if (state.pendingToolCalls.length === 0) {
      return {};
    }

    // 构建工具上下文
    const toolContext: ToolContext = {
      channel: state.channel,
      chatId: state.chatId,
      workspace,
      currentDir: workspace,
      knowledgeBase,
      sendToBus: async () => {},
    };

    const results: Array<{
      call: ToolCall;
      result: { content: string; isError?: boolean };
    }> = [];

    let consecutiveErrors = state.consecutiveErrors;

    // 并行执行工具（最多 5 个并发）
    const batchSize = 5;
    for (let i = 0; i < state.pendingToolCalls.length; i += batchSize) {
      const batch = state.pendingToolCalls.slice(i, i + batchSize);

      const batchResults = await Promise.all(
        batch.map(async (toolCall) => {
          try {
            const result = await toolRegistry.execute(toolCall.name, toolCall.arguments, toolContext);
            const content = extractToolResultContent(result.content);
            return {
              call: toolCall,
              result: {
                content,
                isError: result.isError,
              },
            };
          } catch (error) {
            return {
              call: toolCall,
              result: {
                content: `工具执行失败: ${(error as Error).message}`,
                isError: true,
              },
            };
          }
        })
      );

      results.push(...batchResults);

      // 更新连续错误计数
      for (const { result } of batchResults) {
        if (result.isError || result.content.includes("错误") || result.content.includes("失败")) {
          consecutiveErrors++;
        } else {
          consecutiveErrors = 0;
        }
      }
    }

    return {
      lastToolResults: results,
      consecutiveErrors,
      pendingToolCalls: [],
    };
  };
}
