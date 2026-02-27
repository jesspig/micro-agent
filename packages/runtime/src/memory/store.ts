/**
 * 记忆存储 - LanceDB 集成
 * 
 * 双存储架构：
 * - LanceDB：向量检索 + 全文检索
 * - Markdown：人类可读的会话记录（YYYY-MM-DD-<batch>.md）
 */

import * as lancedb from '@lancedb/lancedb';
import { mkdir, writeFile, readFile, readdir, unlink, stat, appendFile } from 'fs/promises';
import { join, basename } from 'path';
import type { MemoryEntry, Summary, MemoryStats, SearchOptions, MemoryFilter } from '../types';
import type { MemoryStoreConfig, CleanupResult, EmbeddingService } from './types';
import { getLogger } from '@logtape/logtape';

const log = getLogger(['memory', 'store']);

/** 默认配置 */
const DEFAULT_CONFIG: Partial<MemoryStoreConfig> = {
  defaultSearchLimit: 10,
  maxSearchLimit: 50,
  shortTermRetentionDays: 7,
  // vectorDimension 不设置默认值，由 detectVectorDimension 动态检测
};

/**
 * LanceDB 记录结构
 */
type LanceDBRecord = Record<string, unknown>;

/**
 * 记忆存储
 * 
 * 双存储架构：
 * - LanceDB：向量检索 + 全文检索（主存储）
 * - Markdown：人类可读备份（YYYY-MM-DD-<batch>.md）
 */
export class MemoryStore {
  private db: lancedb.Connection | null = null;
  private table: lancedb.Table | null = null;
  private config: MemoryStoreConfig;
  private initialized = false;

  constructor(config: MemoryStoreConfig) {
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
      const existingCount = await this.table.countRows();
      log.info('📐 [MemoryStore] 打开已有向量表', { 
        existingEntries: existingCount 
      });
    } else {
      // 动态检测嵌入维度
      const vectorDimension = await this.detectVectorDimension();
      
      if (vectorDimension === 0) {
        // 全文检索模式：使用默认维度创建表（未来可能启用向量检索）
        log.info('📐 [MemoryStore] 创建向量表（全文检索模式）');
      }
      
      // 创建表，使用示例数据定义 schema
      const sampleRecord: Record<string, unknown> = {
        id: 'placeholder',
        sessionId: 'placeholder',
        type: 'placeholder',
        content: 'placeholder',
        vector: new Array(vectorDimension || 1536).fill(0), // 使用检测到的维度或默认维度
        metadata: '{}',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      this.table = await this.db.createTable(tableName, [sampleRecord]);
      // 删除占位符
      await this.table.delete('id = "placeholder"');
      
      log.info('📐 [MemoryStore] 创建向量表', { 
        vectorDimension: vectorDimension || 1536,
        mode: vectorDimension === 0 ? 'fulltext' : 'vector',
        embeddingAvailable: this.config.embeddingService?.isAvailable() ?? false
      });
    }

    this.initialized = true;
    
    // 显示已有记忆数量
    const existingCount = await this.table?.countRows() ?? 0;
    log.debug('记忆存储已初始化', { 
      path: storagePath,
      existingEntries: existingCount
    });
    
    if (existingCount > 0) {
      log.debug('📚 [MemoryStore] 加载已有记忆', { count: existingCount });
    }
  }

  /**
   * 动态检测嵌入向量维度
   */
  private async detectVectorDimension(): Promise<number> {
    // 尝试通过嵌入服务获取实际维度
    if (this.config.embeddingService?.isAvailable()) {
      try {
        const sampleVector = await this.config.embeddingService.embed('test');
        const dimension = sampleVector.length;
        log.info('📐 [MemoryStore] 检测到嵌入模型维度', { dimension });
        return dimension;
      } catch (error) {
        log.warn('📐 [MemoryStore] 嵌入维度检测失败', { 
          error: String(error)
        });
      }
    }

    // 降级：使用全文检索模式（向量维度设为 0）
    log.info('📐 [MemoryStore] 无可用嵌入服务，使用全文检索模式');
    return 0;
  }

