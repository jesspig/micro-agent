/**
 * 记忆 API
 */

import type { MemoryEntry, MemorySearchResult } from '../client/types';

interface Transport {
  send(method: string, params: unknown): Promise<unknown>;
}

export interface MemorySearchOptions {
  /** 返回结果数量 */
  limit?: number;
  /** 最小相似度 */
  minSimilarity?: number;
}

/**
 * 记忆 API
 */
export class MemoryAPI {
  constructor(private transport: Transport) {}

  /**
   * 搜索记忆
   */
  async search(query: string, options?: MemorySearchOptions): Promise<MemorySearchResult[]> {
    return this.transport.send('memory.search', { query, ...options }) as Promise<MemorySearchResult[]>;
  }

  /**
   * 添加记忆
   */
  async add(entry: Omit<MemoryEntry, 'id'>): Promise<void> {
    await this.transport.send('memory.add', { entry });
  }

  /**
   * 清除会话记忆
   */
  async clearSession(sessionKey: string): Promise<void> {
    await this.transport.send('memory.clearSession', { sessionKey });
  }
}
