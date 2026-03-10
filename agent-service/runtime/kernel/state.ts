/**
 * LangGraph 状态定义
 *
 * 用于 ReAct Agent 的状态管理模式。
 * 兼容 @langchain/langgraph 的 Annotation 系统。
 */

import { Annotation, MessagesAnnotation } from "@langchain/langgraph";
import type {
  ReActState,
  ReasoningStep,
  ActionRecord,
  Observation,
  ErrorRecord,
  TokenUsage,
  TokenBudget,
  ToolCall,
} from "./types";
import type { ExecutionPlan } from "./nodes/planner-node";

// ============================================================================
// 状态 Schema 定义
// ============================================================================

/**
 * ReAct Agent 状态定义
 *
 * 【设计说明】
 * 1. messages: 使用 MessagesAnnotation 的 reducer，自动追加消息
 * 2. iterations: 简单计数器，每次节点执行直接覆盖
 * 3. reasoning/observations: 使用自定义 reducer 实现追加
 * 4. errors: 错误记录，使用 reducer 追加
 * 5. budget: Token 预算，直接覆盖
 */
export const ReActAgentState = Annotation.Root({
  // ===== 消息历史 =====
  // 复用 MessagesAnnotation 的消息处理逻辑
  // 自动追加消息，支持所有 BaseMessage 子类型
  ...MessagesAnnotation.spec,

  // ===== 会话标识 =====
  /** 会话键 */
  sessionKey: Annotation<string>({
    default: () => "",
    reducer: (_, y) => y,
  }),

  /** 通道类型 */
  channel: Annotation<string>({
    default: () => "",
    reducer: (_, y) => y,
  }),

  /** 聊天 ID */
  chatId: Annotation<string>({
    default: () => "",
    reducer: (_, y) => y,
  }),

  // ===== ReAct 循环控制 =====
  /** 当前迭代次数 */
  iterations: Annotation<number>({
    default: () => 0,
    reducer: (_, y) => y,
  }),

  /** 最大迭代次数 */
  maxIterations: Annotation<number>({
    default: () => 10,
    reducer: (_, y) => y,
  }),

  // ===== 推理与行动追踪 =====
  /** 推理步骤链 */
  reasoningChain: Annotation<ReasoningStep[]>({
    default: () => [],
    reducer: (x, y) => x.concat(y),
  }),

  /** 行动记录 */
  actionHistory: Annotation<ActionRecord[]>({
    default: () => [],
    reducer: (x, y) => x.concat(y),
  }),

  /** 观察结果 */
  observations: Annotation<Observation[]>({
    default: () => [],
    reducer: (x, y) => x.concat(y),
  }),

  // ===== 待处理的工具调用 =====
  /** 当前轮次的工具调用 */
  pendingToolCalls: Annotation<ToolCall[]>({
    default: () => [],
    reducer: (_, y) => y,
  }),

  /** 最近一次工具调用结果 */
  lastToolResults: Annotation<Array<{ call: ToolCall; result: { content: string; isError?: boolean } }>>({
    default: () => [],
    reducer: (_, y) => y,
  }),

  // ===== 错误处理 =====
  /** 错误记录 */
  errors: Annotation<ErrorRecord[]>({
    default: () => [],
    reducer: (x, y) => x.concat(y),
  }),

  /** 连续错误计数 */
  consecutiveErrors: Annotation<number>({
    default: () => 0,
    reducer: (_, y) => y,
  }),

  /** 最大连续错误数 */
  maxConsecutiveErrors: Annotation<number>({
    default: () => 3,
    reducer: (_, y) => y,
  }),

  /** 最近错误信息 */
  lastError: Annotation<string | null>({
    default: () => null,
    reducer: (_, y) => y,
  }),

  // ===== Token 预算 =====
  /** Token 使用统计 */
  tokenUsage: Annotation<TokenUsage>({
    default: () => ({ promptTokens: 0, completionTokens: 0, totalTokens: 0 }),
    reducer: (x, y) => ({
      promptTokens: x.promptTokens + y.promptTokens,
      completionTokens: x.completionTokens + y.completionTokens,
      totalTokens: x.totalTokens + y.totalTokens,
    }),
  }),

  /** Token 预算配置 */
  tokenBudget: Annotation<TokenBudget>({
    default: () => ({
      maxContextTokens: 128000,
      reservedForResponse: 4096,
      usedTokens: 0,
    }),
    reducer: (_, y) => y,
  }),

  // ===== 上下文构建 =====
  /** 系统提示词 */
  systemPrompt: Annotation<string>({
    default: () => "",
    reducer: (_, y) => y,
  }),

  /** 检索到的记忆 */
  retrievedMemories: Annotation<Array<{ type: string; content: string }>>({
    default: () => [],
    reducer: (_, y) => y,
  }),

  /** 检索到的知识 */
  retrievedKnowledge: Annotation<Array<{ document: { path: string; content: string }; score: number }>>({
    default: () => [],
    reducer: (_, y) => y,
  }),

  // ===== 流式控制 =====
  /** 是否启用流式响应 */
  isStreaming: Annotation<boolean>({
    default: () => false,
    reducer: (_, y) => y,
  }),

  // ===== 执行计划 =====
  /** 执行计划 */
  executionPlan: Annotation<ExecutionPlan | null>({
    default: () => null,
    reducer: (_, y) => y,
  }),

  /** 当前执行的任务 ID */
  currentTaskId: Annotation<string>({
    default: () => "",
    reducer: (_, y) => y,
  }),

  /** 已完成的任务 ID 列表 */
  completedTasks: Annotation<string[]>({
    default: () => [],
    reducer: (x, y) => x.concat(y),
  }),

  /** 失败的任务 ID 列表 */
  failedTasks: Annotation<string[]>({
    default: () => [],
    reducer: (x, y) => x.concat(y),
  }),

  // ===== 元数据 =====
  /** 当前 ReAct 状态 */
  reactState: Annotation<ReActState>({
    default: () => "thinking",
    reducer: (_, y) => y,
  }),

  /** 会话元数据 */
  metadata: Annotation<Record<string, unknown>>({
    default: () => ({}),
    reducer: (x, y) => ({ ...x, ...y }),
  }),
});

