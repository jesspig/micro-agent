/**
 * 记忆存储 - LanceDB 集成
 * 
 * 双存储架构：
 * - LanceDB：向量检索 + 全文检索
 * - Markdown：人类可读的会话记录（YYYY-MM-DD-<batch>.md）
 * 
 * 重构说明：
 * - 核心功能：core.ts (MemoryStoreCore)
 * - 检索功能：search.ts (SearchManager)
 * - 向量管理：vector-manager.ts (VectorManager)
 * - 文档管理：document-manager.ts (DocumentManager)
 * - 迁移集成：migration-integration.ts (MigrationIntegrationManager)
 * - 模型切换：model-switcher.ts (ModelSwitcher)
 */

import type { MemoryEntry, SearchOptions, MemoryFilter } from '../types';
import type { MemoryStoreConfig, VectorColumnName, EmbedModelInfo } from './types';
import type { MigrationStatus, MigrationResult, RetryResult } from './types';
import { MemoryStoreCore, type LanceDBRecord } from './core';
import { SearchManager, type SearchMode } from './search';
import { VectorManager } from './vector-manager';
import { DocumentManager } from './document-manager';
import { MigrationIntegrationManager } from './migration-integration';
import { ModelSwitcher } from './model-switcher';

/**
 * 记忆存储
 * 
 * 双存储架构：
 * - LanceDB：向量检索 + 全文检索（主存储）
 * - Markdown：人类可读备份（YYYY-MM-DD-<batch>.md）
 * 
 * 重构后的 MemoryStore 通过组合多个管理器实现职责分离
 */
export class MemoryStore extends MemoryStoreCore {
  private searchManager: SearchManager;
  private vectorManager: VectorManager;
  private documentManager: DocumentManager;
  private migrationManager: MigrationIntegrationManager;
  private modelSwitcher: ModelSwitcher;

  constructor(config: MemoryStoreConfig) {
    super(config);
    
    // 初始化各个管理器
    this.searchManager = new SearchManager(this);
    this.vectorManager = new VectorManager(this);
    this.documentManager = new DocumentManager(this);
    this.migrationManager = new MigrationIntegrationManager(this);
    this.modelSwitcher = new ModelSwitcher(this, this.vectorManager, this.migrationManager);
  }

  /**
   * 初始化存储（扩展核心初始化）
   */
  async initialize(): Promise<void> {
    // 先调用核心初始化来建立数据库连接
    await super.initialize();

    const db = this.dbConnection;
    if (!db) {
      throw new Error('Database connection not available');
    }

    const tableName = 'memories';
    const tables = await db.tableNames();

    // 如果表不存在，创建初始表
    if (!tables.includes(tableName)) {
      // 动态检测嵌入维度
      const vectorDimension = await this['detectVectorDimension']();
      const embedModel = this.storeConfig.embedModel;
      const vectorColumn = embedModel 
        ? this.getModelVectorColumn(embedModel) 
        : 'vector';
      
      // 创建表，使用示例数据定义 schema
      const sampleRecord: Record<string, unknown> = {
        id: 'placeholder',
        sessionId: 'placeholder',
        type: 'placeholder',
        content: 'placeholder',
        [vectorColumn]: new Array(vectorDimension || 1536).fill(0),
        metadata: '{}',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        // 多嵌入模型支持字段
        active_embed: embedModel ?? null,
        embed_versions: embedModel ? JSON.stringify({ [embedModel]: Date.now() }) : null,
        // 文档分块 ID
        documentId: '',
      };
      
      const table = await db.createTable(tableName, [sampleRecord]);
      this['table'] = table;
      
      // 删除占位符
      await table.delete('id = "placeholder"');
      
      const log = require('@logtape/logtape').getLogger(['memory', 'store']);
      log.info('📐 [MemoryStore] 创建向量表', { 
        vectorColumn,
        vectorDimension: vectorDimension || 1536,
        mode: vectorDimension === 0 ? 'fulltext' : 'vector',
        embeddingAvailable: this.storeConfig.embeddingService?.isAvailable() ?? false,
        embedModel,
      });
    }

    // 检测并迁移旧数据结构
    await this.vectorManager.migrateLegacySchema();

    // 确保 documentId 列存在
    await this.vectorManager.ensureDocumentIdColumn();

    // 检查当前嵌入模型的向量列是否存在，不存在则添加
    await this.vectorManager.ensureVectorColumn();
  }

