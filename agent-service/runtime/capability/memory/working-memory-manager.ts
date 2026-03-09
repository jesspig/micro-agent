/**
 * 工作记忆管理器
 *
 * 管理活跃目标和任务上下文，支持 ReAct 循环中的任务跟踪。
 */

import type { WorkingMemory, Goal, SubTask } from '../../../types/blackboard';
import { getLogger } from '@logtape/logtape';
import { z } from 'zod';

const log = getLogger(['memory', 'working-memory']);

// === Zod 校验模式 ===

/** 目标创建参数校验 */
const CreateGoalSchema = z.object({
  description: z.string().min(1, '目标描述不能为空'),
  priority: z.number().int().min(1).max(10).default(5),
});

/** 目标更新参数校验 */
const UpdateGoalSchema = z.object({
  description: z.string().min(1, '目标描述不能为空').optional(),
  priority: z.number().int().min(1).max(10).optional(),
  status: z.enum(['active', 'completed', 'abandoned']).optional(),
});

/** 子任务创建参数校验 */
const CreateSubTaskSchema = z.object({
  goalId: z.string().min(1, '目标 ID 不能为空'),
  description: z.string().min(1, '子任务描述不能为空'),
});

/** 子任务更新参数校验 */
const UpdateSubTaskSchema = z.object({
  description: z.string().min(1, '子任务描述不能为空').optional(),
  status: z.enum(['pending', 'in_progress', 'completed', 'failed']).optional(),
});

// === 类型定义 ===

/** 创建目标参数 */
export type CreateGoalParams = z.infer<typeof CreateGoalSchema>;

/** 更新目标参数 */
export type UpdateGoalParams = z.infer<typeof UpdateGoalSchema>;

/** 创建子任务参数 */
export type CreateSubTaskParams = z.infer<typeof CreateSubTaskSchema>;

/** 更新子任务参数 */
export type UpdateSubTaskParams = z.infer<typeof UpdateSubTaskSchema>;

/** 工作记忆管理器配置 */
export interface WorkingMemoryManagerConfig {
  /** 最大活跃目标数 */
  maxActiveGoals?: number;
  /** 最大子任务数 */
  maxSubTasks?: number;
  /** 自动清理已完成目标 */
  autoCleanupCompleted?: boolean;
  /** 已完成目标保留时间（毫秒） */
  completedRetentionTime?: number;
}

/** 默认配置 */
const DEFAULT_CONFIG: Required<WorkingMemoryManagerConfig> = {
  maxActiveGoals: 5,
  maxSubTasks: 20,
  autoCleanupCompleted: true,
  completedRetentionTime: 300000, // 5 分钟
};

/**
 * 生成唯一 ID
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * 工作记忆管理器
 *
 * 职责：
 * - 管理活跃目标的添加、更新、状态变更
 * - 管理子任务的创建和状态跟踪
 * - 提供临时上下文存储能力
 * - 支持工作记忆快照和恢复
 */
export class WorkingMemoryManager {
  private config: Required<WorkingMemoryManagerConfig>;
  private memory: WorkingMemory;

  constructor(config?: WorkingMemoryManagerConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.memory = {
      goals: [],
      activeSubTasks: [],
      context: {},
      lastUpdated: Date.now(),
    };
  }

  // === 目标管理 ===

  /**
   * 添加新目标
   *
   * @param params 目标参数
   * @returns 目标 ID
   * @throws 如果校验失败或达到最大目标数
   */
  addGoal(params: CreateGoalParams): string {
    const validated = CreateGoalSchema.parse(params);

    // 检查活跃目标数量
    const activeGoals = this.memory.goals.filter(g => g.status === 'active');
    if (activeGoals.length >= this.config.maxActiveGoals) {
      log.warn('已达到最大活跃目标数', {
        max: this.config.maxActiveGoals,
        current: activeGoals.length,
      });
      throw new Error(`已达到最大活跃目标数 (${this.config.maxActiveGoals})`);
    }

    const id = generateId();
    const now = Date.now();

    const goal: Goal = {
      id,
      description: validated.description,
      status: 'active',
      priority: validated.priority,
      createdAt: now,
      updatedAt: now,
    };

    this.memory.goals.push(goal);
    this.updateTimestamp();

    log.info('目标已添加', {
      id,
      description: validated.description,
      priority: validated.priority,
    });

    return id;
  }

