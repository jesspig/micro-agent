/**
 * 遗忘调度器
 *
 * 定期执行清理任务，支持可配置调度间隔。
 */

import { getLogger } from '@logtape/logtape';
import { z } from 'zod';
import type { ForgettingEngine, ForgettingResult } from './forgetting-engine';

const log = getLogger(['memory', 'forgetting', 'scheduler']);

/** 调度器配置 Schema */
export const ForgettingSchedulerConfigSchema = z.object({
  /** 是否启用自动调度 */
  enabled: z.boolean().default(true),
  /** 调度间隔（毫秒），默认 24 小时 */
  intervalMs: z.number().min(60_000).default(24 * 60 * 60 * 1000),
  /** 初始延迟（毫秒），默认 5 分钟 */
  initialDelayMs: z.number().min(0).default(5 * 60 * 1000),
  /** 是否在启动时立即执行一次 */
  runOnStart: z.boolean().default(false),
  /** 最大重试次数 */
  maxRetries: z.number().int().min(0).max(10).default(3),
  /** 重试间隔（毫秒） */
  retryDelayMs: z.number().min(1000).default(60_000),
});

export type ForgettingSchedulerConfig = z.infer<typeof ForgettingSchedulerConfigSchema>;

/** 调度任务状态 */
export type SchedulerStatus = 'idle' | 'running' | 'paused' | 'stopped';

/** 任务执行记录 */
export interface ExecutionRecord {
  /** 执行时间 */
  timestamp: Date;
  /** 执行结果 */
  result: ForgettingResult;
  /** 执行耗时（毫秒） */
  duration: number;
  /** 是否成功 */
  success: boolean;
  /** 错误信息 */
  error?: string;
}

/** 调度器状态 */
export interface SchedulerState {
  /** 当前状态 */
  status: SchedulerStatus;
  /** 上次执行时间 */
  lastExecution?: Date;
  /** 上次执行结果 */
  lastResult?: ExecutionRecord;
  /** 下次执行时间 */
  nextExecution?: Date;
  /** 总执行次数 */
  totalExecutions: number;
  /** 成功次数 */
  successCount: number;
  /** 失败次数 */
  failureCount: number;
  /** 总清理记忆数 */
  totalDeletedCount: number;
}

/**
 * 遗忘调度器
 *
 * 支持定时调度和手动触发清理任务。
 */
export class ForgettingScheduler {
  private config: ForgettingSchedulerConfig;
  private engine: ForgettingEngine;
  private timerId: ReturnType<typeof setTimeout> | null = null;
  private state: SchedulerState;
  private executionHistory: ExecutionRecord[] = [];
  private readonly maxHistorySize = 100;

  constructor(engine: ForgettingEngine, config?: Partial<ForgettingSchedulerConfig>) {
    this.config = ForgettingSchedulerConfigSchema.parse(config ?? {});
    this.engine = engine;
    this.state = {
      status: 'idle',
      totalExecutions: 0,
      successCount: 0,
      failureCount: 0,
      totalDeletedCount: 0,
    };

    log.info('遗忘调度器已初始化', { config: this.config });
  }

  /**
   * 启动调度器
   */
  async start(): Promise<void> {
    if (this.state.status === 'running') {
      log.warn('调度器已在运行中');
      return;
    }

    this.state.status = 'running';
    log.info('遗忘调度器已启动');

    // 如果配置了启动时执行
    if (this.config.runOnStart) {
      await this.executeOnce();
    }

    // 设置定时任务
    this.scheduleNext();
  }

  /**
   * 停止调度器
   */
  stop(): void {
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }

