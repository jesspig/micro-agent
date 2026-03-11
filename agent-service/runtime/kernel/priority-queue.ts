/**
 * 优先级任务队列
 *
 * 基于优先级的任务队列，支持批量获取。
 */

import { getLogger } from '@logtape/logtape';

const log = getLogger(['kernel', 'priority-queue']);

// ============================================================================
// 类型定义
// ============================================================================

/** 任务优先级 */
export type TaskPriority = 'critical' | 'high' | 'normal' | 'low';

/** 任务状态 */
export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed';

/** 可执行任务 */
export interface ExecutableTask {
  /** 任务 ID */
  id: string;
  /** 任务描述 */
  description: string;
  /** 优先级 */
  priority: TaskPriority;
  /** 依赖任务 ID 列表 */
  dependencies: string[];
  /** 执行函数 */
  execute: () => Promise<unknown>;
  /** 当前状态 */
  status: TaskStatus;
  /** 执行结果 */
  result?: unknown;
  /** 错误信息 */
  error?: Error;
}

/** 优先级权重映射 */
const PRIORITY_WEIGHTS: Record<TaskPriority, number> = {
  critical: 4,
  high: 3,
  normal: 2,
  low: 1,
};

// ============================================================================
// 优先级任务队列
// ============================================================================

/**
 * 优先级任务队列
 *
 * 按 CRITICAL > HIGH > NORMAL > LOW 顺序调度任务。
 */
export class PriorityTaskQueue {
  private tasks: ExecutableTask[] = [];

  /**
   * 添加任务到队列
   *
   * 按优先级降序插入，同优先级按添加顺序。
   */
  enqueue(task: ExecutableTask): void {
    const priorityWeight = PRIORITY_WEIGHTS[task.priority];
    let insertIndex = this.tasks.findIndex(
      t => PRIORITY_WEIGHTS[t.priority] < priorityWeight
    );
    if (insertIndex === -1) {
      insertIndex = this.tasks.length;
    }
    this.tasks.splice(insertIndex, 0, task);
    log.debug('[PriorityTaskQueue] 任务入队', { taskId: task.id, priority: task.priority });
  }

  /**
   * 取出最高优先级任务
   */
  dequeue(): ExecutableTask | undefined {
    return this.tasks.shift();
  }

  /**
   * 批量获取任务
   * @param count - 获取数量
   * @param filter - 可选过滤器
   */
  dequeueBatch(count: number, filter?: (task: ExecutableTask) => boolean): ExecutableTask[] {
    const result: ExecutableTask[] = [];
    const remaining: ExecutableTask[] = [];

    for (const task of this.tasks) {
      if (result.length < count && (!filter || filter(task))) {
        result.push(task);
      } else {
        remaining.push(task);
      }
    }

    this.tasks = remaining;
    log.debug('[PriorityTaskQueue] 批量出队', { count: result.length });
    return result;
  }

  /**
   * 获取队列大小
   */
  get size(): number {
    return this.tasks.length;
  }

  /**
   * 检查队列是否为空
   */
  isEmpty(): boolean {
    return this.tasks.length === 0;
  }

  /**
   * 获取所有任务（不修改队列）
   */
  getAll(): ExecutableTask[] {
    return [...this.tasks];
  }
}