  /**
   * 存储记忆条目（双存储）
   */
  async store(entry: MemoryEntry): Promise<void> {
    await this.ensureInitialized();

    // 获取向量（如果嵌入服务可用）
    const vector = entry.vector ?? (await this.getEmbedding(entry.content));

    // 1. 存储到 LanceDB（主存储）
    const record: Record<string, unknown> = {
      id: entry.id,
      sessionId: entry.sessionId,
      type: entry.type,
      content: entry.content,
      vector: vector ?? [],
      metadata: JSON.stringify(entry.metadata),
      createdAt: entry.createdAt.getTime(),
      updatedAt: entry.updatedAt.getTime(),
    };

    await this.table?.add([record]);

    // 2. 存储到 Markdown（人类可读备份）
    await this.storeMarkdown(entry);

    log.debug('💾 [MemoryStore] 记忆已存储', { 
      id: entry.id, 
      type: entry.type,
      sessionId: entry.sessionId,
      hasVector: !!vector,
      mode: vector ? 'vector' : 'fulltext'
    });
  }

  /**
   * 批量存储记忆条目
   */
  async storeBatch(entries: MemoryEntry[]): Promise<void> {
    await this.ensureInitialized();

    const records: Record<string, unknown>[] = [];

    for (const entry of entries) {
      const vector = entry.vector ?? (await this.getEmbedding(entry.content));
      records.push({
        id: entry.id,
        sessionId: entry.sessionId,
        type: entry.type,
        content: entry.content,
        vector: vector ?? [],
        metadata: JSON.stringify(entry.metadata),
        createdAt: entry.createdAt.getTime(),
        updatedAt: entry.updatedAt.getTime(),
      });
    }

    // 批量写入 LanceDB
    await this.table?.add(records);

    // 批量写入 Markdown
    for (const entry of entries) {
      await this.storeMarkdown(entry);
    }

    log.info('💾 [MemoryStore] 批量存储完成', { count: entries.length });
  }

  /**
   * 搜索记忆（智能检索）
   * 
   * 策略：
   * 1. 优先使用向量检索（如果嵌入服务可用）
   * 2. 向量检索失败时自动回退到全文检索
   * 3. 支持 hybrid 模式：向量 + 全文合并结果
   */
  async search(query: string, options?: SearchOptions): Promise<MemoryEntry[]> {
    await this.ensureInitialized();

    const limit = Math.min(
      options?.limit ?? this.config.defaultSearchLimit!,
      this.config.maxSearchLimit!
    );

    const mode = options?.mode ?? 'auto';
    const hasEmbedding = this.config.embeddingService?.isAvailable();

    log.debug('🔍 [MemoryStore] 开始搜索', { 
      query: query.slice(0, 50),
      limit,
      mode,
      hasEmbedding
    });

    // 根据模式选择检索策略
    switch (mode) {
      case 'fulltext':
        return this.fulltextSearch(query, limit, options?.filter);
      
      case 'vector':
        if (!hasEmbedding) {
          log.warn('🔍 [MemoryStore] 向量模式但嵌入服务不可用，回退到全文检索');
          return this.fulltextSearch(query, limit, options?.filter);
        }
        return this.vectorSearch(query, limit, options?.filter);
      
      case 'hybrid':
        return this.hybridSearch(query, limit, options?.filter);
      
      case 'auto':
      default:
        // 自动模式：优先向量，失败回退全文
        if (hasEmbedding) {
          const results = await this.vectorSearch(query, limit, options?.filter);
          if (results.length > 0) {
            return results;
          }
          // 向量检索无结果，尝试全文检索
          log.debug('🔍 [MemoryStore] 向量检索无结果，尝试全文检索');
          return this.fulltextSearch(query, limit, options?.filter);
        }
        return this.fulltextSearch(query, limit, options?.filter);
    }
  }