  /**
   * 辅助方法：获取模型向量列名
   */
  private getModelVectorColumn(modelId: string): string {
    const [provider, ...modelParts] = modelId.split('/');
    const model = modelParts.join('/');
    const safeModel = model
      .replace(/\//g, '_s_')
      .replace(/:/g, '_c_')
      .replace(/\./g, '_d_')
      .replace(/-/g, '_h_');
    return `vector_${provider}_${safeModel}`;
  }

  /**
   * 获取最后一次记忆检索使用的模式
   */
  getLastSearchMode(): SearchMode {
    return this.searchManager.getLastSearchMode();
  }

  // ============================================================================
  // 搜索功能（委托给 SearchManager）
  // ============================================================================

  /**
   * 搜索记忆
   */
  async search(query: string, options?: SearchOptions): Promise<MemoryEntry[]> {
    return this.searchManager.search(query, options);
  }

  /**
   * 双层检索
   */
  async dualLayerSearch(
    query: string,
    limit: number = 10,
    candidates: number = 200,
    filter?: MemoryFilter,
    modelId?: string
  ): Promise<MemoryEntry[]> {
    return this.searchManager.dualLayerSearch(query, limit, candidates, filter, modelId);
  }

  // ============================================================================
  // 文档记忆管理（委托给 DocumentManager）
  // ============================================================================

  /**
   * 存储文档分块（增量更新）
   */
  async storeDocumentChunks(
    docId: string,
    chunks: unknown[],
    metadata: unknown
  ): Promise<void> {
    return this.documentManager.storeDocumentChunks(
      docId,
      chunks as Parameters<typeof this.documentManager.storeDocumentChunks>[1],
      metadata as Parameters<typeof this.documentManager.storeDocumentChunks>[2]
    );
  }

  /**
   * 删除文档的所有分块
   */
  async deleteDocumentChunks(docId: string): Promise<void> {
    return this.documentManager.deleteDocumentChunks(docId);
  }

  /**
   * 获取文档的所有分块
   */
  async getDocumentChunks(docId: string): Promise<MemoryEntry[]> {
    return this.documentManager.getDocumentChunks(docId);
  }

  /**
   * 按类型统计记忆数量
   */
  async getStatsByType(): Promise<Record<string, number>> {
    return this.documentManager.getStatsByType();
  }

  // ============================================================================
  // 向量列管理（委托给 VectorManager）
  // ============================================================================

  /**
   * 获取所有已存在的向量列名
   */
  async getExistingVectorColumns(): Promise<VectorColumnName[]> {
    return this.vectorManager.getExistingVectorColumns();
  }

  /**
   * 检查是否存在指定模型的向量列
   */
  async hasVectorColumn(modelId: string): Promise<boolean> {
    return this.vectorManager.hasVectorColumn(modelId);
  }

  /**
   * 获取向量列的维度
   */
  async getVectorDimension(column: string): Promise<number> {
    return this.vectorManager.getVectorDimension(column);
  }

  /**
   * 列出所有已存储向量的嵌入模型
   */
  async listEmbedModels(): Promise<EmbedModelInfo[]> {
    return this.vectorManager.listEmbedModels();
  }

  /**
   * 更新记录的向量
   */
  async updateVector(
    id: string,
    vectorColumn: string,
    vector: number[],
    modelId: string
  ): Promise<void> {
    return this.vectorManager.updateVector(id, vectorColumn, vector, modelId);
  }

  // ============================================================================
  // 模型切换与清理（委托给 ModelSwitcher）
  // ============================================================================

  /**
   * 切换嵌入模型
   */
  async switchModel(newModel: string, autoMigrate?: boolean): Promise<{
    success: boolean;
    hasExistingVectors: boolean;
    migrationStarted?: boolean;
    message: string;
  }> {
    return this.modelSwitcher.switchModel(newModel, autoMigrate);
  }

  /**
   * 检测模型变更
   */
  async detectModelChange(): Promise<{
    needMigration: boolean;
    oldModel?: string;
    newModel: string;
    hasOldModelVectors: boolean;
  }> {
    return this.modelSwitcher.detectModelChange();
  }

  /**
   * 清理旧的向量列
   */
  async cleanupOldVectors(keepModels?: number): Promise<{
    cleanedModels: string[];
    keptModels: string[];
    error?: string;
  }> {
    return this.modelSwitcher.cleanupOldVectors(keepModels);
  }

  // ============================================================================
  // 迁移功能（委托给 MigrationIntegrationManager）
  // ============================================================================

  /**
   * 获取迁移状态
   */
  async getMigrationStatus(): Promise<MigrationStatus> {
    return this.migrationManager.getMigrationStatus();
  }

  /**
   * 启动迁移到指定模型
   */
  async migrateToModel(
    targetModel: string,
    options?: { autoStart?: boolean }
  ): Promise<MigrationResult> {
    return this.migrationManager.migrateToModel(targetModel, options);
  }

  /**
   * 重试失败的迁移记录
   */
  async retryMigration(recordIds?: string[]): Promise<RetryResult> {
    return this.migrationManager.retryMigration(recordIds);
  }

  /**
   * 暂停当前迁移
   */
  async pauseMigration(): Promise<void> {
    return this.migrationManager.pauseMigration();
  }

  /**
   * 继续暂停的迁移
   */
  async resumeMigration(): Promise<void> {
    return this.migrationManager.resumeMigration();
  }

  // ============================================================================
  // 自动清理检查（存储后调用）
  // ============================================================================

  /**
   * 检查并执行自动清理
   */
  private async checkAndCleanup(): Promise<void> {
    return this.modelSwitcher.checkAndCleanup();
  }

  /**
   * 存储记忆条目（扩展核心存储，添加自动清理）
   */
  async store(entry: MemoryEntry): Promise<void> {
    await super.store(entry);
    await this.checkAndCleanup();
  }

  /**
   * 批量存储记忆条目（扩展核心存储，添加自动清理）
   */
  async storeBatch(entries: MemoryEntry[]): Promise<void> {
    await super.storeBatch(entries);
    await this.checkAndCleanup();
  }

  // ============================================================================
  // 静态工具方法（模型 ID 与向量列名转换）
  // ============================================================================

  /**
   * 将模型 ID 转换为向量列名
   */
  static modelIdToVectorColumn(modelId: string): VectorColumnName {
    return VectorManager.modelIdToVectorColumn(modelId);
  }

  /**
   * 将向量列名转换为模型 ID
   */
  static vectorColumnToModelId(column: string): string {
    return VectorManager.vectorColumnToModelId(column);
  }
}

// 导出所有管理器类型
export type { SearchMode } from './search';
export type { LanceDBRecord } from './core';