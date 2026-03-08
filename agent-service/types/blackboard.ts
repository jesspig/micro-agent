/**
 * 黑板类型定义
 *
 * 用于 ReAct 循环的多阶段数据共享。
 */

import type { ToolResult, ToolCall } from './tool';

/** ReAct 状态 */
export type ReActState = 'thinking' | 'acting' | 'observing' | 'completed' | 'error';

/** 推理步骤 */
export interface ReasoningStep {
  /** 步骤 ID */
  id: string;
  /** 时间戳 */
  timestamp: number;
  /** 思考内容 */
  thought: string;
  /** 置信度 (0-1) */
  confidence?: number;
  /** 当前状态 */
  state: ReActState;
}

/** 行动记录状态 */
export type ActionState = 'pending' | 'running' | 'completed' | 'failed';

/** 行动记录 */
export interface ActionRecord {
  /** 记录 ID */
  id: string;
  /** 工具调用 ID */
  toolCallId: string;
  /** 工具名称 */
  toolName: string;
  /** 工具参数 */
  arguments: Record<string, unknown>;
  /** 时间戳 */
  timestamp: number;
  /** 执行状态 */
  state: ActionState;
}

/** 观察结果 */
export interface Observation {
  /** 观察 ID */
  id: string;
  /** 关联的行动 ID */
  actionId: string;
  /** 工具执行结果 */
  result: ToolResult;
  /** 时间戳 */
  timestamp: number;
  /** 结果摘要（可选） */
  summary?: string;
}

/** 计划步骤 */
export interface PlanStep {
  /** 步骤 ID */
  id: string;
  /** 步骤描述 */
  description: string;
  /** 是否完成 */
  completed: boolean;
  /** 关联的行动 ID */
  actionId?: string;
}

/** 执行计划 */
export interface Plan {
  /** 计划 ID */
  id: string;
  /** 目标描述 */
  goal: string;
  /** 步骤列表 */
  steps: PlanStep[];
  /** 创建时间 */
  createdAt: number;
}

/** 错误记录 */
export interface ErrorRecord {
  /** 错误 ID */
  id: string;
  /** 错误对象 */
  error: Error;
  /** 错误上下文 */
  context?: string;
  /** 时间戳 */
  timestamp: number;
  /** 关联的行动 ID */
  actionId?: string;
}

/** 会话状态 */
export interface SessionState {
  /** 当前迭代次数 */
  iterations: number;
  /** 最大迭代次数 */
  maxIterations: number;
  /** 开始时间 */
  startTime: number;
  /** 最后更新时间 */
  lastUpdateTime: number;
}

/** 黑板快照 */
export interface BlackboardSnapshot {
  /** 推理链 */
  reasoningChain: ReasoningStep[];
  /** 行动历史 */
  actionHistory: ActionRecord[];
  /** 观察结果 */
  observations: Observation[];
  /** 当前计划 */
  currentPlan: Plan | null;
  /** 会话状态 */
  sessionState: SessionState;
  /** 错误记录 */
  errors: ErrorRecord[];
  /** 快照创建时间 */
  snapshotTime: number;
}

/** 黑板数据结构 */
export interface BlackboardData {
  /** 推理链 - 记录所有思考过程 */
  reasoningChain: ReasoningStep[];
  /** 行动历史 - 记录所有工具调用 */
  actionHistory: ActionRecord[];
  /** 观察结果 - 记录工具执行结果 */
  observations: Observation[];
  /** 当前计划 */
  currentPlan: Plan | null;
  /** 工具执行结果缓存 */
  toolResults: Map<string, ToolResult>;
  /** 会话状态 */
  sessionState: SessionState;
  /** 错误记录 */
  errors: ErrorRecord[];
}

/** 黑板操作接口 */
export interface BlackboardOperations {
  // === 读取操作 ===

  /** 获取完整推理链 */
  getReasoningChain(): ReasoningStep[];
  /** 获取完整行动历史 */
  getActionHistory(): ActionRecord[];
  /** 获取完整观察结果 */
  getObservations(): Observation[];
  /** 获取最后一条思考 */
  getLastThought(): ReasoningStep | null;
  /** 获取最后一条行动 */
  getLastAction(): ActionRecord | null;
  /** 获取最后一条观察 */
  getLastObservation(): Observation | null;

  // === 写入操作 ===

  /** 添加推理步骤 */
  addReasoningStep(thought: string, confidence?: number): string;
  /** 添加行动记录 */
  addAction(toolCall: ToolCall): string;
  /** 更新行动状态 */
  updateActionStatus(actionId: string, status: ActionState): void;
  /** 添加观察结果 */
  addObservation(actionId: string, result: ToolResult, summary?: string): string;
  /** 设置当前计划 */
  setCurrentPlan(plan: Plan): void;

  // === 查询操作 ===

  /** 查找相似观察（基于关键词匹配） */
  findSimilarObservations(query: string): Observation[];
  /** 按工具名称获取行动记录 */
  getActionsByTool(toolName: string): ActionRecord[];
  /** 获取错误计数 */
  getErrorCount(): number;

  // === 状态管理 ===

  /** 增加迭代次数并返回新值 */
  incrementIteration(): number;
  /** 检查是否达到最大迭代 */
  isMaxIterations(): boolean;
  /** 记录错误 */
  recordError(error: Error, context?: string, actionId?: string): string;

  // === 快照操作 ===

  /** 创建快照 */
  createSnapshot(): BlackboardSnapshot;
  /** 从快照恢复 */
  restoreFromSnapshot(snapshot: BlackboardSnapshot): void;

  // === 工具结果缓存 ===

  /** 缓存工具结果 */
  cacheToolResult(toolCallId: string, result: ToolResult): void;
  /** 获取缓存的工具结果 */
  getCachedToolResult(toolCallId: string): ToolResult | undefined;
}

/** 黑板接口（数据 + 操作） */
export interface Blackboard extends BlackboardData, BlackboardOperations {
  /** 黑板 ID */
  readonly id: string;
  /** 重置黑板 */
  reset(): void;
}