  /**
   * 混合检索（向量 + 全文）
   */
  private async hybridSearch(query: string, limit: number, filter?: MemoryFilter): Promise<MemoryEntry[]> {
    const [vectorResults, fulltextResults] = await Promise.all([
      this.config.embeddingService?.isAvailable() 
        ? this.vectorSearch(query, limit, filter) 
        : Promise.resolve([]),
      this.fulltextSearch(query, limit, filter),
    ]);

    // 合并结果，去重
    const seen = new Set<string>();
    const merged: MemoryEntry[] = [];

    // 优先添加向量检索结果
    for (const entry of vectorResults) {
      if (!seen.has(entry.id)) {
        seen.add(entry.id);
        merged.push(entry);
      }
    }

    // 补充全文检索结果
    for (const entry of fulltextResults) {
      if (!seen.has(entry.id) && merged.length < limit) {
        seen.add(entry.id);
        merged.push(entry);
      }
    }

    log.info('📖 记忆检索完成', { 
      query: query.slice(0, 50),
      vectorCount: vectorResults.length,
      fulltextCount: fulltextResults.length,
      mergedCount: merged.length,
      mode: 'hybrid'
    });

    return merged.slice(0, limit);
  }

  /**
   * 向量检索
   */
  private async vectorSearch(query: string, limit: number, filter?: MemoryFilter): Promise<MemoryEntry[]> {
    // 检查嵌入服务是否可用
    if (!this.config.embeddingService?.isAvailable()) {
      log.debug('🔍 [MemoryStore] 嵌入服务不可用，跳过向量检索');
      return [];
    }

    // 检查表的向量维度
    const tableVectorDimension = await this.getTableVectorDimension();
    if (tableVectorDimension === 0) {
      log.debug('🔍 [MemoryStore] 表无向量数据，跳过向量检索');
      return [];
    }

    try {
      const startTime = Date.now();
      const vector = await this.config.embeddingService.embed(query);
      
      // 检查向量维度是否匹配
      if (vector.length !== tableVectorDimension) {
        log.warn('⚠️ [MemoryStore] 向量维度不匹配，跳过向量检索', { 
          queryDimension: vector.length, 
          tableDimension: tableVectorDimension
        });
        return [];
      }
      
      let queryBuilder = this.table!.vectorSearch(vector).limit(limit);
      
      // 应用过滤条件
      if (filter?.sessionId) {
        queryBuilder = queryBuilder.where(`sessionId = "${filter.sessionId}"`);
      }
      if (filter?.type) {
        queryBuilder = queryBuilder.where(`type = "${filter.type}"`);
      }
      
      const results = await queryBuilder.toArray();
      const elapsed = Date.now() - startTime;

      log.info('📖 记忆检索完成', { 
        query: query.slice(0, 50),
        resultCount: results.length,
        mode: 'vector',
        elapsed: `${elapsed}ms`
      });

      return results.map(r => this.recordToEntry(r));
    } catch (error) {
      log.warn('⚠️ [MemoryStore] 向量检索失败', { error: String(error) });
      return [];
    }
  }

  /**
   * 获取表的向量维度
   */
  private async getTableVectorDimension(): Promise<number> {
    if (!this.table) return 0;
    
    try {
      const results = await this.table.query().limit(1).toArray();
      if (results.length > 0 && Array.isArray(results[0].vector)) {
        return (results[0].vector as number[]).length;
      }
    } catch {
      // 忽略错误
    }
    return 0;
  }

