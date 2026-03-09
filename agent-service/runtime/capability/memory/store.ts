/**
 * 记忆存储
 *
 * 基于 LanceDB 的向量存储实现。
 */

import * as lancedb from '@lancedb/lancedb';
import { mkdir, appendFile, stat } from 'fs/promises';
import { join } from 'path';
import type { MemoryEntry, MemoryStats } from '../../../types/memory';
import type { MemoryStoreConfig, CleanupResult, MemoryFilter } from './types';
import { getLogger } from '@logtape/logtape';

const log = getLogger(['memory', 'store']);

/** 默认配置 */
const DEFAULT_CONFIG: Partial<MemoryStoreConfig> = {
  defaultSearchLimit: 10,
  maxSearchLimit: 50,
  shortTermRetentionDays: 7,
};

/**
 * 记忆存储
 *
 * 职责：
 * - 向量存储（LanceDB）
 * - Markdown 备份（人类可读）
 * - 基础 CRUD 操作
 */
export class MemoryStore {
  private db: lancedb.Connection | null = null;
  private table: lancedb.Table | null = null;
  private config: MemoryStoreConfig;
  private initialized = false;

  constructor(config: MemoryStoreConfig) {
    if (!config.storagePath) {
      throw new Error('storagePath is required');
    }
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 初始化存储
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    const storagePath = this.expandPath(this.config.storagePath);

    // 创建目录结构
    await mkdir(join(storagePath, 'sessions'), { recursive: true });
    await mkdir(join(storagePath, 'summaries'), { recursive: true });
    await mkdir(join(storagePath, 'lancedb'), { recursive: true });

    // 连接 LanceDB
    this.db = await lancedb.connect(join(storagePath, 'lancedb'));

    // 创建或打开表
    const tableName = 'memories';
    const tables = await this.db.tableNames();

    if (tables.includes(tableName)) {
      this.table = await this.db.openTable(tableName);
    } else {
      // 检测向量维度
      const dimension = await this.detectVectorDimension();
      const sampleRecord = {
        id: 'placeholder',
        sessionKey: '',
        type: 'other',
        content: '',
        vector: new Array(dimension || 1536).fill(0),
        metadata: '{}',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      this.table = await this.db.createTable(tableName, [sampleRecord]);
      await this.table.delete('id = "placeholder"');
    }

    this.initialized = true;
    const count = await this.table?.countRows() ?? 0;
    log.info('记忆存储已初始化', { path: storagePath, existingCount: count });
  }

  /**
   * 存储记忆
   */
  async store(entry: Omit<MemoryEntry, 'id' | 'createdAt' | 'accessedAt' | 'accessCount'>): Promise<string> {
    await this.ensureInitialized();

    const id = crypto.randomUUID();
    const now = new Date();
    const fullEntry: MemoryEntry = {
      ...entry,
      id,
      createdAt: now,
      accessedAt: now,
      accessCount: 0,
    };

    // 获取向量
    let vector: number[] = [];
    if (this.config.embeddingService?.isAvailable()) {
      try {
        vector = await this.config.embeddingService.embed(entry.content);
      } catch (e) {
        log.warn('向量生成失败', { error: String(e) });
      }
    }

    // 存储到 LanceDB
    const record = {
      id: fullEntry.id,
      sessionKey: fullEntry.sessionKey ?? '',
      type: fullEntry.type,
      content: fullEntry.content,
      vector,
      metadata: JSON.stringify(fullEntry.metadata ?? {}),
      createdAt: fullEntry.createdAt.getTime(),
      updatedAt: now.getTime(),
    };

    await this.table?.add([record]);

    // 存储到 Markdown
    await this.storeMarkdown(fullEntry);

    log.debug('记忆已存储', { id, type: entry.type, hasVector: vector.length > 0 });
    return id;
  }

  /**
   * 获取记忆
   */
  async get(id: string): Promise<MemoryEntry | undefined> {
    await this.ensureInitialized();

    const results = await this.table
      ?.query()
      .where(`id = "${this.escape(id)}"`)
      .limit(1)
      .toArray();

    return results?.[0] ? this.recordToEntry(results[0]) : undefined;
  }

  /**
   * 删除记忆
   */
  async delete(id: string): Promise<void> {
    await this.ensureInitialized();
    await this.table?.delete(`id = "${this.escape(id)}"`);
    log.debug('记忆已删除', { id });
  }

  /**
   * 更新访问时间
   */
  async touch(id: string): Promise<void> {
    await this.ensureInitialized();
    // LanceDB 不支持单字段更新，需要删除后重新插入
    // 简化实现：仅记录日志
    log.debug('记忆已访问', { id });
  }

  /**
   * 获取最近记忆
   */
  async getRecent(sessionKey: string, limit: number = 20): Promise<MemoryEntry[]> {
    await this.ensureInitialized();

    const results = await this.table
      ?.query()
      .where(`sessionKey = "${this.escape(sessionKey)}"`)
      .limit(limit)
      .toArray();

    return results?.map(r => this.recordToEntry(r)) ?? [];
  }

  /**
   * 清除会话记忆
   */
  async clearSession(sessionKey: string): Promise<void> {
    await this.ensureInitialized();
    await this.table?.delete(`sessionKey = "${this.escape(sessionKey)}"`);
    log.info('会话记忆已清除', { sessionKey });
  }

  /**
   * 搜索记忆（向量检索）
   */
  async search(query: string, options?: {
    limit?: number;
    minScore?: number;
    filter?: MemoryFilter;
  }): Promise<Array<{ entry: MemoryEntry; score: number }>> {
    await this.ensureInitialized();

    const embeddingService = this.config.embeddingService;
    if (!embeddingService?.isAvailable()) {
      log.warn('嵌入服务不可用，无法进行向量检索');
      return [];
    }

    if (!this.table) {
      return [];
    }

    const queryVector = await embeddingService.embed(query);
    const limit = options?.limit ?? this.config.defaultSearchLimit ?? 10;

    // 使用 LanceDB 向量检索
    const results = await this.table
      .vectorSearch(queryVector)
      .limit(limit)
      .toArray() as Array<Record<string, unknown>>;

    return results.map((r) => ({
      entry: this.recordToEntry(r),
      score: 1 - ((r._distance as number) ?? 0), // 转换距离为相似度
    }));
  }

  /**
   * 获取统计信息
   */
  async getStats(): Promise<MemoryStats> {
    await this.ensureInitialized();

    const results = await this.table?.query().toArray();
    const entries = results ?? [];

    const sessions = new Set(entries.map(e => e.sessionKey as string));
    const timestamps = entries.map(e => e.createdAt as number);

    return {
      totalEntries: entries.length,
      totalSessions: sessions.size,
      totalSize: 0,
      oldestEntry: timestamps.length > 0 ? new Date(Math.min(...timestamps)) : null,
      newestEntry: timestamps.length > 0 ? new Date(Math.max(...timestamps)) : null,
    };
  }

  /**
   * 清理过期记忆
   */
  async cleanupExpired(): Promise<CleanupResult> {
    await this.ensureInitialized();

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - (this.config.shortTermRetentionDays ?? 7));
    const cutoffTimestamp = cutoffDate.getTime();

    const results = await this.table?.query().toArray();
    const expired = (results ?? [])
      .filter(r => (r.createdAt as number) < cutoffTimestamp)
      .map(r => r.id as string);

    for (const id of expired) {
      await this.table?.delete(`id = "${this.escape(id)}"`);
    }

    log.info('过期记忆已清理', { count: expired.length });
    return {
      deletedCount: expired.length,
      summarizedCount: 0,
      errors: [],
    };
  }

