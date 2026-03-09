/**
 * 记忆向量存储
 *
 * 优化后的向量存储实现，确保所有记忆存储时生成嵌入向量。
 */

import * as lancedb from '@lancedb/lancedb';
import { mkdir, appendFile, stat } from 'fs/promises';
import { join } from 'path';
import { getLogger } from '@logtape/logtape';
import type { MemoryEntry, MemoryStats, MemoryType } from '../../../../types/memory';
import type { MemoryStoreConfig, EmbeddingService, CleanupResult, MemoryFilter } from '../types';

const log = getLogger(['memory', 'store']);

/** 默认配置 */
const DEFAULT_CONFIG: Partial<MemoryStoreConfig> = {
  defaultSearchLimit: 10,
  maxSearchLimit: 50,
  shortTermRetentionDays: 7,
};

/** 存储记录结构 */
interface MemoryRecord {
  id: string;
  sessionKey: string;
  type: MemoryType;
  content: string;
  vector: number[];
  importance: number;
  stability: number;
  status: string;
  metadata: string;
  createdAt: number;
  updatedAt: number;
  accessedAt: number;
  accessCount: number;
  /** 索引签名（兼容 LanceDB） */
  [key: string]: unknown;
}

/**
 * 记忆向量存储
 *
 * 职责：
 * - 向量存储（LanceDB）
 * - Markdown 备份（人类可读）
 * - 基础 CRUD 操作
 * - 批量存储优化
 * - 嵌入向量生成
 */