  /**
   * 更新目标
   *
   * @param goalId 目标 ID
   * @param params 更新参数
   * @returns 是否更新成功
   */
  updateGoal(goalId: string, params: UpdateGoalParams): boolean {
    const validated = UpdateGoalSchema.parse(params);

    const goal = this.memory.goals.find(g => g.id === goalId);
    if (!goal) {
      log.warn('目标不存在', { goalId });
      return false;
    }

    // 应用更新
    if (validated.description !== undefined) {
      goal.description = validated.description;
    }
    if (validated.priority !== undefined) {
      goal.priority = validated.priority;
    }
    if (validated.status !== undefined) {
      goal.status = validated.status;
    }
    goal.updatedAt = Date.now();

    this.updateTimestamp();

    log.debug('目标已更新', { goalId, updates: validated });

    // 状态变更处理
    if (validated.status === 'completed') {
      this.handleGoalCompletion(goalId);
    }

    return true;
  }

  /**
   * 标记目标为完成
   *
   * @param goalId 目标 ID
   * @returns 是否操作成功
   */
  completeGoal(goalId: string): boolean {
    return this.updateGoal(goalId, { status: 'completed' });
  }

  /**
   * 放弃目标
   *
   * @param goalId 目标 ID
   * @returns 是否操作成功
   */
  abandonGoal(goalId: string): boolean {
    return this.updateGoal(goalId, { status: 'abandoned' });
  }

  /**
   * 获取目标
   *
   * @param goalId 目标 ID
   * @returns 目标或 undefined
   */
  getGoal(goalId: string): Goal | undefined {
    return this.memory.goals.find(g => g.id === goalId);
  }

  /**
   * 获取所有活跃目标（按优先级排序）
   *
   * @returns 活跃目标列表
   */
  getActiveGoals(): Goal[] {
    return this.memory.goals
      .filter(g => g.status === 'active')
      .sort((a, b) => b.priority - a.priority);
  }

  /**
   * 获取所有目标
   *
   * @returns 目标列表
   */
  getAllGoals(): Goal[] {
    return [...this.memory.goals];
  }

  // === 子任务管理 ===

  /**
   * 添加子任务
   *
   * @param params 子任务参数
   * @returns 子任务 ID
   * @throws 如果目标不存在或达到最大子任务数
   */
  addSubTask(params: CreateSubTaskParams): string {
    const validated = CreateSubTaskSchema.parse(params);

    // 检查目标是否存在
    const goal = this.memory.goals.find(g => g.id === validated.goalId);
    if (!goal) {
      throw new Error(`目标不存在: ${validated.goalId}`);
    }

    // 检查子任务数量
    if (this.memory.activeSubTasks.length >= this.config.maxSubTasks) {
      log.warn('已达到最大子任务数', {
        max: this.config.maxSubTasks,
      });
      throw new Error(`已达到最大子任务数 (${this.config.maxSubTasks})`);
    }

    const id = generateId();
    const now = Date.now();

    const subTask: SubTask = {
      id,
      goalId: validated.goalId,
      description: validated.description,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    };

    this.memory.activeSubTasks.push(subTask);
    this.updateTimestamp();

    log.info('子任务已添加', {
      id,
      goalId: validated.goalId,
      description: validated.description,
    });

    return id;
  }

