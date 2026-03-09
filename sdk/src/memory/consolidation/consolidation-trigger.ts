/**
 * 整合触发器 (T034)
 *
 * 实现消息数阈值 + 空闲超时 + 事件驱动的综合触发策略。
 */

import { z } from 'zod';
import { getLogger } from '@logtape/logtape';
import type { EventBus } from '../../runtime';
import type { IdleDetector, IdleState } from './idle-detector';

const log = getLogger(['memory', 'consolidation', 'trigger']);

/** 触发策略 */
export type TriggerStrategy = 'threshold' | 'idle' | 'manual' | 'event';

/** 整合触发配置 Schema */
export const ConsolidationTriggerConfigSchema = z.object({
  /** 消息数阈值，默认 20 条 */
  messageThreshold: z.number().min(5).max(200).default(20),
  /** 是否启用阈值触发 */
  enableThresholdTrigger: z.boolean().default(true),
  /** 是否启用空闲触发 */
  enableIdleTrigger: z.boolean().default(true),
  /** 是否启用事件触发 */
  enableEventTrigger: z.boolean().default(true),
  /** 触发间隔（毫秒），防止频繁触发 */
  minTriggerInterval: z.number().min(1000).max(300000).default(60000),
  /** 是否启用 */
  enabled: z.boolean().default(true),
});

/** 整合触发配置 */
export type ConsolidationTriggerConfig = z.infer<typeof ConsolidationTriggerConfigSchema>;

/** 触发事件 */
export interface TriggerEvent {
  /** 触发来源 */
  strategy: TriggerStrategy;
  /** 触发时间 */
  timestamp: Date;
  /** 当前消息数 */
  messageCount: number;
  /** 会话键 */
  sessionKey: string;
  /** 额外信息 */
  metadata?: Record<string, unknown>;
}

/** 触发回调函数 */
export type TriggerCallback = (event: TriggerEvent) => void | Promise<void>;

/** 触发器状态 */
export interface TriggerState {
  /** 当前消息计数 */
  messageCount: number;
  /** 上次触发时间 */
  lastTriggerTime: number | null;
  /** 是否等待触发 */
  isPending: boolean;
  /** 已触发的次数 */
  triggerCount: number;
}

/**
 * 整合触发器
 *
 * 综合触发策略：
 * 1. 消息数阈值：达到指定消息数时触发
 * 2. 空闲触发：会话空闲超时后触发
 * 3. 事件触发：监听特定事件触发
 * 4. 手动触发：显式调用触发
 */
export class ConsolidationTrigger {
  private config: ConsolidationTriggerConfig;
  private messageCount = 0;
  private lastTriggerTime: number | null = null;
  private triggerCount = 0;
  private isPending = false;
  private callbacks: Set<TriggerCallback> = new Set();
  private currentSessionKey: string;
  private eventBus: EventBus | null = null;
  private idleDetector: IdleDetector | null = null;
  private eventUnsubscribers: Array<() => void> = [];

  constructor(
    config: Partial<ConsolidationTriggerConfig> = {},
    sessionKey: string = 'default'
  ) {
    this.config = ConsolidationTriggerConfigSchema.parse(config);
    this.currentSessionKey = sessionKey;
  }

  /**
   * 设置事件总线
   */
  setEventBus(eventBus: EventBus): void {
    this.eventBus = eventBus;
    this.setupEventListeners();
  }

  /**
   * 设置空闲检测器
   */
  setIdleDetector(detector: IdleDetector): void {
    this.idleDetector = detector;
    this.setupIdleListener();
  }

  /**
   * 记录新消息
   *
   * 更新消息计数并检查阈值触发
   */
  recordMessage(): void {
    if (!this.config.enabled) {
      return;
    }

    this.messageCount++;

    // 记录活动到空闲检测器
    this.idleDetector?.recordActivity();

    log.debug('消息已记录', {
      messageCount: this.messageCount,
      threshold: this.config.messageThreshold,
    });

    // 检查阈值触发
    if (this.config.enableThresholdTrigger) {
      this.checkThresholdTrigger();
    }
  }

  /**
   * 批量记录消息
   */
  recordMessages(count: number): void {
    for (let i = 0; i < count; i++) {
      this.recordMessage();
    }
  }

  /**
   * 手动触发整合
   */
  async triggerManual(metadata?: Record<string, unknown>): Promise<void> {
    await this.executeTrigger('manual', metadata);
  }

  /**
   * 注册触发回调
   */
  onTrigger(callback: TriggerCallback): () => void {
    this.callbacks.add(callback);
    return () => {
      this.callbacks.delete(callback);
    };
  }