    this.state.status = 'stopped';
    log.info('遗忘调度器已停止');
  }

  /**
   * 暂停调度器
   */
  pause(): void {
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }

    this.state.status = 'paused';
    log.info('遗忘调度器已暂停');
  }

  /**
   * 恢复调度器
   */
  resume(): void {
    if (this.state.status !== 'paused') {
      log.warn('调度器未处于暂停状态');
      return;
    }

    this.state.status = 'running';
    this.scheduleNext();
    log.info('遗忘调度器已恢复');
  }

  /**
   * 手动触发一次清理
   */
  async trigger(): Promise<ForgettingResult> {
    return this.executeOnce();
  }

  /**
   * 试运行（不实际删除）
   */
  async dryRun(): Promise<ForgettingResult> {
    log.info('执行试运行清理');
    return this.engine.dryRun();
  }

  /**
   * 获取当前状态
   */
  getState(): SchedulerState {
    return { ...this.state };
  }

  /**
   * 获取执行历史
   *
   * @param limit - 返回记录数限制
   */
  getHistory(limit?: number): ExecutionRecord[] {
    const history = [...this.executionHistory].reverse();
    return limit ? history.slice(0, limit) : history;
  }

  /**
   * 获取配置
   */
  getConfig(): ForgettingSchedulerConfig {
    return { ...this.config };
  }

  /**
   * 更新配置
   *
   * @param config - 新配置
   * @param restart - 是否重启调度器以应用新配置
   */
  updateConfig(config: Partial<ForgettingSchedulerConfig>, restart: boolean = true): void {
    const wasRunning = this.state.status === 'running';

    if (wasRunning) {
      this.stop();
    }

    this.config = ForgettingSchedulerConfigSchema.parse({
      ...this.config,
      ...config,
    });

    log.info('调度器配置已更新', { config: this.config });

    if (restart && wasRunning && this.config.enabled) {
      this.start();
    }
  }

  /**
   * 执行一次清理
   */
  private async executeOnce(): Promise<ForgettingResult> {
    const startTime = Date.now();
    log.info('开始执行遗忘清理');

    let retries = 0;
    let lastError: Error | null = null;
    let result: ForgettingResult | null = null;

    while (retries <= this.config.maxRetries) {
      try {
        result = await this.engine.execute(false);
        break;
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e));
        retries++;

        if (retries <= this.config.maxRetries) {
          log.warn('清理执行失败，准备重试', {
            attempt: retries,
            error: lastError.message,
          });

          await this.sleep(this.config.retryDelayMs);
        }
      }
    }

    const duration = Date.now() - startTime;
    const success = result !== null;

    // 更新状态
    this.state.totalExecutions++;
    if (success) {
      this.state.successCount++;
      this.state.totalDeletedCount += result!.stats.deletedCount;
    } else {
      this.state.failureCount++;
    }

    // 记录执行历史
    const record: ExecutionRecord = {
      timestamp: new Date(),
      result: result ?? {
        deletedIds: [],
        preservedIds: [],
        errors: [{ id: '', error: lastError?.message ?? 'Unknown error' }],
        stats: {
          totalCandidates: 0,
          deletedCount: 0,
          preservedCount: 0,
          errorCount: 1,
        },
      },
      duration,
      success,
      error: lastError?.message,
    };

    this.addToHistory(record);

    this.state.lastExecution = record.timestamp;
    this.state.lastResult = record;

    if (success) {
      log.info('遗忘清理完成', {
        duration: `${duration}ms`,
        deletedCount: result!.stats.deletedCount,
        retries,
      });
    } else {
      log.error('遗忘清理失败', {
        duration: `${duration}ms`,
        error: lastError?.message,
        retries,
      });
    }

    return result!;
  }

  /**
   * 安排下次执行
   */
  private scheduleNext(): void {
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
    }

    const delay = this.state.totalExecutions === 0
      ? this.config.initialDelayMs
      : this.config.intervalMs;

    this.state.nextExecution = new Date(Date.now() + delay);

    this.timerId = setTimeout(async () => {
      if (this.state.status === 'running') {
        await this.executeOnce();
        this.scheduleNext();
      }
    }, delay);

    log.debug('下次清理已安排', {
      delay: `${delay}ms`,
      nextExecution: this.state.nextExecution.toISOString(),
    });
  }

  /**
   * 添加到历史记录
   */
  private addToHistory(record: ExecutionRecord): void {
    this.executionHistory.push(record);

    // 保持历史记录大小限制
    if (this.executionHistory.length > this.maxHistorySize) {
      this.executionHistory.shift();
    }
  }

  /**
   * 异步休眠
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * 便捷函数：创建遗忘调度器
 */
export function createForgettingScheduler(
  engine: ForgettingEngine,
  config?: Partial<ForgettingSchedulerConfig>
): ForgettingScheduler {
  return new ForgettingScheduler(engine, config);
}