  /**
   * 更新子任务
   *
   * @param subTaskId 子任务 ID
   * @param params 更新参数
   * @returns 是否更新成功
   */
  updateSubTask(subTaskId: string, params: UpdateSubTaskParams): boolean {
    const validated = UpdateSubTaskSchema.parse(params);

    const subTask = this.memory.activeSubTasks.find(s => s.id === subTaskId);
    if (!subTask) {
      log.warn('子任务不存在', { subTaskId });
      return false;
    }

    // 应用更新
    if (validated.description !== undefined) {
      subTask.description = validated.description;
    }
    if (validated.status !== undefined) {
      subTask.status = validated.status;
    }
    subTask.updatedAt = Date.now();

    this.updateTimestamp();

    log.debug('子任务已更新', { subTaskId, updates: validated });

    return true;
  }

  /**
   * 标记子任务为进行中
   *
   * @param subTaskId 子任务 ID
   * @returns 是否操作成功
   */
  startSubTask(subTaskId: string): boolean {
    return this.updateSubTask(subTaskId, { status: 'in_progress' });
  }

  /**
   * 标记子任务为完成
   *
   * @param subTaskId 子任务 ID
   * @returns 是否操作成功
   */
  completeSubTask(subTaskId: string): boolean {
    return this.updateSubTask(subTaskId, { status: 'completed' });
  }

  /**
   * 标记子任务为失败
   *
   * @param subTaskId 子任务 ID
   * @returns 是否操作成功
   */
  failSubTask(subTaskId: string): boolean {
    return this.updateSubTask(subTaskId, { status: 'failed' });
  }

  /**
   * 获取子任务
   *
   * @param subTaskId 子任务 ID
   * @returns 子任务或 undefined
   */
  getSubTask(subTaskId: string): SubTask | undefined {
    return this.memory.activeSubTasks.find(s => s.id === subTaskId);
  }

  /**
   * 获取目标下的所有子任务
   *
   * @param goalId 目标 ID
   * @returns 子任务列表
   */
  getSubTasksByGoal(goalId: string): SubTask[] {
    return this.memory.activeSubTasks.filter(s => s.goalId === goalId);
  }

  /**
   * 获取所有进行中的子任务
   *
   * @returns 进行中的子任务列表
   */
  getInProgressSubTasks(): SubTask[] {
    return this.memory.activeSubTasks.filter(s => s.status === 'in_progress');
  }

  /**
   * 获取所有子任务
   *
   * @returns 子任务列表
   */
  getAllSubTasks(): SubTask[] {
    return [...this.memory.activeSubTasks];
  }

  // === 上下文存储 ===

  /**
   * 设置上下文值
   *
   * @param key 键名
   * @param value 值
   */
  setContext(key: string, value: unknown): void {
    this.memory.context[key] = value;
    this.updateTimestamp();

    log.debug('上下文已设置', { key, type: typeof value });
  }

  /**
   * 获取上下文值
   *
   * @param key 键名
   * @returns 值或 undefined
   */
  getContext<T = unknown>(key: string): T | undefined {
    return this.memory.context[key] as T | undefined;
  }

  /**
   * 删除上下文值
   *
   * @param key 键名
   * @returns 是否删除成功
   */
  deleteContext(key: string): boolean {
    if (key in this.memory.context) {
      delete this.memory.context[key];
      this.updateTimestamp();

      log.debug('上下文已删除', { key });
      return true;
    }
    return false;
  }

  /**
   * 获取所有上下文
   *
   * @returns 上下文对象副本
   */
  getAllContext(): Record<string, unknown> {
    return { ...this.memory.context };
  }

  /**
   * 清空上下文
   */
  clearContext(): void {
    this.memory.context = {};
    this.updateTimestamp();

    log.debug('上下文已清空');
  }

  // === 快照与恢复 ===

  /**
   * 获取工作记忆快照
   *
   * @returns 工作记忆副本
   */
  getSnapshot(): WorkingMemory {
    return {
      goals: this.memory.goals.map(g => ({ ...g })),
      activeSubTasks: this.memory.activeSubTasks.map(s => ({ ...s })),
      context: { ...this.memory.context },
      lastUpdated: this.memory.lastUpdated,
    };
  }