export class MemoryVectorStore {
  private db: lancedb.Connection | null = null;
  private table: lancedb.Table | null = null;
  private config: MemoryStoreConfig;
  private initialized = false;
  private pendingEmbeddings: Array<{
    id: string;
    content: string;
    resolve: (vector: number[]) => void;
    reject: (error: Error) => void;
  }> = [];
  private embeddingTimer: Timer | null = null;

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
      const sampleRecord: MemoryRecord = {
        id: 'placeholder',
        sessionKey: '',
        type: 'other',
        content: '',
        vector: new Array(dimension || 1536).fill(0),
        importance: 0.5,
        stability: 1.0,
        status: 'active',
        metadata: '{}',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        accessedAt: Date.now(),
        accessCount: 0,
      };
      this.table = await this.db.createTable(tableName, [sampleRecord]);
      await this.table.delete('id = "placeholder"');
    }

    this.initialized = true;
    const count = await this.table?.countRows() ?? 0;
    log.info('记忆向量存储已初始化', { path: storagePath, existingCount: count });
  }

  /**
   * 存储单条记忆
   *
   * 自动生成嵌入向量并存储
   */
  async store(
    entry: Omit<MemoryEntry, 'id' | 'createdAt' | 'accessedAt' | 'accessCount'>
  ): Promise<string> {
    await this.ensureInitialized();

    const id = crypto.randomUUID();
    const now = new Date();

    // 生成嵌入向量
    const vector = await this.generateEmbedding(entry.content);

    // 构建完整记录
    const record: MemoryRecord = {
      id,
      sessionKey: entry.sessionKey ?? '',
      type: entry.type,
      content: entry.content,
      vector,
      importance: entry.importance,
      stability: entry.stability,
      status: entry.status,
      metadata: JSON.stringify(entry.metadata ?? {}),
      createdAt: now.getTime(),
      updatedAt: now.getTime(),
      accessedAt: now.getTime(),
      accessCount: 0,
    };

    // 存储到 LanceDB
    await this.table?.add([record]);

    // 存储 Markdown 备份
    await this.storeMarkdown({
      ...record,
      createdAt: now,
      accessedAt: now,
      accessCount: 0,
      embedding: vector.length > 0 ? vector : undefined,
    } as MemoryEntry);

    log.debug('记忆已存储', {
      id,
      type: entry.type,
      hasVector: vector.length > 0,
      importance: entry.importance,
    });

    return id;
  }

  /**
   * 批量存储记忆
   *
   * 优化：批量生成嵌入向量，减少 API 调用
   */
  async storeBatch(
    entries: Array<Omit<MemoryEntry, 'id' | 'createdAt' | 'accessedAt' | 'accessCount'>>
  ): Promise<string[]> {
    await this.ensureInitialized();

    if (entries.length === 0) {
      return [];
    }

    const now = new Date();
    const ids: string[] = [];

    // 批量生成嵌入向量
    const contents = entries.map(e => e.content);
    const vectors = await this.generateEmbeddingsBatch(contents);

    // 构建记录
    const records: MemoryRecord[] = entries.map((entry, i) => {
      const id = crypto.randomUUID();
      ids.push(id);

      return {
        id,
        sessionKey: entry.sessionKey ?? '',
        type: entry.type,
        content: entry.content,
        vector: vectors[i] ?? [],
        importance: entry.importance,
        stability: entry.stability,
        status: entry.status,
        metadata: JSON.stringify(entry.metadata ?? {}),
        createdAt: now.getTime(),
        updatedAt: now.getTime(),
        accessedAt: now.getTime(),
        accessCount: 0,
      };
    });

    // 批量存储到 LanceDB
    await this.table?.add(records);

    // 存储 Markdown 备份
    for (const record of records) {
      await this.storeMarkdown({
        ...record,
        createdAt: now,
        accessedAt: now,
        accessCount: 0,
        embedding: record.vector.length > 0 ? record.vector : undefined,
      } as MemoryEntry);
    }

    log.info('批量存储完成', { count: records.length });

    return ids;
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
   * 批量获取记忆
   */
  async getBatch(ids: string[]): Promise<MemoryEntry[]> {
    await this.ensureInitialized();

    if (ids.length === 0) {
      return [];
    }

    const idList = ids.map(id => `"${this.escape(id)}"`).join(', ');
    const results = await this.table
      ?.query()
      .where(`id IN (${idList})`)
      .toArray();

    return results?.map(r => this.recordToEntry(r)) ?? [];
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
   * 批量删除记忆
   */
  async deleteBatch(ids: string[]): Promise<void> {
    await this.ensureInitialized();

    if (ids.length === 0) return;

    const idList = ids.map(id => `"${this.escape(id)}"`).join(', ');
    await this.table?.delete(`id IN (${idList})`);

    log.debug('批量删除完成', { count: ids.length });
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
   * 更新重要性
   */
  async updateImportance(id: string, importance: number): Promise<void> {
    await this.ensureInitialized();

    // 获取现有记录
    const entry = await this.get(id);
    if (!entry) {
      log.warn('更新重要性失败：记录不存在', { id });
      return;
    }

    // 删除旧记录
    await this.table?.delete(`id = "${this.escape(id)}"`);

    // 插入更新后的记录
    const record: MemoryRecord = {
      id: entry.id,
      sessionKey: entry.sessionKey ?? '',
      type: entry.type,
      content: entry.content,
      vector: entry.embedding ?? [],
      importance,
      stability: entry.stability,
      status: entry.status,
      metadata: JSON.stringify(entry.metadata ?? {}),
      createdAt: entry.createdAt.getTime(),
      updatedAt: Date.now(),
      accessedAt: entry.accessedAt.getTime(),
      accessCount: entry.accessCount,
    };

    await this.table?.add([record]);
    log.debug('重要性已更新', { id, importance });
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
   * 向量检索
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

    // 应用过滤器
    let filtered = results;
    if (options?.filter) {
      filtered = this.applyFilter(results, options.filter);
    }

    return filtered.map((r) => ({
      entry: this.recordToEntry(r),
      score: 1 - ((r._distance as number) ?? 0),
    }));
  }

  /**
   * 按类型获取记忆
   */
  async getByType(type: MemoryType, limit?: number): Promise<MemoryEntry[]> {
    await this.ensureInitialized();

    const results = await this.table
      ?.query()
      .where(`type = "${type}"`)
      .limit(limit ?? 100)
      .toArray();

    return results?.map(r => this.recordToEntry(r)) ?? [];
  }

  /**
   * 获取高重要性记忆
   */
  async getHighImportance(threshold: number, limit?: number): Promise<MemoryEntry[]> {
    await this.ensureInitialized();

    const results = await this.table
      ?.query()
      .where(`importance >= ${threshold}`)
      .limit(limit ?? 100)
      .toArray();

    return results?.map(r => this.recordToEntry(r)) ?? [];
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
      .filter(r => {
        // 只清理非保护状态的记忆
        const status = r.status as string;
        const createdAt = r.createdAt as number;
        return status !== 'protected' && createdAt < cutoffTimestamp;
      })
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
    if (this.embeddingTimer) {
      clearTimeout(this.embeddingTimer);
      this.embeddingTimer = null;
    }
    this.initialized = false;
    log.info('记忆向量存储已关闭');
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
      } catch {
        // 忽略错误
      }
    }
    return 1536; // 默认维度
  }

  /**
   * 生成单条嵌入向量
   */
  private async generateEmbedding(content: string): Promise<number[]> {
    const embeddingService = this.config.embeddingService;

    if (!embeddingService?.isAvailable()) {
      log.debug('嵌入服务不可用，跳过向量生成');
      return [];
    }

    try {
      const vector = await embeddingService.embed(content);
      log.debug('嵌入向量生成成功', { dimension: vector.length });
      return vector;
    } catch (error) {
      log.error('嵌入向量生成失败', {
        error: String(error),
        contentLength: content.length,
      });
      return [];
    }
  }

  /**
   * 批量生成嵌入向量
   */
  private async generateEmbeddingsBatch(contents: string[]): Promise<number[][]> {
    const embeddingService = this.config.embeddingService;

    if (!embeddingService?.isAvailable()) {
      log.debug('嵌入服务不可用，跳过批量向量生成');
      return contents.map(() => []);
    }

    try {
      const vectors = await embeddingService.embedBatch(contents);
      log.debug('批量嵌入向量生成成功', {
        count: vectors.length,
        dimension: vectors[0]?.length ?? 0,
      });
      return vectors;
    } catch (error) {
      log.error('批量嵌入向量生成失败', {
        error: String(error),
        count: contents.length,
      });
      // 回退到逐个生成
      const results: number[][] = [];
      for (const content of contents) {
        try {
          results.push(await embeddingService.embed(content));
        } catch {
          results.push([]);
        }
      }
      return results;
    }
  }

  private recordToEntry(record: Record<string, unknown>): MemoryEntry {
    return {
      id: record.id as string,
      type: record.type as MemoryType,
      content: record.content as string,
      embedding: Array.isArray(record.vector) && (record.vector as number[]).length > 0
        ? record.vector as number[]
        : undefined,
      sessionKey: record.sessionKey as string | undefined,
      metadata: typeof record.metadata === 'string'
        ? JSON.parse(record.metadata)
        : record.metadata as Record<string, unknown>,
      createdAt: new Date(record.createdAt as number),
      accessedAt: new Date(record.accessedAt as number),
      accessCount: record.accessCount as number,
      importance: record.importance as number,
      stability: record.stability as number,
      status: record.status as MemoryEntry['status'],
    };
  }

  private applyFilter(
    results: Array<Record<string, unknown>>,
    filter: MemoryFilter
  ): Array<Record<string, unknown>> {
    return results.filter((r) => {
      // 类型过滤
      if (filter.types?.length && !filter.types.includes(r.type as MemoryType)) {
        return false;
      }

      // 会话过滤
      if (filter.sessionKey && r.sessionKey !== filter.sessionKey) {
        return false;
      }

      // 时间范围过滤
      if (filter.timeRange) {
        const createdAt = r.createdAt as number;
        if (filter.timeRange.start && createdAt < filter.timeRange.start.getTime()) {
          return false;
        }
        if (filter.timeRange.end && createdAt > filter.timeRange.end.getTime()) {
          return false;
        }
      }

      return true;
    });
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
      `**重要性**: ${entry.importance.toFixed(2)}`,
      '',
      '### 内容',
      '',
      entry.content,
    ].join('\n');
  }
}
