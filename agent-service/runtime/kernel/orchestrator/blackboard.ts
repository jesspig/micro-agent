/**
 * 黑板实现
 *
 * ReAct 循环的多阶段数据共享中心。
 * 遵循单一职责原则：只负责数据存储和查询。
 */

import type {
  Blackboard,
  BlackboardSnapshot,
  ReasoningStep,
  ActionRecord,
  ActionState,
  Observation,
  Plan,
  SessionState,
  ErrorRecord,
  ReActState,
} from '../../../types/blackboard';
import type { ToolResult, ToolCall } from '../../../types/tool';

/** 生成唯一 ID */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * 黑板实现类
 */
export class BlackboardImpl implements Blackboard {
  readonly id: string;

  // 数据存储
  reasoningChain: ReasoningStep[] = [];
  actionHistory: ActionRecord[] = [];
  observations: Observation[] = [];
  currentPlan: Plan | null = null;
  toolResults: Map<string, ToolResult> = new Map();
  sessionState: SessionState;
  errors: ErrorRecord[] = [];

  constructor(maxIterations: number = 10) {
    this.id = generateId();
    this.sessionState = {
      iterations: 0,
      maxIterations,
      startTime: Date.now(),
      lastUpdateTime: Date.now(),
    };
  }

  // === 读取操作 ===

  getReasoningChain(): ReasoningStep[] {
    return [...this.reasoningChain];
  }

  getActionHistory(): ActionRecord[] {
    return [...this.actionHistory];
  }

  getObservations(): Observation[] {
    return [...this.observations];
  }

  getLastThought(): ReasoningStep | null {
    return this.reasoningChain.length > 0
      ? this.reasoningChain[this.reasoningChain.length - 1]
      : null;
  }

  getLastAction(): ActionRecord | null {
    return this.actionHistory.length > 0
      ? this.actionHistory[this.actionHistory.length - 1]
      : null;
  }

  getLastObservation(): Observation | null {
    return this.observations.length > 0
      ? this.observations[this.observations.length - 1]
      : null;
  }

  // === 写入操作 ===

  addReasoningStep(thought: string, confidence?: number): string {
    const id = generateId();
    const state: ReActState = 'thinking';

    this.reasoningChain.push({
      id,
      timestamp: Date.now(),
      thought,
      confidence,
      state,
    });

    this.updateTimestamp();
    return id;
  }

  addAction(toolCall: ToolCall): string {
    const id = generateId();

    this.actionHistory.push({
      id,
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      arguments: toolCall.arguments,
      timestamp: Date.now(),
      state: 'pending',
    });

    this.updateTimestamp();
    return id;
  }

  updateActionStatus(actionId: string, status: ActionState): void {
    const action = this.actionHistory.find(a => a.id === actionId);
    if (action) {
      action.state = status;
      this.updateTimestamp();
    }
  }

  addObservation(actionId: string, result: ToolResult, summary?: string): string {
    const id = generateId();

    this.observations.push({
      id,
      actionId,
      result,
      timestamp: Date.now(),
      summary,
    });

    // 缓存工具结果
    const action = this.actionHistory.find(a => a.id === actionId);
    if (action) {
      this.toolResults.set(action.toolCallId, result);
      // 更新行动状态
      action.state = result.isError ? 'failed' : 'completed';
    }

    this.updateTimestamp();
    return id;
  }

  setCurrentPlan(plan: Plan): void {
    this.currentPlan = plan;
    this.updateTimestamp();
  }

  // === 查询操作 ===

  findSimilarObservations(query: string): Observation[] {
    const queryLower = query.toLowerCase();
    return this.observations.filter(obs => {
      // 搜索结果内容
      const resultText = JSON.stringify(obs.result).toLowerCase();
      if (resultText.includes(queryLower)) return true;

      // 搜索摘要
      if (obs.summary?.toLowerCase().includes(queryLower)) return true;

      return false;
    });
  }

  getActionsByTool(toolName: string): ActionRecord[] {
    return this.actionHistory.filter(a => a.toolName === toolName);
  }

  getErrorCount(): number {
    return this.errors.length;
  }

  // === 状态管理 ===

  incrementIteration(): number {
    this.sessionState.iterations++;
    this.updateTimestamp();
    return this.sessionState.iterations;
  }

  isMaxIterations(): boolean {
    return this.sessionState.iterations >= this.sessionState.maxIterations;
  }

  recordError(error: Error, context?: string, actionId?: string): string {
    const id = generateId();

    this.errors.push({
      id,
      error,
      context,
      timestamp: Date.now(),
      actionId,
    });

    this.updateTimestamp();
    return id;
  }

  // === 快照操作 ===

  createSnapshot(): BlackboardSnapshot {
    return {
      reasoningChain: [...this.reasoningChain],
      actionHistory: [...this.actionHistory],
      observations: [...this.observations],
      currentPlan: this.currentPlan,
      sessionState: { ...this.sessionState },
      errors: [...this.errors],
      snapshotTime: Date.now(),
    };
  }

  restoreFromSnapshot(snapshot: BlackboardSnapshot): void {
    this.reasoningChain = [...snapshot.reasoningChain];
    this.actionHistory = [...snapshot.actionHistory];
    this.observations = [...snapshot.observations];
    this.currentPlan = snapshot.currentPlan;
    this.sessionState = { ...snapshot.sessionState };
    this.errors = [...snapshot.errors];

    // 重建工具结果缓存
    this.toolResults.clear();
    for (const action of this.actionHistory) {
      const obs = this.observations.find(o => o.actionId === action.id);
      if (obs) {
        this.toolResults.set(action.toolCallId, obs.result);
      }
    }

    this.updateTimestamp();
  }

  // === 工具结果缓存 ===

  cacheToolResult(toolCallId: string, result: ToolResult): void {
    this.toolResults.set(toolCallId, result);
  }

  getCachedToolResult(toolCallId: string): ToolResult | undefined {
    return this.toolResults.get(toolCallId);
  }

  // === 辅助方法 ===

  reset(): void {
    this.reasoningChain = [];
    this.actionHistory = [];
    this.observations = [];
    this.currentPlan = null;
    this.toolResults.clear();
    this.errors = [];
    this.sessionState = {
      iterations: 0,
      maxIterations: this.sessionState.maxIterations,
      startTime: Date.now(),
      lastUpdateTime: Date.now(),
    };
  }

  private updateTimestamp(): void {
    this.sessionState.lastUpdateTime = Date.now();
  }
}

/**
 * 创建黑板实例
 */
export function createBlackboard(maxIterations?: number): Blackboard {
  return new BlackboardImpl(maxIterations);
}