  /**
   * 从快照恢复工作记忆
   *
   * @param snapshot 工作记忆快照
   */
  restoreFromSnapshot(snapshot: WorkingMemory): void {
    this.memory = {
      goals: snapshot.goals.map(g => ({ ...g })),
      activeSubTasks: snapshot.activeSubTasks.map(s => ({ ...s })),
      context: { ...snapshot.context },
      lastUpdated: snapshot.lastUpdated,
    };

    log.info('工作记忆已从快照恢复', {
      goalsCount: this.memory.goals.length,
      subTasksCount: this.memory.activeSubTasks.length,
      contextKeys: Object.keys(this.memory.context).length,
    });
  }

  /**
   * 重置工作记忆
   */
  reset(): void {
    this.memory = {
      goals: [],
      activeSubTasks: [],
      context: {},
      lastUpdated: Date.now(),
    };

    log.info('工作记忆已重置');
  }

  // === 统计与清理 ===

  /**
   * 获取统计信息
   *
   * @returns 统计信息
   */
  getStats(): {
    totalGoals: number;
    activeGoals: number;
    completedGoals: number;
    abandonedGoals: number;
    totalSubTasks: number;
    pendingSubTasks: number;
    inProgressSubTasks: number;
    completedSubTasks: number;
    failedSubTasks: number;
    contextSize: number;
  } {
    return {
      totalGoals: this.memory.goals.length,
      activeGoals: this.memory.goals.filter(g => g.status === 'active').length,
      completedGoals: this.memory.goals.filter(g => g.status === 'completed').length,
      abandonedGoals: this.memory.goals.filter(g => g.status === 'abandoned').length,
      totalSubTasks: this.memory.activeSubTasks.length,
      pendingSubTasks: this.memory.activeSubTasks.filter(s => s.status === 'pending').length,
      inProgressSubTasks: this.memory.activeSubTasks.filter(s => s.status === 'in_progress').length,
      completedSubTasks: this.memory.activeSubTasks.filter(s => s.status === 'completed').length,
      failedSubTasks: this.memory.activeSubTasks.filter(s => s.status === 'failed').length,
      contextSize: Object.keys(this.memory.context).length,
    };
  }

  /**
   * 清理已完成的目标和子任务
   */
  cleanup(): void {
    if (!this.config.autoCleanupCompleted) return;

    const now = Date.now();
    const retentionTime = this.config.completedRetentionTime;

    // 清理过期已完成目标
    const beforeGoals = this.memory.goals.length;
    this.memory.goals = this.memory.goals.filter(g => {
      if (g.status === 'completed' || g.status === 'abandoned') {
        return now - g.updatedAt < retentionTime;
      }
      return true;
    });

    // 清理已完成子任务
    const beforeSubTasks = this.memory.activeSubTasks.length;
    this.memory.activeSubTasks = this.memory.activeSubTasks.filter(s => {
      if (s.status === 'completed' || s.status === 'failed') {
        return now - s.updatedAt < retentionTime;
      }
      return true;
    });

    const cleanedGoals = beforeGoals - this.memory.goals.length;
    const cleanedSubTasks = beforeSubTasks - this.memory.activeSubTasks.length;

    if (cleanedGoals > 0 || cleanedSubTasks > 0) {
      log.info('已完成项已清理', {
        cleanedGoals,
        cleanedSubTasks,
      });
      this.updateTimestamp();
    }
  }

  // === 私有方法 ===

  /**
   * 处理目标完成
   */
  private handleGoalCompletion(goalId: string): void {
    // 将该目标下的进行中子任务标记为完成
    for (const subTask of this.memory.activeSubTasks) {
      if (subTask.goalId === goalId && subTask.status === 'in_progress') {
        subTask.status = 'completed';
        subTask.updatedAt = Date.now();
      }
    }

    log.debug('目标完成处理完成', { goalId });
  }

  /**
   * 更新时间戳
   */
  private updateTimestamp(): void {
    this.memory.lastUpdated = Date.now();
  }
}

/**
 * 创建工作记忆管理器实例
 */
export function createWorkingMemoryManager(
  config?: WorkingMemoryManagerConfig
): WorkingMemoryManager {
  return new WorkingMemoryManager(config);
}
