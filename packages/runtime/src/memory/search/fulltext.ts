/**
 * 全文检索模块
 */

import type { MemoryEntry, MemoryFilter } from '../../types';
import type { MemoryStoreCore } from '../core';
import { getLogger } from '@logtape/logtape';

const log = getLogger(['memory', 'search', 'fulltext']);

/**
 * 全文检索器
 */
export class FulltextSearcher {
  private core: MemoryStoreCore;

  constructor(core: MemoryStoreCore) {
    this.core = core;
  }

  /**
   * 全文检索
   */
  async search(query: string, limit: number, filter?: MemoryFilter): Promise<MemoryEntry[]> {
    const table = this.core.dbTable;
    if (!table) {
      log.error('🚨 [MemoryStore] 全文检索失败: 表未初始化');
      return [];
    }

    try {
      const startTime = Date.now();

      // 构建查询
      let queryBuilder = table.query();

      // 应用过滤条件
      if (filter) {
        const conditions: string[] = [];
        if (filter.sessionId) {
          conditions.push(`sessionId = "${filter.sessionId}"`);
        }
        if (filter.type) {
          const types = Array.isArray(filter.type) ? filter.type : [filter.type];
          const typeConditions = types.map((t) => `type = "${t}"`).join(' OR ');
          conditions.push(`(${typeConditions})`);
        }
        if (conditions.length > 0) {
          queryBuilder = queryBuilder.where(conditions.join(' AND '));
        }
      }

      // 获取所有匹配记录
      const allResults = await queryBuilder.toArray();

      // 提取关键词
      const keywords = this.extractKeywords(query);

      const scored = allResults
        .map((r) => {
          const content = (r.content as string).toLowerCase();
          let score = 0;
          for (const kw of keywords) {
            const count = (content.match(new RegExp(this.escapeRegex(kw), 'g')) || []).length;
            score += count;
          }
          return { record: r, score };
        })
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

      const elapsed = Date.now() - startTime;

      log.info('📖 记忆检索完成', {
        query: query.slice(0, 50),
        source: 'fulltext',
        sourceDetail: {
          keywords: keywords.slice(0, 5),
        },
        resultCount: scored.length,
        elapsed: `${elapsed}ms`,
      });

      return scored.map((item) => this.core['recordToEntry'](item.record));
    } catch (error) {
      log.error('🚨 [MemoryStore] 全文检索异常', { error: String(error) });
      return [];
    }
  }

  /**
   * 带迁移过滤的全文检索
   */
  async searchWithMigrationFilter(
    query: string,
    limit: number,
    filter: MemoryFilter | undefined,
    migratedUntil?: number
  ): Promise<MemoryEntry[]> {
    const table = this.core.dbTable;
    if (!table) return [];

    try {
      const startTime = Date.now();

      let queryBuilder = table.query();
      const conditions: string[] = [];

      if (migratedUntil !== undefined) {
        conditions.push(`createdAt > ${migratedUntil}`);
      }

      if (filter?.sessionId) {
        conditions.push(`sessionId = "${filter.sessionId}"`);
      }
      if (filter?.type) {
        const types = Array.isArray(filter.type) ? filter.type : [filter.type];
        const typeConditions = types.map((t) => `type = "${t}"`).join(' OR ');
        conditions.push(`(${typeConditions})`);
      }

      if (conditions.length > 0) {
        queryBuilder = queryBuilder.where(conditions.join(' AND '));
      }

      const allResults = await queryBuilder.toArray();
      const keywords = this.extractKeywords(query);

      const scored = allResults
        .map((r) => {
          const content = (r.content as string).toLowerCase();
          let score = 0;
          for (const kw of keywords) {
            const count = (content.match(new RegExp(this.escapeRegex(kw), 'g')) || []).length;
            score += count;
          }
          return { ...r, _score: score } as MemoryEntry & { _score: number };
        })
        .filter((r) => r._score > 0)
        .sort((a, b) => b._score - a._score)
        .slice(0, limit);

      const elapsed = Date.now() - startTime;
      log.debug('🔍 [MemoryStore] 带迁移过滤的全文检索完成', {
        query: query.slice(0, 50),
        migratedUntil,
        resultCount: scored.length,
        elapsed,
      });

      return scored;
    } catch (error) {
      log.error('🔍 [MemoryStore] 带迁移过滤的全文检索失败', { error });
      return [];
    }
  }

  /**
   * 提取关键词（支持中英文混合）
   */
  extractKeywords(query: string): string[] {
    const keywords: string[] = [];
    const lowerQuery = query.toLowerCase();

    // 1. 提取英文单词
    const englishWords = lowerQuery.match(/[a-z]+/g) || [];
    keywords.push(...englishWords.filter((w) => w.length > 1));

    // 2. 提取中文词汇（n-gram）
    const chineseChars = lowerQuery.match(/[\u4e00-\u9fa5]/g) || [];
    if (chineseChars.length > 0) {
      // 2-gram
      for (let i = 0; i < chineseChars.length - 1; i++) {
        keywords.push(chineseChars[i] + chineseChars[i + 1]);
      }
      // 3-gram
      if (chineseChars.length > 3) {
        for (let i = 0; i < chineseChars.length - 2; i++) {
          keywords.push(chineseChars[i] + chineseChars[i + 1] + chineseChars[i + 2]);
        }
      }
    }

    // 3. 提取数字
    const numbers = lowerQuery.match(/\d+/g) || [];
    keywords.push(...numbers.filter((n) => n.length > 1));

    return [...new Set(keywords)];
  }

  /**
   * 计算关键词匹配分数
   */
  calculateKeywordScore(content: string, keywords: string[]): number {
    if (keywords.length === 0) return 0;

    const lowerContent = content.toLowerCase();
    let matchCount = 0;
    let totalWeight = 0;

    for (const keyword of keywords) {
      const weight = keyword.length / keywords.reduce((sum, k) => sum + k.length, 0);
      totalWeight += weight;

      const regex = new RegExp(this.escapeRegex(keyword), 'gi');
      const matches = lowerContent.match(regex);
      if (matches && matches.length > 0) {
        matchCount += weight * Math.min(matches.length, 3);
      }
    }

    return totalWeight > 0 ? Math.min(matchCount / totalWeight, 1) : 0;
  }

  /**
   * 转义正则表达式特殊字符
   */
  escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
