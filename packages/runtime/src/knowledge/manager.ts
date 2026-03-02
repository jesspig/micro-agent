/**
 * 知识库管理器
 * 
 * 管理用户上传到 ~/.micro-agent/knowledge/ 目录的文档，提供：
 * 1. 文档扫描和索引
 * 2. 后台闲时构建向量索引（存入 MemoryStore）
 * 3. 文件变更监控
 * 
 * 注意：向量检索已迁移到 MemoryStore，使用 dualLayerSearch() 方法
 * 索引存储使用 SQLite（Bun 内置），位于 ~/.micro-agent/data/knowledge.db
 */

import { mkdir } from 'fs/promises';
import { join, basename } from 'path';
import { homedir } from 'os';
import { Database } from 'bun:sqlite';
import type {
  KnowledgeBaseConfig,
  KnowledgeDocument,
  KnowledgeDocMetadata,
  KnowledgeDocStatus,
  KnowledgeChunk,
  KnowledgeBaseStats,
  BackgroundBuildStatus,
} from './types';
import { getLogger } from '@logtape/logtape';
import type { MemoryStore } from '../memory/store';
import { extractDocumentContent } from './extractor';
import { createDocumentScanner, type DocumentScanner } from './scanner';
import { createDocumentIndexer, type DocumentIndexer } from './indexer';
import { createFileWatcher, type FileWatcher } from './watcher';

const log = getLogger(['knowledge']);

/** 默认配置 */
const DEFAULT_CONFIG: KnowledgeBaseConfig = {
  basePath: join(homedir(), '.micro-agent', 'knowledge'),
  chunkSize: 1000,
  chunkOverlap: 200,
  maxSearchResults: 5,
  minSimilarityScore: 0.6,
  backgroundBuild: {
    enabled: true,
    interval: 60000, // 1分钟检查一次
    batchSize: 3,
    idleDelay: 5000, // 空闲5秒后开始处理
  },
};

/** 数据目录路径 */
const DATA_DIR = () => join(homedir(), '.micro-agent', 'data');
/** SQLite 数据库文件名 */
const DB_FILE = 'knowledge.db';

/**
 * 知识库管理器
 */
export class KnowledgeBaseManager {
  private config: KnowledgeBaseConfig;
  private memoryStore?: MemoryStore;
  private documents: Map<string, KnowledgeDocument> = new Map();
  private isInitialized = false;
  private db?: Database;

  // 子模块
  private scanner?: DocumentScanner;
  private indexer?: DocumentIndexer;
  private watcher?: FileWatcher;

  // 后台构建相关
  private buildStatus: BackgroundBuildStatus = {
    isRunning: false,
    processedCount: 0,
    queueLength: 0,
    lastActivityTime: Date.now(),
  };
  private buildTimer?: Timer;
  private buildAbortController?: AbortController;

  // 文件变更回调
  private handleFileChange = async (event: { filename: string; changeType: 'add' | 'change' | 'unlink' }): Promise<void> => {
    const { filename, changeType } = event;
    const docsDir = this.config.basePath;
    const filePath = join(docsDir, filename);
    const relativePath = filename;

    try {
      if (changeType === 'unlink') {
        await this.removeDocument(relativePath);
      } else {
        // 检查是否是新文件
        const existingDoc = this.documents.get(relativePath);
        if (existingDoc) {
          await this.updateDocument(filePath, relativePath);
        } else {
          await this.addDocument(filePath, relativePath);
        }
      }
    } catch (error) {
      log.error('处理文件变更失败', { filename, error: String(error) });
    }

    // 如果有待处理的文档，立即触发构建
    const hasPending = Array.from(this.documents.values()).some((d) => d.status === 'pending');
    if (hasPending) {
      this.processPendingDocuments().catch((err) => {
        log.error('后台构建失败', { error: String(err) });
      });
    }
  };

