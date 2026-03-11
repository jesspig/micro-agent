/**
 * 自适应并发控制器
 *
 * 基于性能指标动态调整并发度。
 */

import { getLogger } from '@logtape/logtape';

const log = getLogger(['kernel', 'concurrency-controller']);

// ============================================================================
// 类型定义
// ============================================================================

/** 性能指标 */
export interface PerformanceMetrics {
  /** 平均延迟（毫秒） */
  avgLatency: number;
  /** 资源利用率（0-1） */
  resourceUtilization: number;
  /** 成功率（0-1） */
  successRate: number;
}

/** 并发控制配置 */
export interface ConcurrencyConfig {
  /** 最小并发度 */
  minConcurrency: number;
  /** 最大并发度 */
  maxConcurrency: number;
  /** 初始并发度 */
  initialConcurrency: number;
  /** 调整间隔（毫秒） */
  adjustInterval: number;
}

/** 默认配置 */
const DEFAULT_CONFIG: ConcurrencyConfig = {
  minConcurrency: 1,
  maxConcurrency: 10,
  initialConcurrency: 3,
  adjustInterval: 1000,
};

// ============================================================================
// 自适应并发控制器
// ============================================================================

/**
 * 自适应并发控制器
 *
 * 调整策略：
 * - 低延迟 + 低利用率 -> 增加并发
 * - 高延迟 + 高利用率 -> 减少并发
 * - 低成功率 -> 降级
 */
export class AdaptiveConcurrencyController {
  private currentConcurrency: number;
  private metrics: PerformanceMetrics = {
    avgLatency: 0,
    resourceUtilization: 0,
    successRate: 1,
  };
  private latencyHistory: number[] = [];
  private readonly maxHistorySize = 10;

  constructor(private config: ConcurrencyConfig = DEFAULT_CONFIG) {
    this.currentConcurrency = config.initialConcurrency;
  }

  /**
   * 获取当前并发度
   */
  getCurrentConcurrency(): number {
    return this.currentConcurrency;
  }

  /**
   * 更新性能指标
   */
  updateMetrics(metrics: Partial<PerformanceMetrics>): void {
    if (metrics.avgLatency !== undefined) {
      this.latencyHistory.push(metrics.avgLatency);
      if (this.latencyHistory.length > this.maxHistorySize) {
        this.latencyHistory.shift();
      }
      const sum = this.latencyHistory.reduce((a, b) => a + b, 0);
      this.metrics.avgLatency = sum / this.latencyHistory.length;
    }
    if (metrics.resourceUtilization !== undefined) {
      this.metrics.resourceUtilization = metrics.resourceUtilization;
    }
    if (metrics.successRate !== undefined) {
      this.metrics.successRate = metrics.successRate;
    }
  }

  /**
   * 调整并发度
   *
   * 返回调整后的并发度（1-10 范围）。
   */
  adjustConcurrency(): number {
    const { avgLatency, resourceUtilization, successRate } = this.metrics;

    // 低成功率时降级
    if (successRate < 0.5) {
      return this.decrease('成功率过低');
    }

    // 高延迟时降级
    if (avgLatency > 5000) {
      return this.decrease('延迟过高');
    }

    // 高利用率 + 低延迟 -> 可尝试增加
    if (resourceUtilization > 0.7 && avgLatency < 2000) {
      return this.increase('资源充足且延迟低');
    }

    // 低利用率时增加
    if (resourceUtilization < 0.3 && avgLatency < 1000) {
      return this.increase('资源利用率低');
    }

    log.debug('[AdaptiveConcurrencyController] 保持当前并发度', {
      concurrency: this.currentConcurrency,
      metrics: this.metrics,
    });

    return this.currentConcurrency;
  }

  /**
   * 增加并发度
   */
  private increase(reason: string): number {
    if (this.currentConcurrency < this.config.maxConcurrency) {
      this.currentConcurrency++;
      log.info('[AdaptiveConcurrencyController] 增加并发度', {
        concurrency: this.currentConcurrency,
        reason,
      });
    }
    return this.currentConcurrency;
  }

  /**
   * 减少并发度
   */
  private decrease(reason: string): number {
    if (this.currentConcurrency > this.config.minConcurrency) {
      this.currentConcurrency--;
      log.info('[AdaptiveConcurrencyController] 减少并发度', {
        concurrency: this.currentConcurrency,
        reason,
      });
    }
    return this.currentConcurrency;
  }

  /**
   * 获取当前指标
   */
  getMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }

  /**
   * 重置控制器
   */
  reset(): void {
    this.currentConcurrency = this.config.initialConcurrency;
    this.latencyHistory = [];
    this.metrics = {
      avgLatency: 0,
      resourceUtilization: 0,
      successRate: 1,
    };
  }
}
