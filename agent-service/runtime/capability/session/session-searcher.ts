/**
 * 会话全文检索器 (T044)
 *
 * 基于 FTS5 实现会话标题、摘要、标签的全文检索。
 * 支持 BM25 排序和高亮显示。
 */

import { Database } from 'bun:sqlite';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { z } from 'zod';
import { getLogger } from '@logtape/logtape';
import {
  SessionSearchOptionsSchema,
  type SessionSearchOptions,
  type SessionSearchOptionsInput,
  type SessionSearchResult,
  type SessionSearchResultItem,
  type SessionSearcherConfig,
} from './types';
import type { SessionKey, SessionState } from '../../../types/session';

const log = getLogger(['capability', 'session', 'searcher']);

/** 默认配置 */
const DEFAULT_CONFIG: SessionSearcherConfig = {
  dbPath: '~/.micro-agent/data/sessions.db',
  defaultLimit: 20,
  maxLimit: 100,
  enableHighlight: true,
};

/**
 * 会话全文检索器
 *
 * 职责：
 * - 基于 FTS5 实现全文检索
 * - 支持 BM25 相关性排序
 * - 支持多字段搜索和高亮
 */
export class SessionSearcher {
  private config: SessionSearcherConfig;
  private db?: Database;

  constructor(config?: Partial<SessionSearcherConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 初始化搜索器
   */
  async initialize(): Promise<void> {
    const dbPath = this.expandPath(this.config.dbPath);

    // 确保数据库目录存在
    const dbDir = dirname(dbPath);
    if (!existsSync(dbDir)) {
      mkdirSync(dbDir, { recursive: true });
    }

    this.db = new Database(dbPath);
    log.info('会话搜索器已初始化', { dbPath });
  }

  /**
   * 搜索会话
   *
   * @param options - 搜索选项
   * @returns 搜索结果
   */
  async search(options: SessionSearchOptionsInput): Promise<SessionSearchResult> {
    const startTime = Date.now();

    // 校验选项并填充默认值
    const opts: SessionSearchOptions = SessionSearchOptionsSchema.parse(options);

    if (!this.db) {
      await this.initialize();
    }

    // 构建 FTS 查询
    const ftsQuery = this.buildFTSQuery(opts);

    // 执行搜索
    const results = this.executeSearch(ftsQuery, opts);

    const elapsedMs = Date.now() - startTime;

    log.debug('会话搜索完成', {
      query: opts.query,
      resultsCount: results.items.length,
      elapsedMs,
    });

    return {
      ...results,
      elapsedMs,
    };
  }

  /**
   * 按标签搜索会话
   *
   * @param tags - 标签列表
   * @param options - 搜索选项
   * @returns 搜索结果
   */
  async searchByTags(
    tags: string[],
    options?: Partial<SessionSearchOptions>
  ): Promise<SessionSearchResult> {
    const query = tags.map(t => `"${t}"`).join(' OR ');
    return this.search({
      query,
      fields: ['tags'],
      ...options,
    });
  }

  /**
   * 搜索相似会话
   *
   * @param sessionKey - 目标会话键
   * @param options - 搜索选项
   * @returns 相似会话列表
   */
  async searchSimilar(
    sessionKey: SessionKey,
    options?: Partial<SessionSearchOptions>
  ): Promise<SessionSearchResult> {
    if (!this.db) {
      await this.initialize();
    }

    // 获取目标会话的标题和摘要
    const targetSession = this.db?.query<{
      title: string | null;
      summary: string | null;
    }, [string]>(`
      SELECT title, summary FROM sessions WHERE key = ?
    `).get(sessionKey);

    if (!targetSession?.title && !targetSession?.summary) {
      return {
        items: [],
        total: 0,
        hasMore: false,
        elapsedMs: 0,
      };
    }

    // 使用标题和摘要作为搜索关键词
    const query = [targetSession.title, targetSession.summary]
      .filter(Boolean)
      .join(' ');

    const results = await this.search({
      query,
      fields: ['title', 'summary'],
      ...options,
    });

    // 排除当前会话
    results.items = results.items.filter(r => r.sessionKey !== sessionKey);
    results.total = results.items.length;

    return results;
  }

  /**
   * 关闭搜索器
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = undefined;
    }
  }

  // ========== 私有方法 ==========

  /**
   * 构建 FTS 查询
   */
  private buildFTSQuery(options: SessionSearchOptions): string {
    // FTS5 查询语法
    // 使用双引号包围词组进行精确匹配
    const terms = options.query
      .split(/\s+/)
      .filter(t => t.length > 0)
      .map(t => `"${t}"*`)  // 前缀匹配
      .join(' OR ');

    return terms;
  }

  /**
   * 执行搜索
   */
  private executeSearch(
    ftsQuery: string,
    options: SessionSearchOptions
  ): { items: SessionSearchResultItem[]; total: number; hasMore: boolean } {
    if (!this.db) {
      throw new Error('数据库未初始化');
    }

    // 构建基础查询
    let sql = `
      SELECT 
        s.key as sessionKey,
        s.title,
        s.summary,
        s.status as state,
        s.created_at as createdAt,
        s.updated_at as updatedAt,
        bm25(sessions_fts) as score
      FROM sessions s
      JOIN sessions_fts ON s.rowid = sessions_fts.rowid
      WHERE sessions_fts MATCH ?
    `;

    const params: (string | number)[] = [ftsQuery];

    // 状态过滤
    if (options.state) {
      sql += ' AND s.status = ?';
      params.push(options.state);
    }

    // 最小相关性分数
    sql += ' HAVING -bm25(sessions_fts) >= ?';
    params.push(options.minScore);

    // 排序
    if (options.orderBy === 'relevance') {
      sql += ' ORDER BY bm25(sessions_fts) ASC';  // BM25 返回负值，越接近 0 越相关
    } else if (options.orderBy === 'createdAt') {
      sql += ' ORDER BY s.created_at DESC';
    } else {
      sql += ' ORDER BY s.updated_at DESC';
    }

    // 获取总数
    const countSql = `SELECT COUNT(*) as total FROM (${sql})`;
    const countResult = this.db.query<{ total: number }, (string | number)[]>(countSql).get(...params);
    const total = countResult?.total ?? 0;

    // 分页
    sql += ' LIMIT ? OFFSET ?';
    params.push(options.limit, options.offset);

    // 执行查询
    const rows = this.db.query<{
      sessionKey: string;
      title: string | null;
      summary: string | null;
      state: string;
      createdAt: number;
      updatedAt: number;
      score: number;
    }, (string | number)[]>(sql).all(...params);

    // 转换结果
    const items: SessionSearchResultItem[] = rows.map(row => ({
      sessionKey: row.sessionKey as SessionKey,
      title: row.title,
      summary: row.summary,
      score: this.normalizeBM25Score(row.score),
      matchedFields: this.getMatchedFields(row, options.query),
      highlights: this.config.enableHighlight
        ? this.generateHighlights(row, options.query)
        : [],
      state: row.state as SessionState,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    }));

    return {
      items,
      total,
      hasMore: options.offset + items.length < total,
    };
  }

  /**
   * 标准化 BM25 分数
   */
  private normalizeBM25Score(score: number): number {
    // BM25 返回负值，转换为 0-1 范围
    // 使用 sigmoid 函数进行转换
    const normalized = 1 / (1 + Math.exp(score / 10));
    return Math.round(normalized * 1000) / 1000;
  }

  /**
   * 获取匹配字段
   */
  private getMatchedFields(
    row: { title: string | null; summary: string | null },
    query: string
  ): string[] {
    const fields: string[] = [];
    const terms = query.toLowerCase().split(/\s+/);

    if (row.title) {
      const titleLower = row.title.toLowerCase();
      if (terms.some(t => titleLower.includes(t))) {
        fields.push('title');
      }
    }

    if (row.summary) {
      const summaryLower = row.summary.toLowerCase();
      if (terms.some(t => summaryLower.includes(t))) {
        fields.push('summary');
      }
    }

    return fields;
  }

  /**
   * 生成高亮片段
   */
  private generateHighlights(
    row: { title: string | null; summary: string | null },
    query: string
  ): Array<{ field: string; snippet: string }> {
    const highlights: Array<{ field: string; snippet: string }> = [];
    const terms = query.toLowerCase().split(/\s+/);

    // 标题高亮
    if (row.title) {
      const highlighted = this.highlightText(row.title, terms);
      if (highlighted !== row.title) {
        highlights.push({ field: 'title', snippet: highlighted });
      }
    }

    // 摘要高亮
    if (row.summary) {
      const highlighted = this.highlightText(row.summary, terms);
      if (highlighted !== row.summary) {
        highlights.push({ field: 'summary', snippet: highlighted });
      }
    }

    return highlights;
  }

  /**
   * 高亮文本
   */
  private highlightText(text: string, terms: string[]): string {
    let result = text;

    for (const term of terms) {
      const regex = new RegExp(`(${this.escapeRegex(term)})`, 'gi');
      result = result.replace(regex, '==$1==');
    }

    return result;
  }

  /**
   * 转义正则表达式特殊字符
   */
  private escapeRegex(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * 展开路径
   */
  private expandPath(path: string): string {
    if (path.startsWith('~/')) {
      const { homedir } = require('os');
      return require('path').resolve(homedir(), path.slice(2));
    }
    return require('path').resolve(path);
  }
}

// ========== 便捷函数 ==========

/**
 * 快速搜索会话
 */
export async function searchSessions(
  query: string,
  options?: Partial<SessionSearchOptions>
): Promise<SessionSearchResult> {
  const searcher = new SessionSearcher();
  try {
    await searcher.initialize();
    return await searcher.search({ query, ...options });
  } finally {
    searcher.close();
  }
}