// ============================================================================
// 类型导出
// ============================================================================

/** ReAct Agent 状态类型（从 Annotation 推断） */
export type AgentState = typeof ReActAgentState.State;

/** ReAct Agent 更新类型（用于节点返回） */
export type AgentStateUpdate = typeof ReActAgentState.Update;

// ============================================================================
// 状态访问辅助函数
// ============================================================================

/**
 * 检查是否有待处理的工具调用
 */
export function hasPendingToolCalls(state: AgentState): boolean {
  return state.pendingToolCalls.length > 0;
}

/**
 * 获取 Token 预算剩余量
 */
export function getRemainingTokens(state: AgentState): number {
  const { tokenBudget, tokenUsage } = state;
  return tokenBudget.maxContextTokens - tokenBudget.reservedForResponse - tokenUsage.totalTokens;
}

/**
 * 检查是否超出 Token 预算
 */
export function isOverBudget(state: AgentState): boolean {
  return getRemainingTokens(state) <= 0;
}

// ============================================================================
// 状态更新工厂函数
// ============================================================================

/** 生成唯一 ID */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** 创建推理步骤更新 */
export function createReasoningUpdate(thought: string, confidence?: number): AgentStateUpdate {
  return {
    reasoningChain: [
      {
        id: generateId(),
        timestamp: Date.now(),
        thought,
        confidence,
        state: "thinking" as ReActState,
      },
    ],
  };
}

/** 创建行动记录更新 */
export function createActionUpdate(toolCall: ToolCall): AgentStateUpdate {
  return {
    actionHistory: [
      {
        id: generateId(),
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        arguments: toolCall.arguments,
        timestamp: Date.now(),
        state: "pending" as const,
      },
    ],
    reactState: "acting" as ReActState,
  };
}

/** 创建观察结果更新 */
export function createObservationUpdate(actionId: string, summary: string, isError: boolean): AgentStateUpdate {
  return {
    observations: [
      {
        id: generateId(),
        actionId,
        summary,
        timestamp: Date.now(),
        isError,
      },
    ],
    reactState: "observing" as ReActState,
  };
}

/** 创建错误更新 */
export function createErrorUpdate(message: string, type: string, actionId?: string): AgentStateUpdate {
  return {
    errors: [
      {
        id: generateId(),
        message,
        type,
        timestamp: Date.now(),
        actionId,
      },
    ],
    reactState: "error" as ReActState,
  };
}

/** 创建完成更新 */
export function createCompletionUpdate(): AgentStateUpdate {
  return {
    reactState: "completed" as ReActState,
  };
}

// ============================================================================
// 计划状态辅助函数
// ============================================================================

/**
 * 检查是否有执行计划
 */
export function hasExecutionPlan(state: AgentState): boolean {
  return state.executionPlan !== null;
}

/**
 * 获取当前批次可执行的任务
 */
export function getReadyTasks(state: AgentState): string[] {
  if (!state.executionPlan) return [];

  const { subTasks, executionOrder, currentBatchIndex } = state.executionPlan;
  if (currentBatchIndex >= executionOrder.length) return [];

  const batchTaskIds = executionOrder[currentBatchIndex];
  return batchTaskIds.filter(taskId => {
    const task = subTasks.find(t => t.id === taskId);
    return task && task.status === "pending";
  });
}

/**
 * 检查计划是否已完成
 */
export function isPlanCompleted(state: AgentState): boolean {
  if (!state.executionPlan) return false;

  const { subTasks } = state.executionPlan;
  return subTasks.every(task =>
    task.status === "completed" || task.status === "skipped"
  );
}

/**
 * 获取计划进度
 */
export function getPlanProgress(state: AgentState): {
  total: number;
  completed: number;
  failed: number;
  pending: number;
} {
  if (!state.executionPlan) {
    return { total: 0, completed: 0, failed: 0, pending: 0 };
  }

  const { subTasks } = state.executionPlan;
  return {
    total: subTasks.length,
    completed: subTasks.filter(t => t.status === "completed").length,
    failed: subTasks.filter(t => t.status === "failed").length,
    pending: subTasks.filter(t => t.status === "pending").length,
  };
}

/** 创建计划更新 */
export function createPlanUpdate(plan: ExecutionPlan): AgentStateUpdate {
  return {
    executionPlan: plan,
    completedTasks: [],
    failedTasks: [],
  };
}

/** 创建任务完成更新 */
export function createTaskCompleteUpdate(taskId: string): AgentStateUpdate {
  return {
    completedTasks: [taskId],
    currentTaskId: "",
  };
}

/** 创建任务失败更新 */
export function createTaskFailedUpdate(taskId: string): AgentStateUpdate {
  return {
    failedTasks: [taskId],
    currentTaskId: "",
  };
}