  constructor(config?: Partial<KnowledgeBaseConfig>, memoryStore?: MemoryStore) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.memoryStore = memoryStore;
  }

  /**
   * 初始化知识库
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    // 创建知识库目录
    await mkdir(this.config.basePath, { recursive: true });

    // 创建数据目录并初始化 SQLite 数据库
    await this.initDatabase();

    // 初始化子模块
    this.initModules();

    // 加载已有索引
    await this.loadIndex();

    // 扫描文件变更
    await this.scanDocuments();

    // 启动文件监测
    await this.startWatching();

    // 立即处理待索引文档（不等待后台构建）
    await this.processPendingDocuments();

    // 启动后台构建（用于后续新增文档）
    if (this.config.backgroundBuild.enabled) {
      this.startBackgroundBuild();
    }

    this.isInitialized = true;

    // 统计索引状态
    const indexedCount = Array.from(this.documents.values()).filter((d) => d.status === 'indexed').length;
    const pendingCount = Array.from(this.documents.values()).filter((d) => d.status === 'pending').length;

    log.info('📚 [KnowledgeBase] 知识库已初始化', {
      docCount: this.documents.size,
      indexedCount,
      pendingCount,
      memoryStore: !!this.memoryStore,
    });
  }

  /**
   * 初始化子模块
   */
  private initModules(): void {
    // 文档扫描器
    this.scanner = createDocumentScanner(
      this.documents,
      this.config.basePath,
      (type, doc) => {
        // 文档变更时保存索引
        this.saveDocumentIndex(doc);
        if (type === 'add') {
          this.buildStatus.queueLength++;
        }
      }
    );

    // 索引构建器
    this.indexer = createDocumentIndexer(
      {
        chunkSize: this.config.chunkSize,
        chunkOverlap: this.config.chunkOverlap,
      },
      this.memoryStore,
      (doc, chunkCount) => {
        // 索引完成后保存
        this.saveDocumentIndex(doc);
      },
      (doc, error) => {
        // 索引失败后保存
        this.saveDocumentIndex(doc);
      }
    );

    // 文件监控器
    this.watcher = createFileWatcher(
      {
        basePath: this.config.basePath,
        debounceDelay: 500,
      },
      () => this.documents,
      this.handleFileChange
    );
  }

  /**
   * 关闭知识库
   */
  async shutdown(): Promise<void> {
    this.stopWatching();
    this.stopBackgroundBuild();
    this.closeDatabase();
    this.isInitialized = false;
    log.info('知识库已关闭');
  }

  // ============================================================================
  // 文档管理（委托给 scanner）
  // ============================================================================

  /**
   * 扫描文档目录
   */
  async scanDocuments(): Promise<void> {
    await this.scanner?.scanDocuments();
  }

  /**
   * 添加新文档
   */
  private async addDocument(filePath: string, relativePath: string): Promise<KnowledgeDocument> {
    return await this.scanner!.addDocument(filePath, relativePath);
  }

  /**
   * 更新已有文档
   */
  private async updateDocument(filePath: string, relativePath: string): Promise<void> {
    await this.scanner!.updateDocument(filePath, relativePath);
    const doc = this.documents.get(relativePath);
    if (doc) {
      this.buildStatus.queueLength++;
      this.saveDocumentIndex(doc);
    }
  }

  /**
   * 移除文档
   */
  private async removeDocument(relativePath: string): Promise<void> {
    const doc = this.documents.get(relativePath);
    if (!doc) return;

    await this.scanner!.removeDocument(relativePath);

    // 从 SQLite 删除
    this.deleteDocumentIndex(relativePath);

    // 从 MemoryStore 删除文档块
    if (this.memoryStore) {
      try {
        await this.memoryStore.deleteDocumentChunks(doc.id);
      } catch (error) {
        log.warn('📄 [KnowledgeBase] 删除文档块失败', {
          docId: doc.id,
          error: String(error),
        });
      }
    }

    log.info('📄 [KnowledgeBase] 删除文档', { path: relativePath });
  }

  // ============================================================================
  // 索引构建（委托给 indexer）
  // ============================================================================

  /**
   * 构建文档向量索引
   */
  private async buildDocumentIndex(doc: KnowledgeDocument): Promise<void> {
    await this.indexer!.buildDocumentIndex(doc);
  }

  // ============================================================================
  // 后台构建
  // ============================================================================

  /**
   * 启动后台构建
   */
  private startBackgroundBuild(): void {
    if (this.buildTimer) return;

    this.buildAbortController = new AbortController();

    const runBuild = async () => {
      if (this.buildAbortController?.signal.aborted) return;

      await this.processPendingDocuments();

      this.buildTimer = setTimeout(runBuild, this.config.backgroundBuild.interval);
    };

    // 延迟启动
    setTimeout(runBuild, this.config.backgroundBuild.idleDelay);
    log.info('后台构建已启动');
  }

  /**
   * 停止后台构建
   */
  private stopBackgroundBuild(): void {
    if (this.buildTimer) {
      clearTimeout(this.buildTimer);
      this.buildTimer = undefined;
    }
    this.buildAbortController?.abort();
    this.buildStatus.isRunning = false;
    log.info('后台构建已停止');
  }

  /**
   * 处理待处理的文档
   */
  private async processPendingDocuments(): Promise<void> {
    const pendingDocs = Array.from(this.documents.values())
      .filter((doc) => doc.status === 'pending')
      .slice(0, this.config.backgroundBuild.batchSize);

    if (pendingDocs.length === 0) return;

    this.buildStatus.isRunning = true;
    this.buildStatus.queueLength = pendingDocs.length;

    for (const doc of pendingDocs) {
      if (this.buildAbortController?.signal.aborted) break;

      this.buildStatus.currentDocId = doc.id;
      await this.buildDocumentIndex(doc);
      this.buildStatus.processedCount++;
      this.buildStatus.queueLength--;
      this.buildStatus.lastActivityTime = Date.now();
    }

    this.buildStatus.isRunning = false;
    this.buildStatus.currentDocId = undefined;
  }

  // ============================================================================
  // 文件监测（委托给 watcher）
  // ============================================================================

  /**
   * 启动文件监测
   */
  private async startWatching(): Promise<void> {
    await this.watcher?.startWatching();
  }

  /**
   * 停止文件监测
   */
  private stopWatching(): void {
    this.watcher?.stopWatching();
  }

  // ============================================================================
  // 数据库管理
  // ============================================================================

  /**
   * 初始化 SQLite 数据库
   */
  private async initDatabase(): Promise<void> {
    try {
      // 创建数据目录
      const dataDir = DATA_DIR();
      await mkdir(dataDir, { recursive: true });

      // 打开/创建数据库
      const dbPath = join(dataDir, DB_FILE);
      this.db = new Database(dbPath);

      // 创建文档索引表（metadata 存储为 JSON）
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

      // 创建路径索引
      this.db.run(`
        CREATE INDEX IF NOT EXISTS idx_documents_path ON documents(path)
      `);

      // 创建状态索引
      this.db.run(`
        CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status)
      `);

      log.info('[KnowledgeBase] SQLite 数据库已初始化', { path: dbPath });
    } catch (error) {
      log.error('[KnowledgeBase] 初始化数据库失败', { error });
      throw error;
    }
  }

  /**
   * 关闭数据库连接
   */
  private closeDatabase(): void {
    if (this.db) {
      this.db.close();
      this.db = undefined;
    }
  }

  // ============================================================================
  // 索引管理
  // ============================================================================

  /**
   * 加载索引（从 SQLite）
   */
  private async loadIndex(): Promise<void> {
    if (!this.db) return;

    try {
      const rows = this.db
        .query<{
          id: string;
          path: string;
          content_preview: string | null;
          metadata_json: string;
          status: string;
          error: string | null;
          created_at: number;
          updated_at: number;
          indexed_at: number | null;
        }, []>(`
        SELECT * FROM documents
      `).all();

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

      log.info('[KnowledgeBase] 已加载文档索引', { count: this.documents.size });
    } catch (error) {
      log.error('[KnowledgeBase] 加载索引失败', { error });
      this.documents.clear();
    }
  }

  /**
   * 保存单个文档索引（upsert）
   */
  private saveDocumentIndex(doc: KnowledgeDocument): void {
    if (!this.db) return;

    try {
      this.db.run(
        `
        INSERT OR REPLACE INTO documents (
          id, path, content_preview, metadata_json, status, error,
          created_at, updated_at, indexed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
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
    } catch (error) {
      log.error('[KnowledgeBase] 保存文档索引失败', { path: doc.path, error });
    }
  }

  /**
   * 删除文档索引
   */
  private deleteDocumentIndex(path: string): void {
    if (!this.db) return;

    try {
      this.db.run(`DELETE FROM documents WHERE path = ?`, [path]);
    } catch (error) {
      log.error('[KnowledgeBase] 删除文档索引失败', { path, error });
    }
  }

  // ============================================================================
  // 公共 API
  // ============================================================================

  /**
   * 获取统计信息
   */
  getStats(): KnowledgeBaseStats {
    const docs = Array.from(this.documents.values());
    const indexedDocs = docs.filter((d) => d.status === 'indexed');
    const pendingDocs = docs.filter((d) => d.status === 'pending');
    const errorDocs = docs.filter((d) => d.status === 'error');
    const totalChunks = indexedDocs.reduce((sum, d) => sum + (d.chunks?.length ?? 0), 0);
    const totalSize = docs.reduce((sum, d) => sum + d.metadata.fileSize, 0);

    return {
      totalDocuments: docs.length,
      indexedDocuments: indexedDocs.length,
      pendingDocuments: pendingDocs.length,
      errorDocuments: errorDocs.length,
      totalChunks,
      totalSize,
      lastUpdated: Math.max(...docs.map((d) => d.updatedAt), 0),
    };
  }

  /**
   * 获取后台构建状态
   */
  getBuildStatus(): BackgroundBuildStatus {
    return { ...this.buildStatus };
  }

  /**
   * 手动触发文档索引构建
   */
  async rebuildIndex(): Promise<void> {
    log.info('开始重建索引');

    // 重置所有文档状态
    for (const doc of this.documents.values()) {
      doc.status = 'pending';
      doc.chunks = undefined;
      doc.indexedAt = undefined;
      this.buildStatus.queueLength++;
    }

    await this.processPendingDocuments();
    log.info('开始重建索引');
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
}

// 导出单例
let globalKnowledgeBase: KnowledgeBaseManager | null = null;

/**
 * 获取全局知识库实例
 */
export function getKnowledgeBase(): KnowledgeBaseManager | null {
  return globalKnowledgeBase;
}

/**
 * 设置全局知识库实例
 */
export function setKnowledgeBase(manager: KnowledgeBaseManager): void {
  globalKnowledgeBase = manager;
}