/**
 * 知识库分块向量索引器
 *
 * 将知识库文档分块向量统一存储到 LanceDB。
 */

import * as lancedb from '@lancedb/lancedb';
import { mkdir } from 'fs/promises';
import { z } from 'zod';
import { getLogger } from '@logtape/logtape';
import type { KnowledgeDocument } from '../types';
import type { EmbeddingService } from '../../memory/types';
import { KNOWLEDGE_VECTORS_PATH } from '../../../infrastructure/config';

const log = getLogger(['knowledge', 'indexer', 'chunk']);

/** 分块向量记录 */
export interface ChunkVectorRecord {
  /** 唯一标识 */
  id: string;
  /** 文档 ID */
  docId: string;
  /** 分块索引 */
  chunkIndex: number;
  /** 文本内容 */
  content: string;
  /** 向量 */
  vector: number[];
  /** 文档路径 */
  docPath: string;
  /** 文档标题 */
  docTitle: string;
  /** 文档类型 */
  docType: string;
  /** 创建时间 */
  createdAt: number;
  /** 元数据 JSON */
  metadata: string;
  /** 索引签名（兼容 LanceDB） */
  [key: string]: unknown;
}

/** 索引器配置 Schema */
export const ChunkIndexerConfigSchema = z.object({
  /** 数据库路径 */
  dbPath: z.string().optional(),
  /** 表名 */
  tableName: z.string().default('knowledge_chunks'),
  /** 向量维度 */
  vectorDimension: z.number().default(1536),
  /** 批量插入大小 */
  batchSize: z.number().min(1).max(100).default(20),
  /** 是否启用增量索引 */
  incrementalIndex: z.boolean().default(true),
});

/** 索引器配置类型 */
export type ChunkIndexerConfig = z.infer<typeof ChunkIndexerConfigSchema>;

/** 索引结果 */
export interface IndexResult {
  /** 是否成功 */
  success: boolean;
  /** 索引的分块数 */
  chunkCount: number;
  /** 失败的分块 ID */
  failedChunks: string[];
  /** 错误信息 */
  error?: string;
}

/** 索引统计 */
export interface IndexStats {
  /** 总分块数 */
  totalChunks: number;
  /** 总文档数 */
  totalDocuments: number;
  /** 向量化分块数 */
  vectorizedChunks: number;
  /** 数据库大小（字节） */
  dbSize: number;
  /** 最后更新时间 */
  lastUpdated: number;
}

/**
 * 分块向量索引器
 *
 * 职责：
 * - 将文档分块存储到 LanceDB
 * - 支持增量索引
 * - 管理向量生命周期
 */
export class ChunkIndexer {
  private config: Required<
    Pick<ChunkIndexerConfig, 'dbPath' | 'tableName' | 'vectorDimension' | 'batchSize' | 'incrementalIndex'>
  >;
  private db: lancedb.Connection | null = null;
  private table: lancedb.Table | null = null;
  private initialized = false;

  constructor(
    config?: Partial<ChunkIndexerConfig>,
    private embeddingService?: EmbeddingService
  ) {
    const parsed = ChunkIndexerConfigSchema.parse(config ?? {});
    this.config = {
      dbPath: parsed.dbPath ?? KNOWLEDGE_VECTORS_PATH,
      tableName: parsed.tableName,
      vectorDimension: parsed.vectorDimension,
      batchSize: parsed.batchSize,
      incrementalIndex: parsed.incrementalIndex,
    };
  }

  /**
   * 初始化索引器
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // 创建目录
      await mkdir(this.config.dbPath, { recursive: true });

      // 连接 LanceDB
      this.db = await lancedb.connect(this.config.dbPath);

      // 创建或打开表
      const tables = await this.db.tableNames();

      if (tables.includes(this.config.tableName)) {
        this.table = await this.db.openTable(this.config.tableName);
      } else {
        // 创建带占位符的表
        const placeholderRecord: ChunkVectorRecord = {
          id: '__placeholder__',
          docId: '',
          chunkIndex: 0,
          content: '',
          vector: new Array(this.config.vectorDimension).fill(0),
          docPath: '',
          docTitle: '',
          docType: 'text',
          createdAt: Date.now(),
          metadata: '{}',
        };

        this.table = await this.db.createTable(this.config.tableName, [placeholderRecord]);
        await this.table.delete('id = "__placeholder__"');
      }

      this.initialized = true;
      log.info('分块索引器已初始化', { dbPath: this.config.dbPath });
    } catch (error) {
      log.error('分块索引器初始化失败', { error: String(error) });
      throw error;
    }
  }

  /**
   * 索引文档分块
   * @param doc - 知识库文档
   * @returns 索引结果
   */
  async indexDocument(doc: KnowledgeDocument): Promise<IndexResult> {
    await this.ensureInitialized();

    const result: IndexResult = {
      success: false,
      chunkCount: 0,
      failedChunks: [],
    };

    if (!doc.chunks || doc.chunks.length === 0) {
      result.error = '文档没有分块';
      return result;
    }

    try {
      // 检查是否需要增量索引
      if (this.config.incrementalIndex) {
        await this.deleteDocumentChunks(doc.id);
      }

      // 准备向量记录
      const records: ChunkVectorRecord[] = [];

      for (let i = 0; i < doc.chunks.length; i++) {
        const chunk = doc.chunks[i];

        // 获取或生成向量
        let vector = chunk.vector;
        if (!vector || vector.length === 0) {
          vector = await this.generateVector(chunk.content);
        }

        if (vector.length === 0) {
          result.failedChunks.push(chunk.id);
          log.warn('分块向量生成失败', { chunkId: chunk.id });
          continue;
        }

        records.push({
          id: chunk.id,
          docId: doc.id,
          chunkIndex: i,
          content: chunk.content,
          vector,
          docPath: doc.path,
          docTitle: doc.metadata.title ?? doc.metadata.originalName,
          docType: doc.metadata.fileType,
          createdAt: Date.now(),
          metadata: JSON.stringify(chunk.metadata ?? {}),
        });
      }

      // 批量插入
      await this.insertBatch(records);

      result.success = true;
      result.chunkCount = records.length;

      log.info('文档分块索引完成', {
        docId: doc.id,
        chunkCount: records.length,
        failedCount: result.failedChunks.length,
      });

      return result;
    } catch (error) {
      result.error = String(error);
      log.error('文档索引失败', { docId: doc.id, error: String(error) });
      return result;
    }
  }

