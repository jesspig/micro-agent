/**
 * 并行执行引擎
 *
 * 统一入口，整合分层调度、并发控制和优先级队列。
 */

import { getLogger } from '@logtape/logtape';
import { PriorityTaskQueue, type ExecutableTask, type TaskPriority, type TaskStatus } from './priority-queue';
import { AdaptiveConcurrencyController, type ConcurrencyConfig, type PerformanceMetrics } from './concurrency-controller';
import { LayeredScheduler, type ScheduleResult, type TaskResult } from './layered-scheduler';

const log = getLogger(['kernel', 'parallel-executor']);

// ============================================================================
// 类型重导出
// ============================================================================

export type { ExecutableTask, TaskPriority, TaskStatus } from './priority-queue';
export type { ConcurrencyConfig, PerformanceMetrics } from './concurrency-controller';
export type { ScheduleResult, TaskResult } from './layered-scheduler';

// ============================================================================
// 类重导出
// ============================================================================

export { PriorityTaskQueue } from './priority-queue';
export { AdaptiveConcurrencyController } from './concurrency-controller';
export { LayeredScheduler } from './layered-scheduler';

// ============================================================================
// 并行执行器
// ============================================================================

/** 并行执行器配置 */
export interface ParallelExecutorConfig {
  /** 并发控制配置 */
  concurrencyConfig?: ConcurrencyConfig;
}

/**
 * 并行执行器
 *
 * 统一入口，整合分层调度、并发控制和优先级队列。
 */
export class ParallelExecutor {
  private scheduler: LayeredScheduler;
  private concurrencyController: AdaptiveConcurrencyController;
  private taskQueue: PriorityTaskQueue;

  constructor(config?: ParallelExecutorConfig) {
    this.scheduler = new LayeredScheduler();
    this.concurrencyController = new AdaptiveConcurrencyController(
      config?.concurrencyConfig
    );
    this.taskQueue = new PriorityTaskQueue();
  }

  /**
   * 提交任务
   */
  submit(task: ExecutableTask): void {
    this.taskQueue.enqueue(task);
    log.debug('[ParallelExecutor] 任务已提交', { taskId: task.id });
  }

  /**
   * 批量提交任务
   */
  submitAll(tasks: ExecutableTask[]): void {
    for (const task of tasks) {
      this.taskQueue.enqueue(task);
    }
    log.debug('[ParallelExecutor] 批量任务已提交', { count: tasks.length });
  }

  /**
   * 执行所有任务
   */
  async executeAll(): Promise<ScheduleResult> {
    const tasks = this.taskQueue.getAll();
    this.taskQueue.dequeueBatch(tasks.length);

    if (tasks.length === 0) {
      log.debug('[ParallelExecutor] 无任务需要执行');
      return { layers: [], results: new Map(), totalDuration: 0 };
    }

    log.info('[ParallelExecutor] 开始执行', { taskCount: tasks.length });
    return this.scheduler.scheduleExecution(tasks, this.concurrencyController);
  }

  /**
   * 获取当前并发度
   */
  getConcurrency(): number {
    return this.concurrencyController.getCurrentConcurrency();
  }

  /**
   * 获取当前性能指标
   */
  getMetrics(): PerformanceMetrics {
    return this.concurrencyController.getMetrics();
  }

  /**
   * 获取待执行任务数
   */
  getPendingCount(): number {
    return this.taskQueue.size;
  }

  /**
   * 重置执行器
   */
  reset(): void {
    this.concurrencyController.reset();
    this.taskQueue.dequeueBatch(this.taskQueue.size);
    log.info('[ParallelExecutor] 执行器已重置');
  }
}