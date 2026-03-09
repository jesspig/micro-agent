/**
 * FTS5 全文检索器
 *
 * 基于 SQLite FTS5 的全文检索实现，支持 BM25 排序。
 */

import { Database } from 'bun:sqlite';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { getLogger } from '@logtape/logtape';
import type { MemoryEntry, MemoryType } from '../../../../types/memory';

const log = getLogger(['memory', 'fts-searcher']);

/** FTS 检索选项 */
export interface FTSSearchOptions {
  /** 搜索查询字符串 */
  query: string;
  /** 返回结果数量限制 */
  limit?: number;
  /** 最小 BM25 分数阈值 */
  minScore?: number;
  /** 过滤记忆类型 */
  types?: MemoryType[];
  /** 过滤会话键 */
  sessionKey?: string;
}

/** FTS 检索结果 */
export interface FTSSearchResult {
  /** 匹配的记忆条目 */
  entry: MemoryEntry;
  /** BM25 分数 */
  score: number;
}

/** FTS 检索器配置 */
export interface FTSSearcherConfig {
  /** SQLite 数据库路径 */
  dbPath: string;
  /** FTS 表名 */
  tableName?: string;
  /** BM25 参数 k1（词频饱和度） */
  bm25k1?: number;
  /** BM25 参数 b（文档长度归一化） */
  bm25b?: number;
}

/**
 * FTS5 全文检索器
 *
 * 使用 SQLite FTS5 虚拟表实现全文检索：
 * - BM25 排序算法
 * - 支持中文分词（使用 Unicode tokenizer）
 * - 支持最小分数过滤
 */
export class FTSSearcher {
  private db: Database;
  private tableName: string;
  private bm25k1: number;
  private bm25b: number;

  constructor(config: FTSSearcherConfig) {
    this.tableName = config.tableName ?? 'memory_fts';
    this.bm25k1 = config.bm25k1 ?? 1.2;
    this.bm25b = config.bm25b ?? 0.75;

    // 确保数据库目录存在
    const dbDir = dirname(config.dbPath);
    if (!existsSync(dbDir)) {
      mkdirSync(dbDir, { recursive: true });
    }

    this.db = new Database(config.dbPath);
    this.ensureTable();
  }

  /** 确保 FTS 表存在 */
  private ensureTable(): void {
    // 创建 FTS5 虚拟表
    this.db.run(`
      CREATE VIRTUAL TABLE IF NOT EXISTS ${this.tableName} USING fts5(
        id,
        content,
        type,
        sessionKey,
        tokenize='unicode61'
      )
    `);
    log.debug('FTS5 表已就绪', { tableName: this.tableName });
  }

  /**
   * 索引记忆条目
   * @param entry - 记忆条目
   */
  index(entry: MemoryEntry): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO ${this.tableName} (id, content, type, sessionKey)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(
      entry.id,
      entry.content,
      entry.type,
      entry.sessionKey ?? null
    );
    log.debug('已索引记忆', { id: entry.id });
  }

  /**
   * 批量索引
   * @param entries - 记忆条目数组
   */
  indexBatch(entries: MemoryEntry[]): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO ${this.tableName} (id, content, type, sessionKey)
      VALUES (?, ?, ?, ?)
    `);

    const transaction = this.db.transaction(() => {
      for (const entry of entries) {
        stmt.run(
          entry.id,
          entry.content,
          entry.type,
          entry.sessionKey ?? null
        );
      }
    });

    transaction();
    log.debug('批量索引完成', { count: entries.length });
  }

  /**
   * 删除索引
   * @param id - 记忆 ID
   */
  delete(id: string): void {
    const stmt = this.db.prepare(`DELETE FROM ${this.tableName} WHERE id = ?`);
    stmt.run(id);
    log.debug('已删除索引', { id });
  }

  /**
   * 全文检索
   * @param options - 检索选项
   * @returns 检索结果数组
   */
  search(options: FTSSearchOptions): FTSSearchResult[] {
    const { query, limit = 10, minScore = 0, types, sessionKey } = options;

    // 构建 FTS 查询
    // 使用 BM25 排序，参数为 (k1, b)
    let sql = `
      SELECT 
        id,
        content,
        type,
        sessionKey,
        bm25(${this.tableName}, ${this.bm25k1}, ${this.bm25b}) as score
      FROM ${this.tableName}
      WHERE ${this.tableName} MATCH ?
    `;

    const params: (string | number)[] = [query];

    // 添加类型过滤
    if (types && types.length > 0) {
      const typePlaceholders = types.map(() => '?').join(', ');
      sql += ` AND type IN (${typePlaceholders})`;
      params.push(...types);
    }

    // 添加会话过滤
    if (sessionKey) {
      sql += ` AND sessionKey = ?`;
      params.push(sessionKey);
    }

    // 过滤最小分数（在应用层过滤，因为 FTS5 不支持 WHERE 子句中的分数过滤）
    sql += ` ORDER BY score ASC LIMIT ?`;
    params.push(limit * 2); // 获取更多结果用于分数过滤

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as Array<{
      id: string;
      content: string;
      type: MemoryType;
      sessionKey: string | null;
      score: number;
    }>;

    // 过滤分数并构建结果
    const results: FTSSearchResult[] = [];
    for (const row of rows) {
      // BM25 返回负分数，值越大（越接近0）越相关
      const score = -row.score;
      if (score >= minScore) {
        const entry: MemoryEntry = {
          id: row.id,
          type: row.type,
          content: row.content,
          sessionKey: row.sessionKey ?? undefined,
          createdAt: new Date(),
          accessedAt: new Date(),
          accessCount: 0,
          importance: 0.5,
          stability: 1.0,
          status: 'active',
        };
        results.push({ entry, score });
      }
      if (results.length >= limit) break;
    }

    log.debug('FTS 检索完成', { query, resultCount: results.length });
    return results;
  }

  /**
   * 获取索引统计
   */
  getStats(): { totalCount: number } {
    const stmt = this.db.prepare(`SELECT COUNT(*) as count FROM ${this.tableName}`);
    const row = stmt.get() as { count: number };
    return { totalCount: row.count };
  }

  /**
   * 关闭数据库连接
   */
  close(): void {
    this.db.close();
    log.debug('FTS 检索器已关闭');
  }
}