  /**
   * 批量索引文档
   * @param docs - 文档数组
   * @returns 每个文档的索引结果
   */
  async indexDocuments(docs: KnowledgeDocument[]): Promise<Map<string, IndexResult>> {
    const results = new Map<string, IndexResult>();

    for (const doc of docs) {
      const result = await this.indexDocument(doc);
      results.set(doc.id, result);
    }

    const totalChunks = Array.from(results.values())
      .reduce((sum, r) => sum + r.chunkCount, 0);

    log.info('批量索引完成', {
      docCount: docs.length,
      totalChunks,
    });

    return results;
  }

  /**
   * 删除文档的所有分块
   * @param docId - 文档 ID
   */
  async deleteDocumentChunks(docId: string): Promise<void> {
    await this.ensureInitialized();
    await this.table?.delete(`docId = "${this.escape(docId)}"`);
    log.debug('文档分块已删除', { docId });
  }

  /**
   * 删除单个分块
   * @param chunkId - 分块 ID
   */
  async deleteChunk(chunkId: string): Promise<void> {
    await this.ensureInitialized();
    await this.table?.delete(`id = "${this.escape(chunkId)}"`);
    log.debug('分块已删除', { chunkId });
  }

  /**
   * 获取索引统计
   */
  async getStats(): Promise<IndexStats> {
    await this.ensureInitialized();

    const count = await this.table?.countRows() ?? 0;
    const results = await this.table?.query().limit(10000).toArray();
    const records = results ?? [];

    const docIds = new Set(records.map(r => r.docId as string));
    const vectorizedCount = records.filter(r =>
      Array.isArray(r.vector) && (r.vector as number[]).length > 0
    ).length;

    const timestamps = records.map(r => r.createdAt as number);

    return {
      totalChunks: count,
      totalDocuments: docIds.size,
      vectorizedChunks: vectorizedCount,
      dbSize: 0, // LanceDB 不直接提供大小
      lastUpdated: timestamps.length > 0 ? Math.max(...timestamps) : 0,
    };
  }

  /**
   * 清空索引
   */
  async clear(): Promise<void> {
    await this.ensureInitialized();
    await this.table?.delete('id != "__never_match__"');
    log.info('索引已清空');
  }

  /**
   * 关闭索引器
   */
  async close(): Promise<void> {
    this.db = null;
    this.table = null;
    this.initialized = false;
    log.info('分块索引器已关闭');
  }

  /**
   * 获取表实例（供检索器使用）
   */
  getTable(): lancedb.Table | null {
    return this.table;
  }

  // ========== 私有方法 ==========

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  private async generateVector(content: string): Promise<number[]> {
    if (!this.embeddingService?.isAvailable()) {
      return [];
    }

    try {
      return await this.embeddingService.embed(content);
    } catch (error) {
      log.warn('向量生成失败', { error: String(error) });
      return [];
    }
  }

  private async insertBatch(records: ChunkVectorRecord[]): Promise<void> {
    if (records.length === 0) return;

    // 分批插入
    for (let i = 0; i < records.length; i += this.config.batchSize) {
      const batch = records.slice(i, i + this.config.batchSize);
      await this.table?.add(batch);
    }
  }

  private escape(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }
}

/**
 * 创建分块索引器
 */
export function createChunkIndexer(
  config?: Partial<ChunkIndexerConfig>,
  embeddingService?: EmbeddingService
): ChunkIndexer {
  return new ChunkIndexer(config, embeddingService);
}
