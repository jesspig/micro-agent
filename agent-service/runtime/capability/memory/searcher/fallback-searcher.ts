/**
 * 检索降级策略
 *
 * 当向量检索失败时自动降级到全文检索，支持多级降级。
 */

import { getLogger } from '@logtape/logtape';
import type { MemoryEntry, MemorySearchResult } from '../../../../types/memory';
import { FTSSearcher } from './fts-searcher';

const log = getLogger(['memory', 'fallback-searcher']);

/** 检索器接口 */
export interface Searcher {
  search(
    query: string,
    options?: {
      limit?: number;
      minScore?: number;
      types?: MemoryEntry['type'][];
      sessionKey?: string;
    }
  ): Promise<MemorySearchResult[]>;
}

/** 降级级别 */
export type FallbackLevel = 'primary' | 'secondary' | 'tertiary';

/** 降级策略配置 */
export interface FallbackConfig {
  /** FTS 检索器配置 */
  fts: {
    dbPath: string;
    tableName?: string;
  };
  /** 最大重试次数 */
  maxRetries?: number;
  /** 重试延迟（毫秒） */
  retryDelay?: number;
  /** 连续失败阈值（触发降级） */
  failureThreshold?: number;
  /** 降级冷却时间（毫秒） */
  cooldownMs?: number;
  /** 是否启用健康检查 */
  enableHealthCheck?: boolean;
  /** 健康检查间隔（毫秒） */
  healthCheckInterval?: number;
}

/** 降级状态 */
export interface FallbackStatus {
  /** 当前降级级别 */
  level: FallbackLevel;
  /** 是否已降级 */
  isDegraded: boolean;
  /** 是否有主检索器 */
  hasPrimary: boolean;
  /** 连续失败次数 */
  failureCount: number;
  /** 最后失败时间 */
  lastFailureTime: number | null;
  /** 最后成功时间 */
  lastSuccessTime: number | null;
  /** 总检索次数 */
  totalSearches: number;
  /** 降级检索次数 */
  fallbackSearches: number;
}

/**
 * 检索降级器
 *
 * 实现多级检索降级策略：
 * 1. Primary: 向量检索（语义相似）
 * 2. Secondary: 混合检索（向量 + 全文）
 * 3. Tertiary: 纯全文检索（关键词匹配）
 *
 * 自动检测嵌入服务可用性，在不可用时自动降级。
 */
export class FallbackSearcher implements Searcher {
  private primarySearcher?: Searcher;
  private secondarySearcher?: Searcher;
  private ftsSearcher: FTSSearcher;
  private maxRetries: number;
  private retryDelay: number;
  private failureThreshold: number;
  private cooldownMs: number;
  private failureCount: number = 0;
  private lastFailureTime: number = 0;
  private lastSuccessTime: number = 0;
  private totalSearches: number = 0;
  private fallbackSearches: number = 0;
  private healthCheckTimer?: Timer;
  private healthCheckInterval: number;
  private enableHealthCheck: boolean;

  constructor(config: FallbackConfig, primarySearcher?: Searcher) {
    this.ftsSearcher = new FTSSearcher(config.fts);
    this.maxRetries = config.maxRetries ?? 1;
    this.retryDelay = config.retryDelay ?? 1000;
    this.failureThreshold = config.failureThreshold ?? 3;
    this.cooldownMs = config.cooldownMs ?? 5 * 60 * 1000; // 5 分钟
    this.enableHealthCheck = config.enableHealthCheck ?? true;
    this.healthCheckInterval = config.healthCheckInterval ?? 60 * 1000; // 1 分钟
    this.primarySearcher = primarySearcher;

    // 启动健康检查
    if (this.enableHealthCheck) {
      this.startHealthCheck();
    }
  }

  /**
   * 设置主检索器
   */
  setPrimarySearcher(searcher: Searcher): void {
    this.primarySearcher = searcher;
    this.failureCount = 0;
    log.debug('主检索器已设置');
  }

  /**
   * 设置次级检索器
   */
  setSecondarySearcher(searcher: Searcher): void {
    this.secondarySearcher = searcher;
    log.debug('次级检索器已设置');
  }

  /**
   * 执行检索
   * @param query - 搜索查询
   * @param options - 检索选项
   * @returns 检索结果
   */
  async search(
    query: string,
    options: {
      limit?: number;
      minScore?: number;
      types?: MemoryEntry['type'][];
      sessionKey?: string;
    } = {}
  ): Promise<MemorySearchResult[]> {
    this.totalSearches++;

    // 检查是否应该直接使用降级模式
    if (this.shouldUseFallback()) {
      log.debug('使用降级模式（全文检索）');
      this.fallbackSearches++;
      return this.fallbackSearch(query, options);
    }

    // 尝试主检索器
    if (this.primarySearcher) {
      try {
        const results = await this.retrySearch(
          () => this.primarySearcher!.search(query, options),
          this.maxRetries
        );
        // 成功后重置失败计数
        this.recordSuccess();
        return results;
      } catch (error) {
        log.error('主检索器失败，尝试降级', {
          error: (error as Error).message,
          query: query.slice(0, 50),
        });
        this.recordFailure();

        // 尝试次级检索器
        if (this.secondarySearcher && !this.shouldUseFallback()) {
          try {
            const results = await this.secondarySearcher.search(query, options);
            this.recordSuccess();
            return results;
          } catch (secondaryError) {
            log.warn('次级检索器也失败，使用全文检索', {
              error: (secondaryError as Error).message,
            });
          }
        }

        // 最终降级到全文检索
        this.fallbackSearches++;
        return this.fallbackSearch(query, options);
      }
    }

    // 没有主检索器，直接使用全文检索
    this.fallbackSearches++;
    return this.fallbackSearch(query, options);
  }