  /**
   * 全文检索
   */
  private async fulltextSearch(query: string, limit: number, filter?: MemoryFilter): Promise<MemoryEntry[]> {
    if (!this.table) {
      log.error('🚨 [MemoryStore] 全文检索失败: 表未初始化');
      return [];
    }

    try {
      const startTime = Date.now();

      // 构建查询
      let queryBuilder = this.table.query();

      // 应用过滤条件
      if (filter) {
        const conditions: string[] = [];
        if (filter.sessionId) {
          conditions.push(`sessionId = "${filter.sessionId}"`);
        }
        if (filter.type) {
          conditions.push(`type = "${filter.type}"`);
        }
        if (conditions.length > 0) {
          queryBuilder = queryBuilder.where(conditions.join(' AND '));
        }
      }

      // 获取所有匹配记录
      const allResults = await queryBuilder.toArray();
      
      // 提取关键词（支持中英文混合）
      const keywords = this.extractKeywords(query);
      
      const scored = allResults
        .map(r => {
          const content = (r.content as string).toLowerCase();
          let score = 0;
          for (const kw of keywords) {
            const count = (content.match(new RegExp(this.escapeRegex(kw), 'g')) || []).length;
            score += count;
          }
          return { record: r, score };
        })
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

      const elapsed = Date.now() - startTime;
      
      log.info('📖 记忆检索完成', { 
        query: query.slice(0, 50),
        resultCount: scored.length,
        mode: 'fulltext',
        keywords: keywords.slice(0, 5),
        elapsed: `${elapsed}ms`
      });

      return scored.map(item => this.recordToEntry(item.record));
    } catch (error) {
      log.error('🚨 [MemoryStore] 全文检索异常', { error: String(error) });
      return [];
    }
  }

  /**
   * 转义正则表达式特殊字符
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * 从查询中提取关键词（支持中英文混合）
   */
  private extractKeywords(query: string): string[] {
    const keywords: string[] = [];
    const lowerQuery = query.toLowerCase();
    
    // 1. 提取英文单词（连续字母）
    const englishWords = lowerQuery.match(/[a-z]+/g) || [];
    keywords.push(...englishWords.filter(w => w.length > 1));
    
    // 2. 提取中文词汇（每2-4个字符为一组，形成 n-gram）
    const chineseChars = lowerQuery.match(/[\u4e00-\u9fa5]/g) || [];
    if (chineseChars.length > 0) {
      // 2-gram
      for (let i = 0; i < chineseChars.length - 1; i++) {
        keywords.push(chineseChars[i] + chineseChars[i + 1]);
      }
      // 3-gram（如果中文足够多）
      if (chineseChars.length > 3) {
        for (let i = 0; i < chineseChars.length - 2; i++) {
          keywords.push(chineseChars[i] + chineseChars[i + 1] + chineseChars[i + 2]);
        }
      }
    }
    
    // 3. 提取数字
    const numbers = lowerQuery.match(/\d+/g) || [];
    keywords.push(...numbers.filter(n => n.length > 1));
    
    // 去重
    return [...new Set(keywords)];
  }

  /**
   * 获取最近记忆
   */
  async getRecent(sessionId: string, limit: number = 20): Promise<MemoryEntry[]> {
    await this.ensureInitialized();

    if (!this.table) return [];

    const results = await this.table
      .query()
      .where(`sessionId = "${sessionId}"`)
      .limit(limit)
      .toArray();

    log.debug('📖 [MemoryStore] 获取最近记忆', { 
      sessionId, 
      limit, 
      resultCount: results.length 
    });

    return results.map(r => this.recordToEntry(r));
  }

  /**
   * 根据 ID 获取记忆
   */
  async getById(id: string): Promise<MemoryEntry | null> {
    await this.ensureInitialized();

    if (!this.table) return null;

    const results = await this.table
      .query()
      .where(`id = "${id}"`)
      .limit(1)
      .toArray();

    const first = results[0];
    return first ? this.recordToEntry(first) : null;
  }

  /**
   * 删除记忆
   */
  async delete(id: string): Promise<void> {
    await this.ensureInitialized();
    await this.table?.delete(`id = "${id}"`);
    log.debug('记忆已删除', { id });
  }

  /**
   * 清除会话记忆
   */
  async clearSession(sessionId: string): Promise<void> {
    await this.ensureInitialized();
    await this.table?.delete(`sessionId = "${sessionId}"`);
    log.info('会话记忆已清除', { sessionId });
  }