  /**
   * 获取当前状态
   */
  getState(): TriggerState {
    return {
      messageCount: this.messageCount,
      lastTriggerTime: this.lastTriggerTime,
      isPending: this.isPending,
      triggerCount: this.triggerCount,
    };
  }

  /**
   * 重置状态
   */
  reset(): void {
    this.messageCount = 0;
    this.lastTriggerTime = null;
    this.triggerCount = 0;
    this.isPending = false;
    log.debug('触发器已重置');
  }

  /**
   * 更新会话键
   */
  setSessionKey(sessionKey: string): void {
    this.currentSessionKey = sessionKey;
    this.reset();
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<ConsolidationTriggerConfig>): void {
    this.config = { ...this.config, ...ConsolidationTriggerConfigSchema.partial().parse(config) };
    log.info('触发器配置已更新', this.config);
  }

  /**
   * 停止触发器
   */
  stop(): void {
    // 取消事件监听
    for (const unsubscribe of this.eventUnsubscribers) {
      unsubscribe();
    }
    this.eventUnsubscribers = [];
    log.info('触发器已停止');
  }

  /**
   * 检查是否应该触发
   */
  shouldTrigger(): boolean {
    if (!this.config.enabled) {
      return false;
    }

    // 检查最小触发间隔
    if (this.lastTriggerTime !== null) {
      const elapsed = Date.now() - this.lastTriggerTime;
      if (elapsed < this.config.minTriggerInterval) {
        return false;
      }
    }

    return true;
  }

  // ========== 私有方法 ==========

  private checkThresholdTrigger(): void {
    if (this.messageCount < this.config.messageThreshold) {
      return;
    }

    if (!this.shouldTrigger()) {
      return;
    }

    log.info('达到消息阈值，触发整合', {
      messageCount: this.messageCount,
      threshold: this.config.messageThreshold,
    });

    this.executeTrigger('threshold').catch((error) => {
      log.error('阈值触发执行失败', { error: String(error) });
    });
  }

  private setupIdleListener(): void {
    if (!this.idleDetector || !this.config.enableIdleTrigger) {
      return;
    }

    const unsubscribe = this.idleDetector.onIdle(async (state: IdleState) => {
      if (!this.shouldTrigger()) {
        return;
      }

      // 只有在有消息时才触发
      if (this.messageCount === 0) {
        log.debug('空闲触发跳过：无消息');
        return;
      }

      log.info('空闲触发整合', {
        idleDuration: state.idleDuration,
        messageCount: this.messageCount,
      });

      await this.executeTrigger('idle', {
        idleDuration: state.idleDuration,
      });
    });

    this.eventUnsubscribers.push(unsubscribe);
  }

  private setupEventListeners(): void {
    if (!this.eventBus || !this.config.enableEventTrigger) {
      return;
    }

    // 监听会话结束事件
    const handleSessionEnd = async (payload: unknown) => {
      const data = payload as { sessionKey?: string };
      if (data.sessionKey === this.currentSessionKey) {
        await this.executeTrigger('event', { reason: 'session_end' });
      }
    };

    this.eventBus.on('system:stopping' as any, handleSessionEnd);
    this.eventUnsubscribers.push(() => {
      this.eventBus?.off('system:stopping' as any, handleSessionEnd);
    });
  }

  private async executeTrigger(
    strategy: TriggerStrategy,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    if (this.isPending) {
      log.debug('触发被跳过：已有待处理的触发');
      return;
    }

    this.isPending = true;

    const event: TriggerEvent = {
      strategy,
      timestamp: new Date(),
      messageCount: this.messageCount,
      sessionKey: this.currentSessionKey,
      metadata,
    };

    try {
      await this.executeCallbacks(event);

      // 更新状态
      this.lastTriggerTime = Date.now();
      this.triggerCount++;

      log.info('整合触发完成', {
        strategy,
        messageCount: this.messageCount,
        triggerCount: this.triggerCount,
      });
    } finally {
      this.isPending = false;
    }
  }

  private async executeCallbacks(event: TriggerEvent): Promise<void> {
    for (const callback of Array.from(this.callbacks)) {
      try {
        await callback(event);
      } catch (error) {
        log.error('触发回调执行错误', {
          strategy: event.strategy,
          error: String(error),
        });
      }
    }
  }
}

/**
 * 创建整合触发器
 */
export function createConsolidationTrigger(
  config?: Partial<ConsolidationTriggerConfig>,
  sessionKey?: string
): ConsolidationTrigger {
  return new ConsolidationTrigger(config, sessionKey);
}