  /**
   * 强制使用降级模式
   */
  async forceFallback(
    query: string,
    options: {
      limit?: number;
      minScore?: number;
      types?: MemoryEntry['type'][];
      sessionKey?: string;
    } = {}
  ): Promise<MemorySearchResult[]> {
    this.fallbackSearches++;
    return this.fallbackSearch(query, options);
  }

  /**
   * 带重试的检索
   */
  private async retrySearch<T>(
    searchFn: () => Promise<T>,
    retries: number
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let i = 0; i <= retries; i++) {
      try {
        return await searchFn();
      } catch (error) {
        lastError = error as Error;
        if (i < retries) {
          log.debug('检索重试', { attempt: i + 1, retries });
          await this.delay(this.retryDelay);
        }
      }
    }

    throw lastError;
  }

  /**
   * 降级检索（全文）
   */
  private fallbackSearch(
    query: string,
    options: {
      limit?: number;
      minScore?: number;
      types?: MemoryEntry['type'][];
      sessionKey?: string;
    }
  ): MemorySearchResult[] {
    const ftsResults = this.ftsSearcher.search({
      query,
      limit: options.limit,
      minScore: options.minScore,
      types: options.types,
      sessionKey: options.sessionKey,
    });

    return ftsResults.map((result) => ({
      entry: result.entry,
      score: result.score,
    }));
  }

  /**
   * 判断是否应该使用降级模式
   */
  private shouldUseFallback(): boolean {
    // 没有主检索器
    if (!this.primarySearcher) {
      return true;
    }

    // 连续失败次数过多
    if (this.failureCount >= this.failureThreshold) {
      // 检查是否超过冷却时间
      if (Date.now() - this.lastFailureTime < this.cooldownMs) {
        return true;
      }
      // 冷却时间已过，尝试恢复
      log.info('降级冷却期已过，尝试恢复主检索器');
      this.failureCount = 0;
    }

    return false;
  }

  /**
   * 记录失败
   */
  private recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    log.debug('记录检索失败', {
      failureCount: this.failureCount,
      threshold: this.failureThreshold,
    });
  }

  /**
   * 记录成功
   */
  private recordSuccess(): void {
    this.failureCount = 0;
    this.lastSuccessTime = Date.now();
  }

  /**
   * 延迟
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * 启动健康检查
   */
  private startHealthCheck(): void {
    this.healthCheckTimer = setInterval(() => {
      this.performHealthCheck();
    }, this.healthCheckInterval);
  }

  /**
   * 执行健康检查
   */
  private performHealthCheck(): void {
    if (!this.primarySearcher) {
      return;
    }

    // 如果处于降级状态且冷却期已过，尝试恢复
    if (this.failureCount >= this.failureThreshold) {
      const timeSinceFailure = Date.now() - this.lastFailureTime;
      if (timeSinceFailure >= this.cooldownMs) {
        log.info('健康检查：尝试恢复主检索器');
        this.failureCount = 0;
      }
    }
  }

  /**
   * 获取当前降级级别
   */
  getCurrentLevel(): FallbackLevel {
    if (!this.primarySearcher) {
      return 'tertiary';
    }
    if (this.shouldUseFallback()) {
      return 'tertiary';
    }
    if (this.failureCount > 0) {
      return 'secondary';
    }
    return 'primary';
  }

  /**
   * 获取状态
   */
  getStatus(): FallbackStatus {
    return {
      level: this.getCurrentLevel(),
      isDegraded: this.shouldUseFallback(),
      hasPrimary: !!this.primarySearcher,
      failureCount: this.failureCount,
      lastFailureTime: this.failureCount > 0 ? this.lastFailureTime : null,
      lastSuccessTime: this.lastSuccessTime > 0 ? this.lastSuccessTime : null,
      totalSearches: this.totalSearches,
      fallbackSearches: this.fallbackSearches,
    };
  }

  /**
   * 获取降级统计
   */
  getStats(): {
    totalSearches: number;
    fallbackSearches: number;
    fallbackRate: number;
    averageLatency: number;
  } {
    return {
      totalSearches: this.totalSearches,
      fallbackSearches: this.fallbackSearches,
      fallbackRate: this.totalSearches > 0
        ? this.fallbackSearches / this.totalSearches
        : 0,
      averageLatency: 0, // 需要额外追踪
    };
  }

  /**
   * 重置状态
   */
  reset(): void {
    this.failureCount = 0;
    this.lastFailureTime = 0;
    this.totalSearches = 0;
    this.fallbackSearches = 0;
    log.debug('降级状态已重置');
  }

  /**
   * 索引记忆条目
   */
  index(entry: MemoryEntry): void {
    this.ftsSearcher.index(entry);
  }

  /**
   * 批量索引
   */
  indexBatch(entries: MemoryEntry[]): void {
    this.ftsSearcher.indexBatch(entries);
  }

  /**
   * 关闭资源
   */
  close(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }
    this.ftsSearcher.close();
    log.debug('降级检索器已关闭');
  }
}
