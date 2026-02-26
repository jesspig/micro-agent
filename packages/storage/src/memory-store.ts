/**
 * 内存存储
 * 
 * 用于临时数据存储，不持久化到磁盘。
 */

import { getLogger } from '@logtape/logtape';

const log = getLogger(['memory-store']);

/** 内存存储项 */
interface MemoryItem<T> {
  value: T;
  expiresAt?: number;
}

/** 键值内存存储配置 */
export interface KVMemoryStoreConfig {
  /** 默认过期时间（毫秒），0 表示永不过期 */
  defaultTTL?: number;
  /** 最大条目数 */
  maxSize?: number;
  /** 清理间隔（毫秒） */
  cleanupInterval?: number;
}

/**
 * 键值内存存储
 * 
 * 通用内存键值存储，支持：
 * - 键值存储
 * - TTL 过期
 * - LRU 淘汰
 * 
 * 注意：此为通用缓存存储，与 runtime 包中的 MemoryStore（向量记忆存储）不同
 */
export class KVMemoryStore<T = unknown> {
  private store = new Map<string, MemoryItem<T>>();
  private config: Required<KVMemoryStoreConfig>;
  private cleanupTimer?: ReturnType<typeof setInterval>;

  constructor(config?: KVMemoryStoreConfig) {
    this.config = {
      defaultTTL: config?.defaultTTL ?? 0,
      maxSize: config?.maxSize ?? 1000,
      cleanupInterval: config?.cleanupInterval ?? 60000,
    };

    if (this.config.cleanupInterval > 0) {
      this.cleanupTimer = setInterval(() => this.cleanup(), this.config.cleanupInterval);
    }
  }

  /**
   * 设置值
   * @param key - 键
   * @param value - 值
   * @param ttl - 过期时间（毫秒），0 表示永不过期
   */
  set(key: string, value: T, ttl?: number): void {
    // 检查容量
    if (this.store.size >= this.config.maxSize && !this.store.has(key)) {
      this.evictLRU();
    }

    const effectiveTTL = ttl ?? this.config.defaultTTL;
    this.store.set(key, {
      value,
      expiresAt: effectiveTTL > 0 ? Date.now() + effectiveTTL : undefined,
    });

    log.debug('设置键值: {key}', { key });
  }

  /**
   * 获取值
   * @param key - 键
   * @returns 值，不存在或已过期返回 undefined
   */
  get(key: string): T | undefined {
    const item = this.store.get(key);
    if (!item) return undefined;

    if (item.expiresAt && Date.now() > item.expiresAt) {
      this.store.delete(key);
      return undefined;
    }

    return item.value;
  }

  /**
   * 检查键是否存在
   * @param key - 键
   */
  has(key: string): boolean {
    const item = this.store.get(key);
    if (!item) return false;

    if (item.expiresAt && Date.now() > item.expiresAt) {
      this.store.delete(key);
      return false;
    }

    return true;
  }

  /**
   * 删除键
   * @param key - 键
   * @returns 是否删除成功
   */
  delete(key: string): boolean {
    return this.store.delete(key);
  }

  /**
   * 清空存储
   */
  clear(): void {
    this.store.clear();
    log.debug('清空存储');
  }

  /**
   * 获取存储大小
   */
  get size(): number {
    return this.store.size;
  }

  /**
   * 获取所有键
   */
  keys(): string[] {
    return Array.from(this.store.keys());
  }

  /** 清理过期条目 */
  private cleanup(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, item] of this.store) {
      if (item.expiresAt && now > item.expiresAt) {
        this.store.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      log.debug('清理过期条目: {count}', { count: cleaned });
    }
  }

  /** LRU 淘汰 */
  private evictLRU(): void {
    // 删除最早插入的条目
    const firstKey = this.store.keys().next().value;
    if (firstKey) {
      this.store.delete(firstKey);
      log.debug('LRU 淘汰: {key}', { key: firstKey });
    }
  }

  /** 销毁存储 */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    this.store.clear();
  }
}
