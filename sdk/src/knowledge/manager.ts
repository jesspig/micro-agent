/**
 * 知识库管理器
 *
 * 高级封装：管理文档索引和检索。
 */

import { mkdir } from 'fs/promises';
import { join } from 'path';
import { Database } from 'bun:sqlite';
import type {
  KnowledgeBaseConfig,
  KnowledgeDocument,
  KnowledgeDocMetadata,
  KnowledgeDocStatus,
  KnowledgeBaseStats,
} from './types';
import type { EmbeddingServiceProvider } from './types';
import { getLogger } from '@logtape/logtape';
import { USER_KNOWLEDGE_DIR, USER_DATA_DIR } from '../config/defaults';

const log = getLogger(['sdk', 'knowledge', 'manager']);

/** 默认配置 */
const DEFAULT_CONFIG: KnowledgeBaseConfig = {
  enabled: true,
  basePath: USER_KNOWLEDGE_DIR,
  chunkSize: 1000,
  chunkOverlap: 200,
  maxSearchResults: 5,
  minSimilarityScore: 0.6,
  backgroundBuild: {
    enabled: true,
    interval: 60000,
    batchSize: 3,
    idleDelay: 5000,
  },
};

/**
 * 知识库管理器
 *
 * 功能：
 * - 文档生命周期管理
 * - 数据库持久化
 * - 统计信息查询
 */
export class KnowledgeBaseManager {
  private config: KnowledgeBaseConfig;
  private documents: Map<string, KnowledgeDocument> = new Map();
  private embeddingService?: EmbeddingServiceProvider;
  private isInitialized = false;
  private db?: Database;

  constructor(
    config?: Partial<KnowledgeBaseConfig>,
    embeddingService?: EmbeddingServiceProvider
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.embeddingService = embeddingService;
  }

  /**
   * 初始化知识库
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    // 创建知识库目录
    await mkdir(this.config.basePath, { recursive: true });

    // 初始化数据库
    await this.initDatabase();

    // 加载已有索引
    await this.loadIndex();

    this.isInitialized = true;

    log.info('知识库已初始化', {
      docCount: this.documents.size,
      hasEmbedding: !!this.embeddingService?.isAvailable(),
    });
  }

  /**
   * 关闭知识库
   */
  async shutdown(): Promise<void> {
    this.closeDatabase();
    this.isInitialized = false;
    log.info('知识库已关闭');
  }

  /**
   * 获取统计信息
   */
  getStats(): KnowledgeBaseStats {
    const docs = Array.from(this.documents.values());
    const indexedDocs = docs.filter(d => d.status === 'indexed');
    const pendingDocs = docs.filter(d => d.status === 'pending');
    const errorDocs = docs.filter(d => d.status === 'error');
    const totalChunks = indexedDocs.reduce((sum, d) => sum + (d.chunks?.length ?? 0), 0);
    const totalSize = docs.reduce((sum, d) => sum + d.metadata.fileSize, 0);

    return {
      totalDocuments: docs.length,
      indexedDocuments: indexedDocs.length,
      pendingDocuments: pendingDocs.length,
      errorDocuments: errorDocs.length,
      totalChunks,
      totalSize,
      lastUpdated: Math.max(...docs.map(d => d.updatedAt), 0),
    };
  }

  /**
   * 获取所有文档
   */
  getDocuments(): KnowledgeDocument[] {
    return Array.from(this.documents.values());
  }

  /**
   * 获取指定文档
   */
  getDocument(path: string): KnowledgeDocument | undefined {
    return this.documents.get(path);
  }

  /**
   * 获取文档映射
   */
  getDocumentMap(): Map<string, KnowledgeDocument> {
    return this.documents;
  }

  /**
   * 设置文档
   */
  setDocument(path: string, doc: KnowledgeDocument): void {
    this.documents.set(path, doc);
    this.saveDocumentIndex(doc);
  }

  /**
   * 删除文档
   */
  deleteDocument(path: string): void {
    this.documents.delete(path);
    this.deleteDocumentIndex(path);
  }

  /**
   * 重建索引
   */
  async rebuildIndex(): Promise<void> {
    log.info('开始重建索引');

    for (const doc of this.documents.values()) {
      doc.status = 'pending';
      doc.chunks = undefined;
      doc.indexedAt = undefined;
    }

    log.info('索引重建完成');
  }

  /**
   * 设置嵌入服务
   */
  setEmbeddingService(service: EmbeddingServiceProvider): void {
    this.embeddingService = service;
  }

  /**
   * 获取嵌入服务
   */
  getEmbeddingService(): EmbeddingServiceProvider | undefined {
    return this.embeddingService;
  }

  /**
   * 检查是否已初始化
   */
  isReady(): boolean {
    return this.isInitialized;
  }

  // ========== 数据库管理 ==========

  private async initDatabase(): Promise<void> {
    await mkdir(USER_DATA_DIR, { recursive: true });

    const dbPath = join(USER_DATA_DIR, 'knowledge.db');
    this.db = new Database(dbPath);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        path TEXT UNIQUE NOT NULL,
        content_preview TEXT,
        metadata_json TEXT NOT NULL,
        status TEXT NOT NULL,
        error TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        indexed_at INTEGER
      )
    `);

    log.debug('数据库已初始化', { path: dbPath });
  }

  private closeDatabase(): void {
    this.db?.close();
    this.db = undefined;
  }

  private async loadIndex(): Promise<void> {
    if (!this.db) return;

    const rows = this.db.query<{
      id: string;
      path: string;
      content_preview: string | null;
      metadata_json: string;
      status: string;
      error: string | null;
      created_at: number;
      updated_at: number;
      indexed_at: number | null;
    }, []>(`SELECT * FROM documents`).all();

    for (const row of rows) {
      const metadata = JSON.parse(row.metadata_json) as KnowledgeDocMetadata;
      this.documents.set(row.path, {
        id: row.id,
        path: row.path,
        content: row.content_preview ?? '',
        metadata,
        status: row.status as KnowledgeDocStatus,
        error: row.error ?? undefined,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        indexedAt: row.indexed_at ?? undefined,
      });
    }

    log.debug('已加载文档索引', { count: this.documents.size });
  }

  private saveDocumentIndex(doc: KnowledgeDocument): void {
    if (!this.db) return;

    this.db.run(
      `INSERT OR REPLACE INTO documents (
        id, path, content_preview, metadata_json, status, error,
        created_at, updated_at, indexed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        doc.id,
        doc.path,
        doc.content.slice(0, 500),
        JSON.stringify(doc.metadata),
        doc.status,
        doc.error ?? null,
        doc.createdAt,
        doc.updatedAt,
        doc.indexedAt ?? null,
      ]
    );
  }

  private deleteDocumentIndex(path: string): void {
    this.db?.run(`DELETE FROM documents WHERE path = ?`, [path]);
  }
}

// 单例
let globalKnowledgeBase: KnowledgeBaseManager | null = null;

export function getKnowledgeBase(): KnowledgeBaseManager | null {
  return globalKnowledgeBase;
}

export function setKnowledgeBase(manager: KnowledgeBaseManager): void {
  globalKnowledgeBase = manager;
}

/**
 * 创建知识库管理器
 */
export function createKnowledgeBaseManager(
  config?: Partial<KnowledgeBaseConfig>,
  embeddingService?: EmbeddingServiceProvider
): KnowledgeBaseManager {
  return new KnowledgeBaseManager(config, embeddingService);
}
