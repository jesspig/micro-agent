/**
 * 条件边：判断下一步路由
 *
 * 决策逻辑：
 * 1. 检查是否有错误需要终止
 * 2. 检查是否达到最大迭代
 * 3. 检查是否需要执行工具
 */

import { END } from "@langchain/langgraph";
import type { AgentState } from "../state";

/** 路由决策类型 */
export type RouteDecision = "tools" | "end" | "error";

/**
 * 创建条件边
 */
export function createShouldContinueEdge(config?: { maxConsecutiveErrors?: number }) {
  const maxConsecutiveErrors = config?.maxConsecutiveErrors ?? 3;

  return (state: AgentState): RouteDecision => {
    // 1. 错误终止条件
    if (state.consecutiveErrors >= maxConsecutiveErrors) {
      return "error";
    }

    // 2. Token 预算耗尽
    if (state.lastError?.includes("Token 预算")) {
      return "error";
    }

    // 3. 达到最大迭代
    if (state.iterations >= state.maxIterations) {
      return "end";
    }

    // 4. 已完成状态
    if (state.reactState === "completed") {
      return "end";
    }

    // 5. 检查是否有待执行的工具调用
    if (state.pendingToolCalls.length > 0) {
      return "tools";
    }

    // 6. 没有工具调用，结束
    return "end";
  };
}
