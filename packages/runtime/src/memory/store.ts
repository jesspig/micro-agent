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
import type { MemoryStoreConfig, CleanupResult, EmbeddingService, VectorColumnName, EmbedModelInfo } from './types';
import type { KnowledgeChunk, KnowledgeDocMetadata } from '../knowledge/types';
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
  private lastSearchMode: 'vector' | 'fulltext' | 'hybrid' | 'migration-hybrid' | 'unknown' = 'unknown';

  constructor(config: MemoryStoreConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 获取最后一次记忆检索使用的模式
   * @returns 检索模式：vector | fulltext | hybrid | migration-hybrid | unknown
   */
  getLastSearchMode(): 'vector' | 'fulltext' | 'hybrid' | 'migration-hybrid' | 'unknown' {
    return this.lastSearchMode;
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

      // 检测并迁移旧数据结构
      await this.migrateLegacySchema();

      // 确保 documentId 列存在（用于文档分块精确删除）
      await this.ensureDocumentIdColumn();

      // 检查当前嵌入模型的向量列是否存在，不存在则扩展 schema
      await this.ensureVectorColumn();
    } else {
      // 动态检测嵌入维度
      const vectorDimension = await this.detectVectorDimension();
      
      if (vectorDimension === 0) {
        // 全文检索模式：使用默认维度创建表（未来可能启用向量检索）
        log.info('📐 [MemoryStore] 创建向量表（全文检索模式）');
      }

      // 确定初始向量列名
      const embedModel = this.config.embedModel;
      const vectorColumn = embedModel 
        ? MemoryStore.modelIdToVectorColumn(embedModel) 
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
              // 文档分块 ID（用于精确删除）
              documentId: '',
              };      this.table = await this.db.createTable(tableName, [sampleRecord]);
      // 删除占位符
      await this.table.delete('id = "placeholder"');
      
      log.info('📐 [MemoryStore] 创建向量表', { 
        vectorColumn,
        vectorDimension: vectorDimension || 1536,
        mode: vectorDimension === 0 ? 'fulltext' : 'vector',
        embeddingAvailable: this.config.embeddingService?.isAvailable() ?? false,
        embedModel,
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
   * 迁移旧数据结构
   * 
   * 迁移策略：批量删除 + 批量添加，避免逐条操作
   */
  private async migrateLegacySchema(): Promise<void> {
    if (!this.table) return;

    try {
      const schema = await this.table.schema();
      const hasLegacyVector = schema.fields.some(f => f.name === 'vector');
      const hasActiveEmbed = schema.fields.some(f => f.name === 'active_embed');

      // 如果已有 active_embed 字段，说明已迁移过
      if (hasActiveEmbed) {
        log.debug('📐 [MemoryStore] 数据结构已是新版，无需迁移');
        return;
      }

      // 如果没有旧版 vector 列，也无需迁移
      if (!hasLegacyVector) {
        log.debug('📐 [MemoryStore] 无旧版向量列，无需迁移');
        return;
      }

      // 检查是否有数据
      const count = await this.table.countRows();
      if (count === 0) {
        log.debug('📐 [MemoryStore] 表为空，无需迁移');
        return;
      }

      log.info('🔄 [MemoryStore] 开始迁移旧数据结构', { recordCount: count });

      // 获取当前模型
      const embedModel = this.config.embedModel;
      if (!embedModel) {
        log.warn('📐 [MemoryStore] 未配置嵌入模型，跳过向量列迁移');
        return;
      }

      const newVectorColumn = MemoryStore.modelIdToVectorColumn(embedModel);

      // 读取所有旧记录
      const records = await this.table.query().toArray();

      // 准备迁移的记录
      const toMigrate: Record<string, unknown>[] = [];
      const idsToDelete: string[] = [];

      for (const record of records) {
        const oldVector = record.vector as number[] | undefined;
        if (!oldVector || oldVector.length === 0) continue;

        toMigrate.push({
          ...record,
          [newVectorColumn]: oldVector,
          active_embed: embedModel,
          embed_versions: JSON.stringify({ [embedModel]: Date.now() }),
        });
        idsToDelete.push(String(record.id));
      }

      if (toMigrate.length === 0) {
        log.debug('📐 [MemoryStore] 无需迁移的记录');
        return;
      }

      // 批量删除旧记录
      const deleteIds = idsToDelete.map(id => `"${this.escapeValue(id)}"`).join(', ');
      await this.table.delete(`id IN (${deleteIds})`);

      // 批量添加新记录
      await this.table.add(toMigrate);

      log.info('✅ [MemoryStore] 旧数据结构迁移完成', { 
        migratedCount: toMigrate.length,
        newVectorColumn,
        embedModel,
      });

    } catch (error) {
      log.error('🚨 [MemoryStore] 迁移旧数据结构失败', { error: String(error) });
      // 不抛出错误，允许继续使用
    }
  }

  /**
   * 确保 documentId 列存在
   * 
   * documentId 列用于文档分块的精确删除，避免 LIKE 查询。
   * 如果列不存在，需要重建表。
   */
  private async ensureDocumentIdColumn(): Promise<void> {
    if (!this.table) return;

    // 检查列是否已存在
    const schema = await this.table.schema();
    const columnExists = schema.fields.some(f => f.name === 'documentId');

    if (columnExists) {
      log.debug('📐 [MemoryStore] documentId 列已存在');
      return;
    }

    log.info('📐 [MemoryStore] documentId 列不存在，需要重建表');

    // 确保 db 已初始化
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    // 保存现有数据
    const existingRecords = await this.table.query().toArray();
    const existingCount = existingRecords.length;

    log.info('📐 [MemoryStore] 备份现有数据', { recordCount: existingCount });

    // 收集所有现有向量列及其维度
    const existingVectorColumns: { name: string; dimension: number }[] = [];
    for (const field of schema.fields) {
      if (field.name.startsWith('vector_')) {
        const dim = await this.getVectorDimensionWithoutInit(field.name);
        if (dim > 0) {
          existingVectorColumns.push({ name: field.name, dimension: dim });
        }
      }
    }

    // 从实际数据中检测向量列
    if (existingCount > 0 && existingRecords.length > 0) {
      const firstRecord = existingRecords[0];
      for (const [key, value] of Object.entries(firstRecord)) {
        if (key.startsWith('vector_') && !existingVectorColumns.some(c => c.name === key)) {
          let dim = 0;
          if (Array.isArray(value)) {
            dim = (value as number[]).length;
          } else if (value && typeof value === 'object' && 'toArray' in value) {
            const arr = (value as { toArray: () => number[] }).toArray();
            dim = arr.length;
          } else if (value && typeof value === 'object' && 'length' in value) {
            dim = (value as { length: number }).length;
          }
          if (dim > 0) {
            existingVectorColumns.push({ name: key, dimension: dim });
          }
        }
      }
    }

    // 删除旧表
    const tableName = 'memories';
    await this.db.dropTable(tableName);

    // 创建包含所有向量列和 documentId 的占位记录
    const placeholderRecord: Record<string, unknown> = {
      id: `__schema_placeholder__`,
      sessionId: '__schema__',
      type: '__schema__',
      content: '__schema__',
      // 保留所有现有向量列
      ...Object.fromEntries(
        existingVectorColumns.map(col => [col.name, new Array(col.dimension).fill(0)])
      ),
      metadata: '{}',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      active_embed: '',
      embed_versions: '{}',
      // 添加 documentId 列
      documentId: '',
    };

    // 创建新表
    this.table = await this.db.createTable(tableName, [placeholderRecord]);
    
    // 删除占位记录
    await this.table.delete(`id = "__schema_placeholder__"`);

    // 恢复旧数据（添加 documentId 字段）
    if (existingCount > 0) {
      const normalizedRecords = existingRecords.map(record => ({
        ...record,
        documentId: '',  // 添加空的 documentId
        // 确保 active_embed 和 embed_versions 不为 null（LanceDB 类型推断要求）
        active_embed: record.active_embed ?? '',
        embed_versions: record.embed_versions ?? '{}',
      }));
      // 标准化向量列
      const finalRecords = this.normalizeVectorColumns(normalizedRecords, existingVectorColumns);
      await this.table.add(finalRecords);
    }

    log.info('✅ [MemoryStore] 表已重建，documentId 列已添加', { 
      restoredRecords: existingCount,
      preservedVectorColumns: existingVectorColumns.length,
    });
  }

  /**
   * 确保当前嵌入模型的向量列存在
   * 
   * LanceDB 不支持通过 addColumns 添加 FixedSizeList 类型的向量列，
   * 因此需要重建表来添加新向量列。
   * 
   * 关键：重建表时必须保留所有现有向量列，否则旧数据恢复会失败。
   */
  private async ensureVectorColumn(): Promise<void> {
    if (!this.table) return;

    const embedModel = this.config.embedModel;
    if (!embedModel) return;

    const targetColumn = MemoryStore.modelIdToVectorColumn(embedModel);

    // 检查列是否已存在
    const schema = await this.table.schema();
    const columnExists = schema.fields.some(f => f.name === targetColumn);

    if (columnExists) {
      log.debug('📐 [MemoryStore] 向量列已存在', { column: targetColumn });
      return;
    }

    log.info('📐 [MemoryStore] 向量列不存在，需要重建表', { 
      newColumn: targetColumn,
      embedModel,
    });

    // 确保 db 已初始化
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    // 检测新向量维度
    const vectorDimension = await this.detectVectorDimension();
    const dimension = vectorDimension || 1024;

    // 保存现有数据
    const existingRecords = await this.table.query().toArray();
    const existingCount = existingRecords.length;

    log.info('📐 [MemoryStore] 备份现有数据', { recordCount: existingCount });

    // 收集所有现有向量列及其维度
    // 方法 1：从 schema 中检测
    const existingVectorColumns: { name: string; dimension: number }[] = [];
    for (const field of schema.fields) {
      if (field.name.startsWith('vector_') && field.name !== targetColumn) {
        // 从现有数据中获取该向量列的维度
        const dim = await this.getVectorDimensionWithoutInit(field.name);
        if (dim > 0) {
          existingVectorColumns.push({ name: field.name, dimension: dim });
        }
      }
    }

    // 方法 2：从实际数据中检测向量列（处理 schema 不包含动态列的情况）
    if (existingCount > 0 && existingRecords.length > 0) {
      const firstRecord = existingRecords[0];
      log.debug('📐 [MemoryStore] 从数据中检测向量列', { 
        keys: Object.keys(firstRecord).filter(k => k.startsWith('vector_')),
        firstRecordType: typeof firstRecord,
      });
      
      for (const [key, value] of Object.entries(firstRecord)) {
        // 跳过目标列和已检测到的列
        if (key === targetColumn || existingVectorColumns.some(c => c.name === key)) continue;
        // 检测是否是向量列（以 vector_ 开头且是类数组对象）
        if (key.startsWith('vector_') && value && typeof value === 'object') {
          // 检查是否是数组或类数组对象（FixedSizeList 也是类数组）
          let dim = 0;
          if (Array.isArray(value)) {
            dim = (value as number[]).length;
            log.debug('📐 [MemoryStore] 检测到数组类型向量列', { key, dim });
          } else if ('length' in value && typeof (value as { length: unknown }).length === 'number') {
            // FixedSizeList 或其他类数组对象有 length 属性
            dim = (value as { length: number }).length;
            log.debug('📐 [MemoryStore] 检测到类数组类型向量列', { key, dim, hasLength: true });
          } else if ('toArray' in value && typeof (value as { toArray: () => unknown }).toArray === 'function') {
            // FixedSizeList 有 toArray 方法
            const arr = (value as { toArray: () => number[] }).toArray();
            dim = arr.length;
            log.debug('📐 [MemoryStore] 检测到 FixedSizeList 类型向量列', { key, dim, hasToArray: true });
          } else {
            log.debug('📐 [MemoryStore] 无法识别的向量类型', { 
              key, 
              valueType: typeof value, 
              keys: Object.keys(value as object),
            });
          }
          
          if (dim > 0) {
            existingVectorColumns.push({ name: key, dimension: dim });
          }
        }
      }
    }

    log.info('📐 [MemoryStore] 保留现有向量列', { 
      columns: existingVectorColumns.map(c => `${c.name}(${c.dimension})`),
      detectedFromData: existingCount > 0,
    });

    // 删除旧表
    const tableName = 'memories';
    await this.db!.dropTable(tableName);

    // 创建包含所有向量列的占位记录
    const placeholderRecord: Record<string, unknown> = {
      id: `__schema_placeholder__`,
      sessionId: '__schema__',
      type: '__schema__',
      content: '__schema__',
      // 新向量列
      [targetColumn]: new Array(dimension).fill(0),
      // 保留所有现有向量列（关键！）
      ...Object.fromEntries(
        existingVectorColumns.map(col => [col.name, new Array(col.dimension).fill(0)])
      ),
      metadata: '{}',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      active_embed: embedModel,
      embed_versions: JSON.stringify({ [embedModel]: Date.now() }),
      // 文档分块 ID（用于精确删除）
      documentId: '',
    };

    // 创建新表
    this.table = await this.db.createTable(tableName, [placeholderRecord]);
    
    // 删除占位记录
    await this.table.delete(`id = "__schema_placeholder__"`);

    // 恢复旧数据（现在 schema 包含所有向量列，数据恢复成功）
    // 关键修复：将 FixedSizeList 向量转换为普通数组，避免 LanceDB 的 isValid 字段问题
    // 参考：https://github.com/lancedb/lancedb/issues/2134
    if (existingCount > 0) {
      const normalizedRecords = this.normalizeVectorColumns(existingRecords, existingVectorColumns).map(record => ({
        ...record,
        // 确保 documentId 存在
        documentId: record.documentId ?? '',
        // 确保 active_embed 和 embed_versions 不为 null
        active_embed: record.active_embed ?? '',
        embed_versions: record.embed_versions ?? '{}',
      }));
      await this.table.add(normalizedRecords);
    }

    log.info('✅ [MemoryStore] 表已重建，新向量列已添加', { 
      column: targetColumn, 
      dimension,
      restoredRecords: existingCount,
      preservedColumns: existingVectorColumns.length,
    });
  }

  /**
   * 存储记忆条目（双存储）
   */
  async store(entry: MemoryEntry): Promise<void> {
    await this.ensureInitialized();

    // 获取向量（如果嵌入服务可用）
    let vector = entry.vector ?? (await this.getEmbedding(entry.content));
    
    // 检查向量有效性：空数组或 null 都视为无效
    if (vector && Array.isArray(vector) && vector.length === 0) {
      log.warn('⚠️ [MemoryStore] 检测到空向量，将按无向量处理', { 
        id: entry.id,
        content: entry.content.slice(0, 100)
      });
      vector = undefined;
    }

    // 确定向量列名
    const embedModel = this.config.embedModel;
    const vectorColumn = embedModel 
      ? MemoryStore.modelIdToVectorColumn(embedModel) 
      : 'vector';

    // 提取 documentId（用于文档分块的精确删除）
    const documentId = entry.metadata?.documentId ?? '';

    // 1. 存储到 LanceDB（主存储）
    const record: Record<string, unknown> = {
      id: entry.id,
      sessionId: entry.sessionId,
      type: entry.type,
      content: entry.content,
      [vectorColumn]: vector ?? [],
      metadata: JSON.stringify(entry.metadata),
      createdAt: entry.createdAt.getTime(),
      updatedAt: entry.updatedAt.getTime(),
      // 多嵌入模型支持
      active_embed: embedModel ?? null,
      embed_versions: embedModel ? JSON.stringify({ [embedModel]: Date.now() }) : null,
      // 独立 documentId 列（用于精确删除文档分块）
      documentId,
    };

    await this.table?.add([record]);

    // 2. 存储到 Markdown（人类可读备份）
    await this.storeMarkdown(entry);

    log.info('💾 [MemoryStore] 记忆已存储', { 
      id: entry.id, 
      type: entry.type,
      sessionId: entry.sessionId,
      hasVector: !!vector,
      vectorLength: vector?.length ?? 0,
      vectorColumn,
      embedModel,
      mode: vector ? 'vector' : 'fulltext'
    });

    // 3. 检查是否需要清理旧向量
    await this.checkAndCleanup();
  }

  /**
   * 批量存储记忆条目
   */
  async storeBatch(entries: MemoryEntry[]): Promise<void> {
    await this.ensureInitialized();

    // 确定向量列名
    const embedModel = this.config.embedModel;
    const vectorColumn = embedModel 
      ? MemoryStore.modelIdToVectorColumn(embedModel) 
      : 'vector';

    const records: Record<string, unknown>[] = [];
    let validVectorCount = 0;
    let emptyVectorCount = 0;

    for (const entry of entries) {
      let vector = entry.vector ?? (await this.getEmbedding(entry.content));
      
      // 检查向量有效性
      if (vector && Array.isArray(vector) && vector.length === 0) {
        vector = undefined;
        emptyVectorCount++;
      } else if (vector && Array.isArray(vector) && vector.length > 0) {
        validVectorCount++;
      }
      
      // 提取 documentId（用于文档分块的精确删除）
      const documentId = entry.metadata?.documentId ?? '';

      records.push({
        id: entry.id,
        sessionId: entry.sessionId,
        type: entry.type,
        content: entry.content,
        [vectorColumn]: vector ?? [],
        metadata: JSON.stringify(entry.metadata),
        createdAt: entry.createdAt.getTime(),
        updatedAt: entry.updatedAt.getTime(),
        // 多嵌入模型支持
        active_embed: embedModel ?? null,
        embed_versions: embedModel ? JSON.stringify({ [embedModel]: Date.now() }) : null,
        // 独立 documentId 列（用于精确删除文档分块）
        documentId,
      });
    }

    // 批量写入 LanceDB
    await this.table?.add(records);

    // 批量写入 Markdown
    for (const entry of entries) {
      await this.storeMarkdown(entry);
    }

    log.info('💾 [MemoryStore] 批量存储完成', { 
      count: entries.length, 
      validVectors: validVectorCount,
      emptyVectors: emptyVectorCount,
      vectorColumn 
    });
  }

  // ============================================================================
  // 文档记忆管理
  // ============================================================================

  /**
   * 存储文档分块
   * 
   * 将文档分块转换为记忆条目并存储到 MemoryStore。
   * 每个分块作为 type: 'document' 的 MemoryEntry 存储。
   * 
   * @param docId 文档 ID
   * @param chunks 分块列表
   * @param metadata 文档元数据
   */
  /**
   * 存储文档分块（增量更新）
   * 
   * 使用增量更新策略：
   * 1. 获取现有分块
   * 2. 计算差异（基于分块 ID）
   * 3. 只删除不再需要的分块
   * 4. 只添加新增或变化的分块
   */
  async storeDocumentChunks(
    docId: string,
    chunks: KnowledgeChunk[],
    metadata: KnowledgeDocMetadata
  ): Promise<void> {
    await this.ensureInitialized();

    if (chunks.length === 0) {
      // 新分块为空，删除所有旧分块
      await this.deleteDocumentChunks(docId);
      log.info('📄 [MemoryStore] 文档分块已清空', { docId });
      return;
    }

    // 获取现有分块
    const existingChunks = await this.getDocumentChunks(docId);
    const existingIds = new Set(existingChunks.map(c => c.id));
    const newIds = new Set(chunks.map(c => c.id));

    // 计算需要删除的分块
    const toDelete = existingChunks.filter(c => !newIds.has(c.id));
    
    // 计算需要添加的分块（新增或变化）
    const toAdd = chunks.filter(c => !existingIds.has(c.id));

    // 删除不再需要的分块
    if (toDelete.length > 0) {
      const deleteIds = toDelete.map(c => `"${c.id}"`).join(', ');
      await this.table?.delete(`id IN (${deleteIds})`);
      log.debug('📄 [MemoryStore] 删除旧分块', { docId, count: toDelete.length });
    }

    // 添加新分块
    if (toAdd.length > 0) {
      const entries: MemoryEntry[] = toAdd.map((chunk, index) => ({
        id: chunk.id,
        sessionId: 'knowledge_base',
        type: 'document' as const,
        content: chunk.content,
        vector: chunk.vector,
        metadata: {
          documentId: docId,
          documentPath: metadata.originalName,
          fileType: metadata.fileType,
          documentTitle: metadata.title,
          chunkIndex: chunks.indexOf(chunk), // 使用原始索引
          chunkStart: chunk.startPos,
          chunkEnd: chunk.endPos,
          tags: ['knowledge_base', metadata.fileType, ...(metadata.tags || [])],
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      await this.storeBatch(entries);
    }

    log.info('📄 [MemoryStore] 文档分块已更新', {
      docId,
      total: chunks.length,
      added: toAdd.length,
      deleted: toDelete.length,
      unchanged: chunks.length - toAdd.length,
      title: metadata.title || metadata.originalName,
    });
  }

  /**
   * 删除文档的所有分块
   * 
   * 使用独立的 documentId 列进行精确匹配，避免 LIKE 查询。
   */
  async deleteDocumentChunks(docId: string): Promise<void> {
    await this.ensureInitialized();

    try {
      // 使用 documentId 列精确匹配
      await this.table?.delete(`documentId = "${docId}"`);
      
      log.info('📄 [MemoryStore] 文档分块已删除', { docId });
    } catch (error) {
      // 兼容旧数据：documentId 列不存在时回退到 LIKE 查询
      try {
        await this.table?.delete(`type = 'document' AND metadata LIKE '%"documentId":"${docId}"%'`);
        log.info('📄 [MemoryStore] 文档分块已删除（兼容模式）', { docId });
      } catch {
        log.debug('📄 [MemoryStore] 删除文档分块时无匹配记录', { docId });
      }
    }
  }

  /**
   * 获取文档的所有分块
   * 
   * 使用独立的 documentId 列进行精确匹配。
   */
  async getDocumentChunks(docId: string): Promise<MemoryEntry[]> {
    await this.ensureInitialized();

    try {
      // 使用 documentId 列精确匹配
      const records = await this.table
        ?.query()
        .where(`documentId = "${docId}"`)
        .toArray() ?? [];

      return records.map(record => this.recordToEntry(record));
    } catch {
      // 兼容旧数据：documentId 列不存在时回退到 LIKE 查询
      try {
        const records = await this.table
          ?.query()
          .where(`type = 'document' AND metadata LIKE '%"documentId":"${docId}"%'`)
          .toArray() ?? [];

        return records.map(record => this.recordToEntry(record));
      } catch (error) {
        log.warn('📄 [MemoryStore] 获取文档分块失败', { docId, error: String(error) });
        return [];
      }
    }
  }

  /**
   * 按类型统计记忆数量
   */
  async getStatsByType(): Promise<Record<string, number>> {
    await this.ensureInitialized();

    const stats: Record<string, number> = {};
    
    try {
      const records = await this.table?.query().toArray() ?? [];
      
      for (const record of records) {
        const type = String(record.type || 'other');
        stats[type] = (stats[type] || 0) + 1;
      }
    } catch (error) {
      log.warn('📊 [MemoryStore] 统计记忆类型失败', { error: String(error) });
    }

    return stats;
  }

  /**
   * 双层检索
   * 
   * 架构：
   * 1. 第一层：向量检索返回 Top-200 候选（O(log n) 复杂度）
   * 2. 第二层：候选内 n-gram 关键词匹配（O(200) 固定复杂度）
   * 3. 第三层：综合分数重排序（向量 0.7 + 关键词 0.3）
   * 
   * 优势：
   * - 向量检索承载主要过滤负载（百万级 <20ms）
   * - 候选内关键词匹配复杂度固定
   * - 支持中英文混合检索
   * 
   * @param query 查询文本
   * @param limit 返回结果数量（默认 10）
   * @param candidates 向量检索候选数量（默认 200）
   * @param filter 过滤条件
   * @param modelId 嵌入模型 ID
   */
  async dualLayerSearch(
    query: string,
    limit: number = 10,
    candidates: number = 200,
    filter?: MemoryFilter,
    modelId?: string
  ): Promise<MemoryEntry[]> {
    await this.ensureInitialized();

    const startTime = Date.now();
    const targetModel = modelId ?? this.config.embedModel;
    const hasEmbedding = this.config.embeddingService?.isAvailable();
    const hasVectorColumn = targetModel ? await this.hasVectorColumn(targetModel) : false;

    // 第一层：向量检索
    let vectorCandidates: MemoryEntry[] = [];
    let vectorScores: Map<string, number> = new Map();

    if (hasEmbedding && hasVectorColumn) {
      try {
        vectorCandidates = await this.vectorSearch(query, candidates, filter, targetModel);
        
        // 计算向量相似度分数（归一化）
        // LanceDB 返回的结果按相似度排序，第一名分数最高
        for (let i = 0; i < vectorCandidates.length; i++) {
          const entry = vectorCandidates[i];
          // 使用倒数排名作为分数（第一名 1.0，最后一名接近 0）
          const score = 1 - (i / vectorCandidates.length);
          vectorScores.set(entry.id, score);
        }
      } catch (error) {
        log.warn('🔍 [MemoryStore] 双层检索向量层失败', { error: String(error) });
      }
    }

    // 如果向量检索无结果，回退到全文检索
    if (vectorCandidates.length === 0) {
      log.info('🔍 [MemoryStore] 双层检索回退到全文检索', { query: query.slice(0, 50) });
      this.lastSearchMode = 'fulltext';
      return this.fulltextSearch(query, limit, filter);
    }

    // 第二层：候选内关键词匹配
    const keywords = this.extractKeywords(query);
    const scoredCandidates: Array<{ entry: MemoryEntry; vectorScore: number; keywordScore: number; finalScore: number }> = [];

    for (const entry of vectorCandidates) {
      const vectorScore = vectorScores.get(entry.id) ?? 0;
      const keywordScore = this.calculateKeywordScore(entry.content, keywords);
      // 第三层：综合分数重排序
      const finalScore = vectorScore * 0.7 + keywordScore * 0.3;

      scoredCandidates.push({
        entry,
        vectorScore,
        keywordScore,
        finalScore,
      });
    }

    // 按综合分数排序
    scoredCandidates.sort((a, b) => b.finalScore - a.finalScore);

    const elapsed = Date.now() - startTime;
    this.lastSearchMode = 'hybrid';

    log.info('📖 记忆检索完成', {
      query: query.slice(0, 50),
      source: 'dual-layer',
      sourceDetail: {
        vectorCandidates: vectorCandidates.length,
        keywords: keywords.slice(0, 5),
      },
      resultCount: Math.min(scoredCandidates.length, limit),
      elapsed: `${elapsed}ms`,
    });

    // 返回 Top-K 结果，并附加分数到 metadata
    return scoredCandidates.slice(0, limit).map(item => ({
      ...item.entry,
      metadata: {
        ...item.entry.metadata,
        score: item.finalScore,
      },
    }));
  }

  /**
   * 计算关键词匹配分数
   * 
   * @param content 内容文本
   * @param keywords 关键词列表
   * @returns 归一化分数 (0-1)
   */
  private calculateKeywordScore(content: string, keywords: string[]): number {
    if (keywords.length === 0) return 0;

    const lowerContent = content.toLowerCase();
    let matchCount = 0;
    let totalWeight = 0;

    for (const keyword of keywords) {
      const weight = keyword.length / keywords.reduce((sum, k) => sum + k.length, 0);
      totalWeight += weight;

      // 计算关键词出现次数
      const regex = new RegExp(this.escapeRegex(keyword), 'gi');
      const matches = lowerContent.match(regex);
      if (matches && matches.length > 0) {
        // 匹配次数越多，分数越高，但有上限
        matchCount += weight * Math.min(matches.length, 3);
      }
    }

    // 归一化到 0-1 范围
    return totalWeight > 0 ? Math.min(matchCount / totalWeight, 1) : 0;
  }

  // ============================================================================
  // 搜索
  // ============================================================================

  /**
   * 搜索记忆
   * 
   * 策略：
   * 1. 优先使用向量检索（如果嵌入服务可用）
   * 2. 向量检索失败时自动回退到全文检索
   * 3. 支持 hybrid 模式：向量 + 全文合并结果
   * 4. 支持模型切换：通过 options.model 指定使用的模型
   * 5. 支持迁移中混合检索：已迁移部分用向量，未迁移部分用全文
   */
  async search(query: string, options?: SearchOptions): Promise<MemoryEntry[]> {
    await this.ensureInitialized();

    const limit = Math.min(
      options?.limit ?? this.config.defaultSearchLimit!,
      this.config.maxSearchLimit!
    );

    const mode = options?.mode ?? 'auto';
    const hasEmbedding = this.config.embeddingService?.isAvailable();

    // 确定使用的模型（支持通过 options 覆盖）
    const targetModel = options?.model ?? this.config.embedModel;
    const vectorColumn = targetModel 
      ? MemoryStore.modelIdToVectorColumn(targetModel)
      : 'vector';

    // 检查该模型的向量列是否存在
    const hasVectorColumn = targetModel ? await this.hasVectorColumn(targetModel) : true;

    // 根据模式选择检索策略，并在开始前记录日志
    switch (mode) {
      case 'fulltext':
        log.info('🔍 [MemoryStore] 开始检索全文记忆', { 
          query: query.slice(0, 50),
          limit,
          mode: 'fulltext'
        });
        this.lastSearchMode = 'fulltext';
        return this.fulltextSearch(query, limit, options?.filter);
      
      case 'vector':
        if (!hasEmbedding || !hasVectorColumn) {
          log.warn('🔍 [MemoryStore] 向量模式但条件不满足，回退到全文检索', {
            hasEmbedding,
            hasVectorColumn,
          });
          log.info('🔍 [MemoryStore] 开始检索全文记忆', { 
            query: query.slice(0, 50),
            limit,
            mode: 'fulltext (回退)'
          });
          this.lastSearchMode = 'fulltext';
          return this.fulltextSearch(query, limit, options?.filter);
        }
        log.info('🔍 [MemoryStore] 开始检索向量记忆', { 
          query: query.slice(0, 50),
          limit,
          mode: 'vector',
          vectorColumn,
          targetModel
        });
        this.lastSearchMode = 'vector';
        return this.vectorSearch(query, limit, options?.filter, targetModel);
      
      case 'hybrid':
        log.info('🔍 [MemoryStore] 开始检索混合记忆', { 
          query: query.slice(0, 50),
          limit,
          mode: 'hybrid',
          vectorColumn,
          targetModel
        });
        this.lastSearchMode = 'hybrid';
        return this.hybridSearch(query, limit, options?.filter, targetModel);
      
      case 'auto':
      default:
        // 自动模式：检查是否在迁移中
        const migrationStatus = await this.getMigrationStatus();
        
        if (migrationStatus.status === 'running' && migrationStatus.targetModel === targetModel) {
          // 迁移中：混合检索（已迁移向量 + 未迁移全文）
          log.info('🔍 [MemoryStore] 开始检索混合记忆', { 
            query: query.slice(0, 50),
            limit,
            mode: 'migration-hybrid',
            migratedUntil: migrationStatus.migratedUntil,
            progress: migrationStatus.progress,
          });
          this.lastSearchMode = 'migration-hybrid';
          return this.migrationAwareSearch(query, limit, options?.filter, targetModel, migrationStatus);
        }
        
        // 非迁移中：优先向量，失败回退全文
        if (hasEmbedding && hasVectorColumn) {
          log.info('🔍 [MemoryStore] 开始检索向量记忆', { 
            query: query.slice(0, 50),
            limit,
            mode: 'vector',
            vectorColumn,
            targetModel
          });
          const results = await this.vectorSearch(query, limit, options?.filter, targetModel);
          if (results.length > 0) {
            this.lastSearchMode = 'vector';
            return results;
          }
          // 向量检索无结果，尝试全文检索
          log.info('🔍 [MemoryStore] 向量检索无结果，开始检索全文记忆');
          this.lastSearchMode = 'fulltext';
          return this.fulltextSearch(query, limit, options?.filter);
        }
        log.info('🔍 [MemoryStore] 开始检索全文记忆', { 
          query: query.slice(0, 50),
          limit,
          mode: 'fulltext'
        });
        this.lastSearchMode = 'fulltext';
        return this.fulltextSearch(query, limit, options?.filter);
    }
  }

  /**
   * 混合检索（向量 + 全文）
   */
  private async hybridSearch(query: string, limit: number, filter?: MemoryFilter, modelId?: string): Promise<MemoryEntry[]> {
    const targetModel = modelId ?? this.config.embedModel;
    const hasVectorColumn = targetModel ? await this.hasVectorColumn(targetModel) : true;

    const [vectorResults, fulltextResults] = await Promise.all([
      this.config.embeddingService?.isAvailable() && hasVectorColumn
        ? this.vectorSearch(query, limit, filter, targetModel) 
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
      source: 'hybrid',
      sourceDetail: {
        vector: vectorResults.length,
        fulltext: fulltextResults.length,
      },
      resultCount: merged.length,
      model: targetModel,
    });

    return merged.slice(0, limit);
  }

  /**
   * 迁移中混合检索
   * 向量检索已迁移部分 + 全文检索未迁移部分
   */
  private async migrationAwareSearch(
    query: string, 
    limit: number, 
    filter: MemoryFilter | undefined, 
    modelId: string | undefined,
    migrationStatus: import('./types').MigrationStatus
  ): Promise<MemoryEntry[]> {
    const targetModel = modelId ?? this.config.embedModel;
    if (!targetModel) {
      // 无目标模型，回退到全文检索
      return this.fulltextSearch(query, limit, filter);
    }
    
    const vectorColumn = MemoryStore.modelIdToVectorColumn(targetModel);
    
    // 并行执行向量检索和全文检索
    const [vectorResults, fulltextResults] = await Promise.all([
      // 向量检索：已迁移到新模型的记录
      this.config.embeddingService?.isAvailable() && await this.hasVectorColumn(targetModel)
        ? this.vectorSearch(query, limit, filter, targetModel) 
        : Promise.resolve([]),
      
      // 全文检索：未迁移的记录（createdAt > migratedUntil）
      this.fulltextSearchWithMigrationFilter(query, limit, filter, migrationStatus.migratedUntil),
    ]);

    // 合并结果，去重
    const seen = new Set<string>();
    const merged: MemoryEntry[] = [];

    // 优先添加向量检索结果（已迁移，质量更高）
    for (const entry of vectorResults) {
      if (!seen.has(entry.id)) {
        seen.add(entry.id);
        merged.push(entry);
      }
    }

    // 补充全文检索结果（未迁移部分）
    for (const entry of fulltextResults) {
      if (!seen.has(entry.id) && merged.length < limit) {
        seen.add(entry.id);
        merged.push(entry);
      }
    }

    log.info('📖 记忆检索完成', { 
      query: query.slice(0, 50),
      source: 'migration-hybrid',
      sourceDetail: {
        vector: { count: vectorResults.length, desc: '已迁移部分' },
        fulltext: { count: fulltextResults.length, desc: '未迁移部分' },
      },
      resultCount: merged.length,
      migration: {
        progress: migrationStatus.progress,
        migratedUntil: migrationStatus.migratedUntil,
      },
    });

    return merged.slice(0, limit);
  }

  /**
   * 带迁移过滤的全文检索
   * 只检索未迁移的记录（createdAt > migratedUntil）
   */
  private async fulltextSearchWithMigrationFilter(
    query: string, 
    limit: number, 
    filter: MemoryFilter | undefined,
    migratedUntil?: number
  ): Promise<MemoryEntry[]> {
    if (!this.table) {
      return [];
    }

    try {
      const startTime = Date.now();

      // 构建查询
      let queryBuilder = this.table.query();

      // 构建过滤条件
      const conditions: string[] = [];
      
      // 只检索未迁移的记录
      if (migratedUntil !== undefined) {
        conditions.push(`createdAt > ${migratedUntil}`);
      }
      
      // 应用其他过滤条件
      if (filter?.sessionId) {
        conditions.push(`sessionId = "${filter.sessionId}"`);
      }
      if (filter?.type) {
        // 支持单个类型或多个类型
        const types = Array.isArray(filter.type) ? filter.type : [filter.type];
        const typeConditions = types.map(t => `type = "${t}"`).join(' OR ');
        conditions.push(`(${typeConditions})`);
      }
      
      if (conditions.length > 0) {
        queryBuilder = queryBuilder.where(conditions.join(' AND '));
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
          return { ...r, _score: score } as MemoryEntry & { _score: number };
        })
        .filter(r => r._score > 0)
        .sort((a, b) => b._score - a._score)
        .slice(0, limit);

      const elapsed = Date.now() - startTime;
      log.debug('🔍 [MemoryStore] 带迁移过滤的全文检索完成', {
        query: query.slice(0, 50),
        migratedUntil,
        resultCount: scored.length,
        elapsed,
      });

      return scored;
    } catch (error) {
      log.error('🔍 [MemoryStore] 带迁移过滤的全文检索失败', { error });
      return [];
    }
  }

  /**
   * 向量检索
   */
  private async vectorSearch(query: string, limit: number, filter?: MemoryFilter, modelId?: string): Promise<MemoryEntry[]> {
    // 检查嵌入服务是否可用
    if (!this.config.embeddingService?.isAvailable()) {
      log.info('🔍 [MemoryStore] 嵌入服务不可用，跳过向量检索');
      return [];
    }

    // 确定使用的模型和向量列
    const targetModel = modelId ?? this.config.embedModel;
    const vectorColumn = targetModel 
      ? MemoryStore.modelIdToVectorColumn(targetModel)
      : 'vector';

    // 检查表的向量维度
    const tableVectorDimension = await this.getVectorDimension(vectorColumn);
    if (tableVectorDimension === 0) {
      log.info('🔍 [MemoryStore] 表无向量数据，跳过向量检索', { vectorColumn, targetModel });
      return [];
    }

    log.info('🔍 [MemoryStore] 向量列检查通过', { vectorColumn, tableVectorDimension });

    try {
      const startTime = Date.now();
      const vector = await this.config.embeddingService.embed(query);
      
      // 检查向量维度是否匹配
      if (vector.length !== tableVectorDimension) {
        log.warn('⚠️ [MemoryStore] 向量维度不匹配，跳过向量检索', { 
          queryDimension: vector.length, 
          tableDimension: tableVectorDimension,
          vectorColumn,
        });
        return [];
      }
      
      // 构建过滤条件（仅用于 sessionId 和 type 过滤）
      const conditions: string[] = [];
      
      if (filter?.sessionId) {
        conditions.push(`sessionId = "${this.escapeValue(filter.sessionId)}"`);
      }
      if (filter?.type) {
        // 支持单个类型或多个类型
        const types = Array.isArray(filter.type) ? filter.type : [filter.type];
        const typeConditions = types.map(t => `type = "${this.escapeValue(t)}"`).join(' OR ');
        conditions.push(`(${typeConditions})`);
      }
      
      // 先获取 limit * 2 条结果，以便在过滤空向量后仍有足够结果
      const searchLimit = limit * 2;
      
      let queryBuilder = this.table!.vectorSearch(vector)
        .column(vectorColumn)
        .limit(searchLimit);
      
      if (conditions.length > 0) {
        const whereClause = conditions.join(' AND ');
        queryBuilder = queryBuilder.where(whereClause);
      }
      
      log.debug('🔍 [MemoryStore] 执行向量搜索', { 
        vectorColumn, 
        queryDimension: vector.length,
        filter: conditions.length > 0 ? conditions.join(' AND ') : 'none'
      });
      
      const rawResults = await queryBuilder.toArray();
      
      // 过滤掉空向量记录（空向量无法参与相似度计算）
      const results = rawResults.filter(r => {
        const vec = r[vectorColumn];
        if (!vec) return false;
        if (Array.isArray(vec)) return vec.length > 0;
        if (typeof vec === 'object') {
          if ('length' in vec) return (vec as { length: number }).length > 0;
          if ('toArray' in vec) {
            const arr = (vec as { toArray: () => number[] }).toArray();
            return arr.length > 0;
          }
        }
        return false;
      }).slice(0, limit);
      
      const elapsed = Date.now() - startTime;

      log.info('📖 记忆检索完成', { 
        query: query.slice(0, 50),
        source: 'vector',
        sourceDetail: {
          column: vectorColumn,
          model: targetModel,
        },
        resultCount: results.length,
        rawCount: rawResults.length,
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
        source: 'fulltext',
        sourceDetail: {
          keywords: keywords.slice(0, 5),
        },
        resultCount: scored.length,
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
      .where(`sessionId = "${this.escapeValue(sessionId)}"`)
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
      .where(`id = "${this.escapeValue(id)}"`)
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
    await this.table?.delete(`id = "${this.escapeValue(id)}"`);
    log.debug('记忆已删除', { id });
  }

  /**
   * 清除会话记忆
   */
  async clearSession(sessionId: string): Promise<void> {
    await this.ensureInitialized();
    await this.table?.delete(`sessionId = "${this.escapeValue(sessionId)}"`);
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
   * 获取记录总数
   */
  async count(): Promise<number> {
    await this.ensureInitialized();
    const results = await this.table?.query().toArray();
    return results?.length ?? 0;
  }

  /**
   * 查询记忆（支持复杂过滤和排序）
   */
  async query(options: {
    filter?: Record<string, unknown>;
    limit?: number;
    offset?: number;
    orderBy?: { field: string; direction: 'asc' | 'desc' };
  }): Promise<MemoryEntry[]> {
    await this.ensureInitialized();
    if (!this.table) return [];

    let query = this.table.query();

    // 应用过滤条件
    if (options.filter) {
      for (const [key, value] of Object.entries(options.filter)) {
        if (value && typeof value === 'object' && '$exists' in value) {
          // 处理 $exists 操作符
          const exists = value.$exists;
          if (exists === false) {
            query = query.where(`${this.escapeValue(key)} IS NULL`);
          }
        } else if (value && typeof value === 'object' && '$gt' in value) {
          query = query.where(`${this.escapeValue(key)} > ${value.$gt}`);
        } else if (value && typeof value === 'object' && '$gte' in value) {
          query = query.where(`${this.escapeValue(key)} >= ${value.$gte}`);
        } else if (value && typeof value === 'object' && '$ne' in value) {
          query = query.where(`${this.escapeValue(key)} != "${this.escapeValue(String(value.$ne))}"`);
        } else {
          query = query.where(`${this.escapeValue(key)} = "${this.escapeValue(String(value))}"`);
        }
      }
    }

    // 获取结果
    let results = await query.toArray();

    // 在内存中排序（LanceDB 不支持 orderBy）
    if (options.orderBy) {
      const { field, direction } = options.orderBy;
      results = results.sort((a, b) => {
        const aVal = a[field as keyof typeof a];
        const bVal = b[field as keyof typeof b];
        if (aVal === undefined || aVal === null) return 1;
        if (bVal === undefined || bVal === null) return -1;
        const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
        return direction === 'desc' ? -cmp : cmp;
      });
    }

    // 应用分页
    if (options.offset) {
      results = results.slice(options.offset);
    }
    if (options.limit) {
      results = results.slice(0, options.limit);
    }

    return results.map(r => this.recordToEntry(r));
  }

  /**
   * 更新记录的向量
   * 
   * 注意：LanceDB 不支持部分更新，因此使用重新写入的方式
   */
  async updateVector(
    id: string,
    vectorColumn: string,
    vector: number[],
    modelId: string
  ): Promise<void> {
    await this.ensureInitialized();
    if (!this.table) return;

    // 获取现有记录的原始数据
    const escapedId = this.escapeValue(id);
    const results = await this.table
      .query()
      .where(`id = "${escapedId}"`)
      .limit(1)
      .toArray();

    if (results.length === 0) {
      throw new Error(`Record not found: ${id}`);
    }

    const original = results[0];

    // 获取所有向量列信息，用于标准化
    const schema = await this.table.schema();
    const vectorColumns: { name: string }[] = schema.fields
      .filter(f => f.name.startsWith('vector_'))
      .map(f => ({ name: f.name }));

    // 标准化原始记录中的向量列（将 FixedSizeList 转为普通数组）
    const normalizedOriginal = this.normalizeVectorColumns([original], vectorColumns)[0];

    // 创建更新后的记录
    const updated = {
      ...normalizedOriginal,
      [vectorColumn]: vector,
      active_embed: modelId,
      updatedAt: Date.now(),
    };

    // 非原子操作保护：删除前备份原始记录
    const backupRecord = { ...normalizedOriginal };

    try {
      // 删除原记录并添加新记录
      await this.table.delete(`id = "${escapedId}"`);
      await this.table.add([updated]);

      log.debug('向量已更新', { id, vectorColumn, modelId });
    } catch (error) {
      // 尝试恢复原始记录
      log.error('🚨 [MemoryStore] 向量更新失败，尝试恢复原始记录', { 
        id, 
        error: String(error) 
      });
      
      try {
        // 检查记录是否已被删除
        const checkResults = await this.table
          .query()
          .where(`id = "${escapedId}"`)
          .limit(1)
          .toArray();
        
        if (checkResults.length === 0) {
          // 记录已被删除，尝试恢复
          await this.table.add([backupRecord]);
          log.info('✅ [MemoryStore] 原始记录已恢复', { id });
        }
      } catch (recoveryError) {
        log.error('🚨 [MemoryStore] 恢复原始记录失败', { 
          id, 
          error: String(recoveryError) 
        });
      }
      
      throw error;
    }
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

    for (const expiredId of expired) {
      await this.table?.delete(`id = "${this.escapeValue(expiredId)}"`);
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

  /**
   * 转义 SQL 查询中的字符串值
   * 防止特殊字符导致的注入风险
   */
  private escapeValue(value: string): string {
    // 转义反斜杠和双引号
    return value
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"');
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

  // ========== 多嵌入模型支持 ==========

  /**
   * 将模型 ID 转换为向量列名
   * 
   * @param modelId 模型 ID（格式：<provider>/<model>）
   * @returns 向量列名（格式：vector_<provider>_<model>）
   * 
   * @example
   * modelIdToVectorColumn('openai/text-embedding-3-small') // 'vector_openai_text-embedding-3-small'
   * modelIdToVectorColumn('ollama/qwen3-embedding:0.6b') // 'vector_ollama_qwen3-embedding_0_6b'
   */
  static modelIdToVectorColumn(modelId: string): VectorColumnName {
    const [provider, ...modelParts] = modelId.split('/');
    const model = modelParts.join('/'); // 处理模型名中可能包含 / 的情况
    if (!provider || !model) {
      throw new Error(`Invalid model ID format: ${modelId}. Expected format: <provider>/<model>`);
    }
    // 替换所有特殊字符：/ : . - 等，避免 LanceDB Schema 问题
    // 使用下划线替换，并添加前缀区分不同字符
    const safeModel = model
      .replace(/\//g, '_s_')    // slash -> _s_
      .replace(/:/g, '_c_')     // colon -> _c_
      .replace(/\./g, '_d_')    // dot -> _d_
      .replace(/-/g, '_h_');    // hyphen -> _h_
    return `vector_${provider}_${safeModel}` as VectorColumnName;
  }

  /**
   * 将向量列名转换为模型 ID
   * 
   * @param column 向量列名
   * @returns 模型 ID
   * 
   * @example
   * vectorColumnToModelId('vector_openai_text-embedding-3-small') // 'openai/text-embedding-3-small'
   * vectorColumnToModelId('vector_ollama_qwen3-embedding_0_6b') // 'ollama/qwen3-embedding:0.6b'
   */
  static vectorColumnToModelId(column: string): string {
    if (!column.startsWith('vector_')) {
      throw new Error(`Invalid vector column name: ${column}. Must start with 'vector_'`);
    }
    const parts = column.slice(7).split('_'); // 移除 'vector_' 前缀
    if (parts.length < 2) {
      throw new Error(`Invalid vector column name: ${column}. Expected format: vector_<provider>_<model>`);
    }
    const provider = parts[0];
    
    // 重建模型名称，处理特殊字符编码
    const modelParts: string[] = [];
    for (let i = 1; i < parts.length; i++) {
      const part = parts[i];
      switch (part) {
        case 's':
          modelParts.push('/');
          break;
        case 'c':
          modelParts.push(':');
          break;
        case 'd':
          modelParts.push('.');
          break;
        case 'h':
          modelParts.push('-');
          break;
        default:
          modelParts.push(part);
      }
    }
    const model = modelParts.join('');
    
    return `${provider}/${model}`;
  }

  /**
   * 获取所有已存在的向量列名
   * 
   * @returns 向量列名列表
   */
  async getExistingVectorColumns(): Promise<VectorColumnName[]> {
    await this.ensureInitialized();
    if (!this.table) return [];

    try {
      // 获取表 schema
      const schema = await this.table.schema();
      const vectorColumns: VectorColumnName[] = [];

      for (const field of schema.fields) {
        if (field.name.startsWith('vector_')) {
          vectorColumns.push(field.name as VectorColumnName);
        }
      }

      // 如果没有动态向量列，检查是否有旧版 'vector' 列
      if (vectorColumns.length === 0) {
        const hasLegacyVector = schema.fields.some(f => f.name === 'vector');
        if (hasLegacyVector) {
          // 返回空的向量列列表，表示需要迁移
          log.info('📐 [MemoryStore] 检测到旧版向量列结构，需要迁移');
        }
      }

      return vectorColumns;
    } catch (error) {
      log.error('🚨 [MemoryStore] 获取向量列失败', { error: String(error) });
      return [];
    }
  }

  /**
   * 检查是否存在指定模型的向量列
   * 
   * @param modelId 模型 ID
   * @returns 是否存在
   */
  async hasVectorColumn(modelId: string): Promise<boolean> {
    const columns = await this.getExistingVectorColumns();
    const targetColumn = MemoryStore.modelIdToVectorColumn(modelId);
    return columns.includes(targetColumn);
  }

  /**
   * 获取向量列的维度（不触发初始化，用于 ensureVectorColumn 内部）
   * 
   * 注意：此方法假设 table 已初始化，不调用 ensureInitialized
   * 以避免在 ensureVectorColumn 中触发无限循环
   * 
   * @param column 向量列名
   * @returns 向量维度，如果列不存在返回 0
   */
  async getVectorDimensionWithoutInit(column: string): Promise<number> {
    if (!this.table) return 0;

    try {
      const schema = await this.table.schema();
      const field = schema.fields.find(f => f.name === column);
      if (!field) {
        log.info('📐 [MemoryStore] 向量列不存在', { column });
        return 0;
      }

      // LanceDB 向量类型是固定大小列表
      // 尝试从数据中获取实际维度
      // 注意：空数组 [] 不是 NULL，所以需要检查数组长度
      const results = await this.table
        .query()
        .where(`${column} IS NOT NULL`)
        .limit(10)  // 检查多条记录，避免恰好第一条是空数组
        .toArray();

      // 查找第一个非空数组的记录
      // 注意：LanceDB 返回的可能是 FixedSizeList 类型，不是普通数组
      for (const result of results) {
        const value = result[column];
        if (!value) continue;
        
        let dim = 0;
        if (Array.isArray(value)) {
          dim = value.length;
        } else if (typeof value === 'object') {
          // FixedSizeList 类型有 length 属性或 toArray 方法
          if ('length' in value && typeof (value as { length: number }).length === 'number') {
            dim = (value as { length: number }).length;
          } else if ('toArray' in value && typeof (value as { toArray: () => unknown }).toArray === 'function') {
            const arr = (value as { toArray: () => number[] }).toArray();
            dim = arr.length;
          }
        }
        
        if (dim > 0) {
          log.info('📐 [MemoryStore] 检测到向量维度', { column, dimension: dim, valueType: typeof value });
          return dim;
        }
      }

      log.info('📐 [MemoryStore] 向量列无有效数据（可能都是空数组）', { column, checkedRecords: results.length });
      return 0;
    } catch (error) {
      log.warn('📐 [MemoryStore] 获取向量维度失败', { column, error: String(error) });
      return 0;
    }
  }

  /**
   * 获取向量列的维度
   * 
   * @param column 向量列名
   * @returns 向量维度，如果列不存在返回 0
   */
  async getVectorDimension(column: string): Promise<number> {
    await this.ensureInitialized();
    return this.getVectorDimensionWithoutInit(column);
  }

  /**
   * 标准化向量列：将 FixedSizeList 转换为普通数组
   * 
   * 解决 LanceDB 的已知问题：
   * - 当从表中查询数据时，向量列是 FixedSizeList 类型
   * - FixedSizeList 内部包含 isValid 元数据字段
   * - 创建新表时 schema 不包含 isValid 字段
   * - 导致 "Found field not in schema: xxx.isValid" 错误
   * 
   * 参考：https://github.com/lancedb/lancedb/issues/2134
   * 
   * @param records 原始记录列表
   * @param vectorColumns 向量列信息（dimension 可选），如果为空则自动检测
   * @returns 标准化后的记录列表
   */
  private normalizeVectorColumns(
    records: LanceDBRecord[],
    vectorColumns?: { name: string; dimension?: number }[]
  ): LanceDBRecord[] {
    return records.map(record => {
      // 创建一个全新的纯 JavaScript 对象，避免任何 Arrow 类型残留
      const normalized: Record<string, unknown> = {};
      
      // 如果没有指定向量列或指定了空数组，自动检测所有以 vector_ 开头的列
      const specifiedColumns = vectorColumns?.map(c => c.name);
      const columnsToProcess = (specifiedColumns && specifiedColumns.length > 0)
        ? specifiedColumns
        : Object.keys(record).filter(key => key.startsWith('vector_'));
      
      // 复制所有字段，特别处理向量列
      for (const [key, value] of Object.entries(record)) {
        if (columnsToProcess.includes(key) && value && typeof value === 'object') {
          // 处理向量列
          if (Array.isArray(value)) {
            // 已经是数组，创建新数组副本
            normalized[key] = [...value];
          } else if ('toArray' in value && typeof (value as { toArray: () => unknown }).toArray === 'function') {
            // FixedSizeList 类型，调用 toArray() 转换
            normalized[key] = [...(value as { toArray: () => number[] }).toArray()];
          } else if (Symbol.iterator in Object(value)) {
            // 可迭代对象，转换为数组
            normalized[key] = [...Array.from(value as Iterable<unknown>)];
          } else if ('length' in value && typeof (value as { length: unknown }).length === 'number') {
            // 有 length 属性的对象，尝试转换为数组
            const len = (value as { length: number }).length;
            const arr = new Array(len);
            for (let i = 0; i < len; i++) {
              arr[i] = (value as Record<number, unknown>)[i];
            }
            normalized[key] = arr;
          } else {
            // 无法识别的类型，保持原值
            normalized[key] = value;
          }
        } else {
          // 非向量列，直接复制
          normalized[key] = value;
        }
      }
      
      return normalized;
    });
  }

  /**
   * 列出所有已存储向量的嵌入模型
   * 
   * @returns 嵌入模型信息列表
   */
  async listEmbedModels(): Promise<EmbedModelInfo[]> {
    await this.ensureInitialized();
    if (!this.table) return [];

    const columns = await this.getExistingVectorColumns();
    const models: EmbedModelInfo[] = [];

    for (const column of columns) {
      const modelId = MemoryStore.vectorColumnToModelId(column);
      const dimension = await this.getVectorDimension(column);
      
      // 统计使用此模型的记录数
      const count = await this.table
        .query()
        .where(`${column} IS NOT NULL`)
        .toArray()
        .then(r => r.length);

      models.push({
        modelId,
        vectorColumn: column,
        dimension,
        recordCount: count,
      });
    }

    return models;
  }

  // ========== 模型切换与迁移 ==========

  /**
   * 切换嵌入模型
   * 
   * @param newModel 新模型 ID
   * @param autoMigrate 是否自动启动迁移
   * @returns 切换结果
   */
  async switchModel(newModel: string, autoMigrate?: boolean): Promise<{
    success: boolean;
    hasExistingVectors: boolean;
    migrationStarted?: boolean;
    message: string;
  }> {
    await this.ensureInitialized();

    const oldModel = this.config.embedModel;
    if (oldModel === newModel) {
      return {
        success: true,
        hasExistingVectors: true,
        message: '模型未变更',
      };
    }

    // 检查新模型是否有向量
    const hasVectors = await this.hasVectorColumn(newModel);

    // 更新配置
    this.config.embedModel = newModel;

    log.info('🔄 [MemoryStore] 切换嵌入模型', { oldModel, newModel, hasVectors });

    // 如果没有向量且启用自动迁移，启动后台迁移
    if (!hasVectors && (autoMigrate ?? this.config.multiEmbed?.autoMigrate)) {
      // 迁移逻辑需要通过外部调用 migrateToModel
      return {
        success: true,
        hasExistingVectors: false,
        migrationStarted: true,
        message: `已切换到 ${newModel}，向量迁移需要单独启动`,
      };
    }

    return {
      success: true,
      hasExistingVectors: hasVectors,
      message: hasVectors 
        ? `已切换到 ${newModel}，可使用已有向量`
        : `已切换到 ${newModel}，需要迁移向量或使用全文检索`,
    };
  }

  /**
   * 检测模型变更
   * 
   * @returns 模型变更信息
   */
  async detectModelChange(): Promise<{
    needMigration: boolean;
    oldModel?: string;
    newModel: string;
    hasOldModelVectors: boolean;
  }> {
    await this.ensureInitialized();

    const newModel = this.config.embedModel;
    if (!newModel) {
      return {
        needMigration: false,
        newModel: '',
        hasOldModelVectors: false,
      };
    }

    // 查询表中记录的模型
    const results = await this.table?.query().limit(1).toArray();
    const recordedModel = results?.[0]?.active_embed as string | undefined;

    // 如果没有记录或没有记录模型，检查是否有旧版向量
    if (!recordedModel) {
      const columns = await this.getExistingVectorColumns();
      const hasLegacyVector = columns.includes('vector' as VectorColumnName) || columns.length > 0;
      
      return {
        needMigration: hasLegacyVector && !await this.hasVectorColumn(newModel),
        oldModel: undefined,
        newModel,
        hasOldModelVectors: hasLegacyVector,
      };
    }

    // 比较模型
    const needMigration = recordedModel !== newModel;
    const hasOldModelVectors = recordedModel ? await this.hasVectorColumn(recordedModel) : false;

    return {
      needMigration,
      oldModel: recordedModel,
      newModel,
      hasOldModelVectors,
    };
  }

  /**
   * 获取或创建迁移器实例
   */
  private migrationInstance: InstanceType<typeof import('./migration').EmbeddingMigration> | null = null;

  /**
   * 获取迁移状态
   */
  async getMigrationStatus(): Promise<import('./types').MigrationStatus> {
    if (!this.migrationInstance) {
      return {
        status: 'idle',
        progress: 0,
        migratedCount: 0,
        totalRecords: 0,
        failedCount: 0,
      };
    }
    return this.migrationInstance.getStatus();
  }

  /**
   * 启动迁移到指定模型
   * @param targetModel 目标嵌入模型 ID
   * @param options 迁移选项
   */
  async migrateToModel(
    targetModel: string,
    options?: { autoStart?: boolean }
  ): Promise<import('./types').MigrationResult> {
    const { EmbeddingMigration } = await import('./migration');
    
    // 检查嵌入服务是否可用
    if (!this.config.embeddingService) {
      return {
        success: false,
        error: '嵌入服务不可用',
      };
    }
    
    // 检查是否已有迁移在进行
    const currentStatus = await this.getMigrationStatus();
    if (currentStatus.status === 'running') {
      return {
        success: false,
        error: '已有迁移任务在进行中',
        status: currentStatus,
      };
    }

    // 创建迁移实例
    const memoryDir = this.expandPath(this.config.storagePath);
    this.migrationInstance = new EmbeddingMigration(
      this,
      this.config.embeddingService,
      memoryDir
    );

    // 设置事件监听器
    this.setupMigrationEventListeners();

    // 启动迁移
    if (options?.autoStart !== false) {
      await this.migrationInstance.start(targetModel);
    }

    return {
      success: true,
      status: await this.migrationInstance.getStatus(),
    };
  }

  /**
   * 设置迁移事件监听器
   */
  private setupMigrationEventListeners(): void {
    if (!this.migrationInstance) return;

    // 记录迁移事件日志
    const events = ['start', 'progress', 'complete', 'error', 'paused', 'resumed', 'record_failed'] as const;
    
    for (const eventType of events) {
      this.migrationInstance.on(`migration:${eventType}`, (data: unknown) => {
        log.info(`🔄 [MemoryStore] 迁移事件: migration:${eventType}`, data as Record<string, unknown>);
      });
    }
  }

  /**
   * 重试失败的迁移记录
   * @param recordIds 可选，指定要重试的记录 ID。不传则重试所有失败记录
   */
  async retryMigration(recordIds?: string[]): Promise<import('./types').RetryResult> {
    if (!this.migrationInstance) {
      return {
        retried: 0,
        succeeded: 0,
        failed: 0,
        remainingFailed: [],
      };
    }

    return this.migrationInstance.retryFailed(recordIds);
  }

  /**
   * 暂停当前迁移
   */
  async pauseMigration(): Promise<void> {
    if (this.migrationInstance) {
      await this.migrationInstance.pause();
    }
  }

  /**
   * 继续暂停的迁移
   */
  async resumeMigration(): Promise<void> {
    if (this.migrationInstance) {
      await this.migrationInstance.resume();
    }
  }

  // ========== 向量清理 ==========

  /**
   * 清理旧的向量列
   * @param keepModels 保留的模型数量（默认从配置读取）
   */
  async cleanupOldVectors(keepModels?: number): Promise<{
    cleanedModels: string[];
    keptModels: string[];
    error?: string;
  }> {
    if (!this.table) {
      return { cleanedModels: [], keptModels: [], error: '表未初始化' };
    }

    const maxModels = keepModels ?? this.config.multiEmbed?.maxModels ?? 3;
    const activeModel = this.config.embedModel;
    const migrationStatus = await this.getMigrationStatus();
    
    // 获取所有向量列
    const allVectorColumns = await this.getExistingVectorColumns();
    const allModels = allVectorColumns.map(col => MemoryStore.vectorColumnToModelId(col));

    // 确定要保留的模型
    const modelsToKeep: string[] = [];
    
    // 1. 当前激活的模型必须保留
    if (activeModel && allModels.includes(activeModel)) {
      modelsToKeep.push(activeModel);
    }
    
    // 2. 正在迁移的目标模型必须保留
    if (migrationStatus.status === 'running' && migrationStatus.targetModel) {
      if (!modelsToKeep.includes(migrationStatus.targetModel)) {
        modelsToKeep.push(migrationStatus.targetModel);
      }
    }
    
    // 3. 按最近使用时间填充剩余位置
    // TODO: 需要记录每个模型向量的最后使用时间
    // 目前简单地按列表顺序保留
    for (const model of allModels) {
      if (modelsToKeep.length >= maxModels) break;
      if (!modelsToKeep.includes(model)) {
        modelsToKeep.push(model);
      }
    }

    // 确定要清理的模型
    const modelsToClean = allModels.filter(m => !modelsToKeep.includes(m));

    if (modelsToClean.length === 0) {
      log.info('🧹 [MemoryStore] 无需清理向量列');
      return { cleanedModels: [], keptModels: modelsToKeep };
    }

    // 执行清理（注意：LanceDB 不支持直接删除列，只能创建新表）
    // 这里我们标记列为待清理，实际删除在下次表重建时执行
    log.info('🧹 [MemoryStore] 标记待清理的向量列', { 
      modelsToClean,
      modelsToKeep,
    });

    // 记录清理日志
    for (const model of modelsToClean) {
      const column = MemoryStore.modelIdToVectorColumn(model);
      log.info('🧹 [MemoryStore] 清理向量列', { model, column });
      
      // 由于 LanceDB 不支持删除列，这里只记录日志
      // 实际的列清理需要通过表重建来实现
      // TODO: 实现表重建逻辑
    }

    return {
      cleanedModels: modelsToClean,
      keptModels: modelsToKeep,
    };
  }

  /**
   * 检查并执行自动清理
   * 在存储新向量后调用
   */
  private async checkAndCleanup(): Promise<void> {
    const multiEmbed = this.config.multiEmbed;
    if (!multiEmbed?.enabled) return;

    const allVectorColumns = await this.getExistingVectorColumns();
    const maxModels = multiEmbed.maxModels ?? 3;

    if (allVectorColumns.length > maxModels) {
      log.info('🧹 [MemoryStore] 检测到超出最大模型数，触发自动清理', {
        current: allVectorColumns.length,
        max: maxModels,
      });
      
      await this.cleanupOldVectors(maxModels);
    }
  }
}
