/**
 * 会话列表管理器 (T046)
 *
 * 实现会话列表、查看、删除、归档、星标功能。
 */

import { Database } from 'bun:sqlite';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { z } from 'zod';
import { getLogger } from '@logtape/logtape';
import {
  type SessionManagerConfig,
  type SessionUpdateOptions,
} from './types';
import type {
  SessionKey,
  SessionState,
  SessionTag,
  SessionListItem,
  SessionListFilter,
  SessionListSort,
  SessionListPagination,
  SessionListResult,
} from '../../../types/session';

const log = getLogger(['capability', 'session', 'manager']);

/** 默认配置 */
const DEFAULT_CONFIG: SessionManagerConfig = {
  dbPath: '~/.micro-agent/data/sessions.db',
  defaultPageSize: 20,
  maxPageSize: 100,
};

/**
 * 会话管理器
 *
 * 职责：
 * - 会话列表查询（分页、过滤、排序）
 * - 会话状态管理（归档、关闭）
 * - 会话星标和标签管理
 * - 会话删除
 */
export class SessionManager {
  private config: SessionManagerConfig;
  private db?: Database;

  constructor(config?: Partial<SessionManagerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 初始化管理器
   */
  async initialize(): Promise<void> {
    const dbPath = this.expandPath(this.config.dbPath);

    // 确保数据库目录存在
    const dbDir = dirname(dbPath);
    if (!existsSync(dbDir)) {
      mkdirSync(dbDir, { recursive: true });
    }

    this.db = new Database(dbPath);
    log.info('会话管理器已初始化', { dbPath });
  }

  /**
   * 获取会话列表
   *
   * @param filter - 过滤选项
   * @param sort - 排序选项
   * @param pagination - 分页选项
   * @returns 会话列表结果
   */
  async list(
    filter?: SessionListFilter,
    sort?: SessionListSort,
    pagination?: Partial<SessionListPagination>
  ): Promise<SessionListResult> {
    if (!this.db) {
      await this.initialize();
    }

    const page = pagination?.page ?? 1;
    const pageSize = Math.min(
      pagination?.pageSize ?? this.config.defaultPageSize,
      this.config.maxPageSize
    );

    // 构建查询
    const { sql, params, countSql, countParams } = this.buildListQuery(filter, sort);

    // 获取总数
    const countResult = this.db!.query<{ total: number }, (string | number)[]>(
      countSql
    ).get(...countParams as (string | number)[]);
    const total = countResult?.total ?? 0;

    // 分页查询
    const offset = (page - 1) * pageSize;
    const items = this.db!.query<{
      key: string;
      title: string | null;
      summary: string | null;
      status: string;
      is_starred: number;
      tags: string;
      message_count: number;
      created_at: number;
      updated_at: number;
    }, (string | number)[]>(
      `${sql} LIMIT ? OFFSET ?`
    ).all(...params as (string | number)[], pageSize, offset);

    return {
      items: items.map(row => this.mapToListItem(row)),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * 获取会话详情
   *
   * @param sessionKey - 会话键
   * @returns 会话列表项
   */
  async get(sessionKey: SessionKey): Promise<SessionListItem | null> {
    if (!this.db) {
      await this.initialize();
    }

    const row = this.db!.query<{
      key: string;
      title: string | null;
      summary: string | null;
      status: string;
      is_starred: number;
      tags: string;
      message_count: number;
      created_at: number;
      updated_at: number;
    }, [string]>(`
      SELECT 
        key,
        title,
        summary,
        status,
        is_starred,
        tags,
        message_count,
        created_at,
        updated_at
      FROM sessions
      WHERE key = ?
    `).get(sessionKey);

    return row ? this.mapToListItem(row) : null;
  }

  /**
   * 更新会话
   *
   * @param sessionKey - 会话键
   * @param options - 更新选项
   */
  async update(sessionKey: SessionKey, options: SessionUpdateOptions): Promise<void> {
    if (!this.db) {
      await this.initialize();
    }

    const updates: string[] = [];
    const params: (string | number)[] = [];

    if (options.title !== undefined) {
      updates.push('title = ?');
      params.push(options.title);
    }

    if (options.summary !== undefined) {
      updates.push('summary = ?');
      params.push(options.summary);
    }

    if (options.state !== undefined) {
      updates.push('status = ?');
      params.push(options.state);
    }

    if (options.isStarred !== undefined) {
      updates.push('is_starred = ?');
      params.push(options.isStarred ? 1 : 0);
    }

    if (options.tags !== undefined) {
      updates.push('tags = ?');
      params.push(JSON.stringify(options.tags));

      // 同步更新标签表
      this.syncTags(sessionKey, options.tags);
    }

    if (updates.length === 0) {
      return;
    }

    updates.push('updated_at = ?');
    params.push(Date.now());

    params.push(sessionKey);

    this.db!.run(
      `UPDATE sessions SET ${updates.join(', ')} WHERE key = ?`,
      params
    );

    log.debug('会话已更新', { sessionKey, options });
  }

  /**
   * 删除会话
   *
   * @param sessionKey - 会话键
   */
  async delete(sessionKey: SessionKey): Promise<void> {
    if (!this.db) {
      await this.initialize();
    }

    // 删除标签关联
    this.db!.run('DELETE FROM session_tags WHERE session_key = ?', [sessionKey]);

    // 删除消息（级联）
    this.db!.run('DELETE FROM messages WHERE session_key = ?', [sessionKey]);

    // 删除会话上下文配置
    this.db!.run('DELETE FROM session_context_configs WHERE session_key = ?', [sessionKey]);

    // 删除会话
    this.db!.run('DELETE FROM sessions WHERE key = ?', [sessionKey]);

    log.info('会话已删除', { sessionKey });
  }

  /**
   * 归档会话
   *
   * @param sessionKey - 会话键
   */
  async archive(sessionKey: SessionKey): Promise<void> {
    await this.update(sessionKey, { state: 'archived' });
    log.info('会话已归档', { sessionKey });
  }

  /**
   * 恢复会话
   *
   * @param sessionKey - 会话键
   */
  async restore(sessionKey: SessionKey): Promise<void> {
    await this.update(sessionKey, { state: 'active' });
    log.info('会话已恢复', { sessionKey });
  }

  /**
   * 设置星标
   *
   * @param sessionKey - 会话键
   * @param starred - 是否星标
   */
  async setStarred(sessionKey: SessionKey, starred: boolean): Promise<void> {
    await this.update(sessionKey, { isStarred: starred });
    log.debug('会话星标已更新', { sessionKey, starred });
  }

  /**
   * 切换星标
   *
   * @param sessionKey - 会话键
   * @returns 新的星标状态
   */
  async toggleStar(sessionKey: SessionKey): Promise<boolean> {
    const session = await this.get(sessionKey);
    if (!session) {
      throw new Error(`会话不存在: ${sessionKey}`);
    }

    const newStarred = !session.isStarred;
    await this.setStarred(sessionKey, newStarred);
    return newStarred;
  }

  /**
   * 添加标签
   *
   * @param sessionKey - 会话键
   * @param tag - 标签
   */
  async addTag(sessionKey: SessionKey, tag: SessionTag): Promise<void> {
    const session = await this.get(sessionKey);
    if (!session) {
      throw new Error(`会话不存在: ${sessionKey}`);
    }

    const tags = [...new Set([...session.tags, tag])];
    await this.update(sessionKey, { tags });
    log.debug('标签已添加', { sessionKey, tag });
  }

  /**
   * 移除标签
   *
   * @param sessionKey - 会话键
   * @param tag - 标签
   */
  async removeTag(sessionKey: SessionKey, tag: SessionTag): Promise<void> {
    const session = await this.get(sessionKey);
    if (!session) {
      throw new Error(`会话不存在: ${sessionKey}`);
    }

    const tags = session.tags.filter(t => t !== tag);
    await this.update(sessionKey, { tags });
    log.debug('标签已移除', { sessionKey, tag });
  }

  /**
   * 获取星标会话
   *
   * @param pagination - 分页选项
   * @returns 会话列表
   */
  async getStarred(pagination?: Partial<SessionListPagination>): Promise<SessionListResult> {
    return this.list({ isStarred: true }, undefined, pagination);
  }

  /**
   * 获取归档会话
   *
   * @param pagination - 分页选项
   * @returns 会话列表
   */
  async getArchived(pagination?: Partial<SessionListPagination>): Promise<SessionListResult> {
    return this.list({ state: 'archived' }, undefined, pagination);
  }

  /**
   * 批量删除会话
   *
   * @param sessionKeys - 会话键列表
   * @returns 删除数量
   */
  async batchDelete(sessionKeys: SessionKey[]): Promise<number> {
    let count = 0;
    for (const key of sessionKeys) {
      try {
        await this.delete(key);
        count++;
      } catch (error) {
        log.warn('批量删除失败', { sessionKey: key, error: String(error) });
      }
    }
    return count;
  }

  /**
   * 关闭管理器
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = undefined;
    }
  }

  // ========== 私有方法 ==========

  /**
   * 构建列表查询
   */
  private buildListQuery(
    filter?: SessionListFilter,
    sort?: SessionListSort
  ): { sql: string; params: (string | number)[]; countSql: string; countParams: (string | number)[] } {
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    // 状态过滤
    if (filter?.state) {
      if (Array.isArray(filter.state)) {
        conditions.push(`status IN (${filter.state.map(() => '?').join(', ')})`);
        params.push(...filter.state);
      } else {
        conditions.push('status = ?');
        params.push(filter.state);
      }
    }

    // 星标过滤
    if (filter?.isStarred !== undefined) {
      conditions.push('is_starred = ?');
      params.push(filter.isStarred ? 1 : 0);
    }

    // 标签过滤
    if (filter?.tags && filter.tags.length > 0) {
      conditions.push(`
        key IN (
          SELECT session_key FROM session_tags 
          WHERE tag IN (${filter.tags.map(() => '?').join(', ')})
        )
      `);
      params.push(...filter.tags);
    }

    // 搜索关键词
    if (filter?.search) {
      conditions.push(`
        key IN (
          SELECT sessions.key FROM sessions
          JOIN sessions_fts ON sessions.rowid = sessions_fts.rowid
          WHERE sessions_fts MATCH ?
        )
      `);
      // 转义 FTS 特殊字符
      const searchTerm = filter.search.replace(/['"]/g, '');
      params.push(`"${searchTerm}"*`);
    }

    // 时间范围
    if (filter?.createdAfter) {
      conditions.push('created_at >= ?');
      params.push(filter.createdAfter.getTime());
    }

    if (filter?.createdBefore) {
      conditions.push('created_at <= ?');
      params.push(filter.createdBefore.getTime());
    }

    const whereClause = conditions.length > 0
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    // 排序
    const sortField = sort?.field ?? 'updatedAt';
    const sortOrder = sort?.order ?? 'desc';
    const orderClause = `ORDER BY ${this.mapSortField(sortField)} ${sortOrder.toUpperCase()}`;

    const sql = `
      SELECT 
        key,
        title,
        summary,
        status,
        is_starred,
        tags,
        message_count,
        created_at,
        updated_at
      FROM sessions
      ${whereClause}
      ${orderClause}
    `;

    return {
      sql,
      params,
      countSql: `SELECT COUNT(*) as total FROM sessions ${whereClause}`,
      countParams: params,
    };
  }

  /**
   * 映射排序字段
   */
  private mapSortField(field: string): string {
    const fieldMap: Record<string, string> = {
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      lastActiveAt: 'updated_at',
      messageCount: 'message_count',
      title: 'title',
    };
    return fieldMap[field] ?? 'updated_at';
  }

  /**
   * 映射到列表项
   */
  private mapToListItem(row: {
    key: string;
    title: string | null;
    summary: string | null;
    status: string;
    is_starred: number;
    tags: string;
    message_count: number;
    created_at: number;
    updated_at: number;
  }): SessionListItem {
    let tags: SessionTag[] = [];
    try {
      tags = JSON.parse(row.tags ?? '[]');
    } catch {
      // 忽略解析错误
    }

    return {
      sessionKey: row.key as SessionKey,
      title: row.title,
      summary: row.summary,
      state: row.status as SessionState,
      isStarred: row.is_starred === 1,
      tags,
      messageCount: row.message_count,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      lastActiveAt: new Date(row.updated_at),
    };
  }

  /**
   * 同步标签表
   */
  private syncTags(sessionKey: SessionKey, tags: SessionTag[]): void {
    if (!this.db) return;

    // 删除现有标签
    this.db.run('DELETE FROM session_tags WHERE session_key = ?', [sessionKey]);

    // 插入新标签
    const now = Date.now();
    const insertStmt = this.db.query(`
      INSERT INTO session_tags (session_key, tag, created_at)
      VALUES (?, ?, ?)
    `);

    for (const tag of tags) {
      try {
        insertStmt.run(sessionKey, tag, now);
      } catch {
        // 忽略重复标签错误
      }
    }
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
 * 快速获取会话列表
 */
export async function listSessions(
  filter?: SessionListFilter,
  pagination?: Partial<SessionListPagination>
): Promise<SessionListResult> {
  const manager = new SessionManager();
  try {
    await manager.initialize();
    return await manager.list(filter, undefined, pagination);
  } finally {
    manager.close();
  }
}
