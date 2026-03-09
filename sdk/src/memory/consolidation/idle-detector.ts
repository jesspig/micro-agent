/**
 * 空闲检测器 (T035)
 *
 * 检测会话空闲状态，触发整合。
 * 支持可配置超时和活动重置。
 */

import { z } from 'zod';
import { getLogger } from '@logtape/logtape';

const log = getLogger(['memory', 'consolidation', 'idle-detector']);

/** 空闲检测配置 Schema */
export const IdleDetectorConfigSchema = z.object({
  /** 空闲超时时间（毫秒），默认 5 分钟 */
  idleTimeout: z.number().min(1000).max(3600000).default(300000),
  /** 检查间隔（毫秒），默认 30 秒 */
  checkInterval: z.number().min(1000).max(300000).default(30000),
  /** 最小活动时间（毫秒），在此时间内不会触发空闲 */
  minActiveTime: z.number().min(0).max(60000).default(5000),
  /** 是否启用 */
  enabled: z.boolean().default(true),
});

/** 空闲检测配置 */
export type IdleDetectorConfig = z.infer<typeof IdleDetectorConfigSchema>;

/** 空闲状态 */
export interface IdleState {
  /** 是否空闲 */
  isIdle: boolean;
  /** 空闲持续时间（毫秒） */
  idleDuration: number;
  /** 最后活动时间 */
  lastActivityTime: number;
  /** 会话开始时间 */
  sessionStartTime: number;
}

/** 空闲回调函数 */
export type IdleCallback = (state: IdleState) => void | Promise<void>;

/**
 * 空闲检测器
 *
 * 功能：
 * - 追踪会话活动时间
 * - 检测空闲状态
 * - 触发空闲回调
 */
export class IdleDetector {
  private config: IdleDetectorConfig;
  private lastActivityTime: number;
  private sessionStartTime: number;
  private checkTimer: Timer | null = null;
  private callbacks: Set<IdleCallback> = new Set();
  private isRunning = false;
  private lastIdleTriggerTime = 0;

  constructor(config: Partial<IdleDetectorConfig> = {}) {
    this.config = IdleDetectorConfigSchema.parse(config);
    this.lastActivityTime = Date.now();
    this.sessionStartTime = Date.now();
  }

  /**
   * 启动空闲检测
   */
  start(): void {
    if (this.isRunning || !this.config.enabled) {
      return;
    }

    this.isRunning = true;
    this.lastActivityTime = Date.now();
    this.sessionStartTime = Date.now();

    this.checkTimer = setInterval(() => {
      this.checkIdle();
    }, this.config.checkInterval);

    log.info('空闲检测器已启动', {
      idleTimeout: this.config.idleTimeout,
      checkInterval: this.config.checkInterval,
    });
  }

  /**
   * 停止空闲检测
   */
  stop(): void {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }
    this.isRunning = false;
    log.info('空闲检测器已停止');
  }

  /**
   * 记录活动
   *
   * 重置空闲计时器
   */
  recordActivity(): void {
    const now = Date.now();
    const idleDuration = now - this.lastActivityTime;

    this.lastActivityTime = now;

    log.debug('活动已记录', {
      previousIdleDuration: idleDuration,
      idleTimeout: this.config.idleTimeout,
    });
  }

  /**
   * 注册空闲回调
   */
  onIdle(callback: IdleCallback): () => void {
    this.callbacks.add(callback);
    return () => {
      this.callbacks.delete(callback);
    };
  }

  /**
   * 获取当前空闲状态
   */
  getState(): IdleState {
    const now = Date.now();
    const idleDuration = now - this.lastActivityTime;

    return {
      isIdle: idleDuration >= this.config.idleTimeout,
      idleDuration,
      lastActivityTime: this.lastActivityTime,
      sessionStartTime: this.sessionStartTime,
    };
  }

  /**
   * 检查是否空闲
   */
  isIdle(): boolean {
    const state = this.getState();
    return state.isIdle;
  }

  /**
   * 获取剩余空闲时间
   *
   * @returns 剩余毫秒数，如果已空闲返回 0
   */
  getRemainingTime(): number {
    const state = this.getState();
    const remaining = this.config.idleTimeout - state.idleDuration;
    return Math.max(0, remaining);
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<IdleDetectorConfig>): void {
    this.config = { ...this.config, ...IdleDetectorConfigSchema.partial().parse(config) };
    log.info('空闲检测器配置已更新', this.config);
  }

  /**
   * 重置会话
   */
  reset(): void {
    this.lastActivityTime = Date.now();
    this.sessionStartTime = Date.now();
    this.lastIdleTriggerTime = 0;
    log.debug('空闲检测器已重置');
  }

  /**
   * 手动触发空闲事件
   */
  async triggerIdle(): Promise<void> {
    const state = this.getState();
    await this.executeCallbacks(state);
  }

  // ========== 私有方法 ==========

  private checkIdle(): void {
    const state = this.getState();
    const sessionDuration = Date.now() - this.sessionStartTime;

    // 检查最小活动时间
    if (sessionDuration < this.config.minActiveTime) {
      return;
    }

    // 检查是否空闲
    if (!state.isIdle) {
      return;
    }

    // 避免重复触发（在检查间隔内）
    const timeSinceLastTrigger = Date.now() - this.lastIdleTriggerTime;
    if (timeSinceLastTrigger < this.config.checkInterval) {
      return;
    }

    log.info('检测到空闲状态', {
      idleDuration: state.idleDuration,
      sessionDuration,
    });

    this.lastIdleTriggerTime = Date.now();
    this.executeCallbacks(state).catch((error) => {
      log.error('空闲回调执行失败', { error: String(error) });
    });
  }

  private async executeCallbacks(state: IdleState): Promise<void> {
    for (const callback of Array.from(this.callbacks)) {
      try {
        await callback(state);
      } catch (error) {
        log.error('空闲回调执行错误', { error: String(error) });
      }
    }
  }
}

/**
 * 创建空闲检测器
 */
export function createIdleDetector(
  config?: Partial<IdleDetectorConfig>
): IdleDetector {
  return new IdleDetector(config);
}