  /**
   * 获取统计信息
   */
  async getStats(): Promise<MemoryStats> {
    await this.ensureInitialized();

    const results = await this.table?.query().toArray();
    const entries = results ?? [];

    const sessions = new Set(entries.map(e => e.sessionId as string));
    const timestamps = entries.map(e => e.createdAt as number);

    return {
      totalEntries: entries.length,
      totalSessions: sessions.size,
      totalSize: 0, // 需要单独计算文件大小
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
    cutoffDate.setDate(cutoffDate.getDate() - this.config.shortTermRetentionDays!);
    const cutoffTimestamp = cutoffDate.getTime();

    const results = await this.table?.query().toArray();
    const expired = (results ?? [])
      .filter(r => (r.createdAt as number) < cutoffTimestamp)
      .map(r => r.id as string);

    for (const id of expired) {
      await this.table?.delete(`id = "${id}"`);
    }

    log.info('过期记忆已清理', { count: expired.length });
    return {
      deletedCount: expired.length,
      summarizedCount: 0,
      errors: [],
    };
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

  /**
   * 存储到 Markdown 文件（追加模式，确保数据安全）
   * 
   * 文件格式：YYYY-MM-DD.md（每天一个文件）
   */
  private async storeMarkdown(entry: MemoryEntry): Promise<void> {
    const storagePath = this.expandPath(this.config.storagePath);
    const sessionsPath = join(storagePath, 'sessions');
    
    // 确保目录存在
    await mkdir(sessionsPath, { recursive: true });

    // 当天的文件名
    const today = this.formatDate(new Date());
    const mdPath = join(sessionsPath, `${today}.md`);

    // 检查文件是否存在
    let isNewFile = false;
    try {
      await stat(mdPath);
    } catch {
      isNewFile = true;
    }

    // 构建要写入的内容
    let content = '';
    if (isNewFile) {
      // 新文件：写入头部
      content = `# 记忆 - ${today}\n\n`;
    } else {
      // 已有文件：添加分隔符
      content = '\n---\n\n';
    }

    // 追加当前记录
    content += this.formatEntryMarkdown(entry) + '\n';

    // 立即写入文件
    await appendFile(mdPath, content, 'utf-8');
    
    log.debug('📝 [MemoryStore] Markdown 已保存', { 
      file: `${today}.md`,
      entryId: entry.id 
    });
  }

  /**
   * 格式化日期为 YYYY-MM-DD
   */
  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * 格式化单条记忆为 Markdown
   */
  private formatEntryMarkdown(entry: MemoryEntry): string {
    const timeLabel = entry.type === 'summary' ? '📝 摘要' : 
                      entry.type === 'entity' ? '🏷️ 实体' : '💬 对话';
    
    const lines: string[] = [
      `## ${timeLabel}`,
      ``,
      `**ID**: \`${entry.id}\``,
      `**会话**: \`${entry.sessionId}\``,
      `**时间**: ${entry.createdAt.toLocaleString('zh-CN')}`,
      `**标签**: ${(entry.metadata.tags ?? []).join(', ') || '无'}`,
      ``,
      '### 内容',
      ``,
      entry.content,
    ];

    return lines.join('\n');
  }

  private async getEmbedding(text: string): Promise<number[] | undefined> {
    if (this.config.embeddingService?.isAvailable()) {
      try {
        return await this.config.embeddingService.embed(text);
      } catch (error) {
        log.warn('嵌入生成失败', { error: String(error) });
      }
    }
    return undefined;
  }

  private recordToEntry(record: Record<string, unknown>): MemoryEntry {
    return {
      id: record.id as string,
      sessionId: record.sessionId as string,
      type: record.type as MemoryEntry['type'],
      content: record.content as string,
      vector: Array.isArray(record.vector) && (record.vector as number[]).length > 0 
        ? record.vector as number[] 
        : undefined,
      metadata: typeof record.metadata === 'string' ? JSON.parse(record.metadata) : record.metadata as MemoryEntry['metadata'],
      createdAt: new Date(record.createdAt as number),
      updatedAt: new Date(record.updatedAt as number),
    };
  }

  /**
   * 关闭存储
   * 
   * 注意：追加模式下每次存储已立即写入文件，此方法仅清理状态
   */
  async close(): Promise<void> {
    this.initialized = false;
    log.info('📦 [MemoryStore] 存储已关闭');
  }
}