  /**
   * 关闭存储
   */
  async close(): Promise<void> {
    this.initialized = false;
    log.info('记忆存储已关闭');
  }

  // ========== 私有方法 ==========

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  private expandPath(path: string): string {
    if (path.startsWith('~')) {
      const home = process.env.USERPROFILE ?? process.env.HOME ?? '';
      return join(home, path.slice(1));
    }
    return path;
  }

  private escape(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  private async detectVectorDimension(): Promise<number> {
    if (this.config.embeddingService?.isAvailable()) {
      try {
        const sample = await this.config.embeddingService.embed('test');
        return sample.length;
      } catch {}
    }
    return 1536; // 默认维度
  }

  private recordToEntry(record: Record<string, unknown>): MemoryEntry {
    return {
      id: record.id as string,
      type: record.type as MemoryEntry['type'],
      content: record.content as string,
      embedding: Array.isArray(record.vector) && (record.vector as number[]).length > 0
        ? record.vector as number[]
        : undefined,
      sessionKey: record.sessionKey as string | undefined,
      metadata: typeof record.metadata === 'string' ? JSON.parse(record.metadata) : record.metadata,
      createdAt: new Date(record.createdAt as number),
      accessedAt: new Date(record.updatedAt as number),
      accessCount: 0,
      importance: 0.5,
      stability: 1.0,
      status: 'active',
    };
  }

  private async storeMarkdown(entry: MemoryEntry): Promise<void> {
    const storagePath = this.expandPath(this.config.storagePath);
    const sessionsPath = join(storagePath, 'sessions');
    await mkdir(sessionsPath, { recursive: true });

    const today = new Date().toISOString().slice(0, 10);
    const mdPath = join(sessionsPath, `${today}.md`);

    let isNewFile = false;
    try {
      await stat(mdPath);
    } catch {
      isNewFile = true;
    }

    const header = isNewFile ? `# 记忆 - ${today}\n\n` : '\n---\n\n';
    const content = this.formatEntryMarkdown(entry);

    await appendFile(mdPath, header + content + '\n', 'utf-8');
  }

  private formatEntryMarkdown(entry: MemoryEntry): string {
    const typeLabel: Record<string, string> = {
      preference: '❤️ 偏好',
      fact: '📋 事实',
      decision: '✅ 决策',
      entity: '👤 实体',
      conversation: '💬 对话',
      summary: '📝 摘要',
      document: '📄 文档',
      other: '📦 其他',
    };

    return [
      `## ${typeLabel[entry.type] ?? '📦 其他'}`,
      '',
      `**ID**: \`${entry.id}\``,
      `**会话**: \`${entry.sessionKey ?? 'N/A'}\``,
      `**时间**: ${entry.createdAt.toLocaleString('zh-CN')}`,
      '',
      '### 内容',
      '',
      entry.content,
    ].join('\n');
  }
}
