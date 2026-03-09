/**
 * 向量存储适配器
 *
 * 支持多维度向量存储，按模型 ID 索引。
 * 提供向量 CRUD、检索和迁移支持。
 */

import * as lancedb from '@lancedb/lancedb';
import { mkdir } from 'fs/promises';
import { join } from 'path';
import { getLogger } from '@logtape/logtape';
import { z } from 'zod';
import type { EmbeddingVector, VectorSearchOptions } from '../../../../types/embedding';

const log = getLogger(['memory', 'embedding', 'vector-adapter']);

/** 向量记录结构 */
interface VectorRecord {
  /** 向量 ID */
  id: string;
  /** 关联记忆 ID */
  memoryId: string;
  /** 模型 ID */
  modelId: string;
  /** 向量数据 */
  vector: number[];
  /** 向量维度 */
  dimension: number;
  /** 是否活跃 */
  isActive: boolean;
  /** 创建时间戳 */
  createdAt: number;
  /** 索引签名（兼容 LanceDB） */
  [key: string]: unknown;
}

/** 向量适配器配置 Schema */
export const VectorAdapterConfigSchema = z.object({
  /** 存储路径 */
  storagePath: z.string(),
  /** 表名 */
  tableName: z.string().optional().default('vectors'),
  /** 默认检索数量 */
  defaultLimit: z.number().int().positive().optional().default(10),
  /** 最大检索数量 */
  maxLimit: z.number().int().positive().optional().default(100),
});

/** 向量适配器配置 */
export type VectorAdapterConfig = z.infer<typeof VectorAdapterConfigSchema>;

/** 向量存储结果 */
export interface VectorStoreResult {
  success: boolean;
  id: string;
  error?: string;
}

/** 批量存储结果 */
export interface BatchStoreResult {
  success: boolean;
  ids: string[];
  errors: Array<{ index: number; error: string }>;
}

/**
 * 创建向量记录
 */
function createVectorRecord(
  id: string,
  memoryId: string,
  modelId: string,
  vector: number[],
  isActive: boolean = true
): Record<string, unknown> {
  return {
    id,
    memoryId,
    modelId,
    vector,
    dimension: vector.length,
    // 使用整数代替布尔值以避免 LanceDB 的保留字问题
    activeStatus: isActive ? 1 : 0,
    createdAt: Date.now(),
  };
}

/**
 * 将数据库记录转换为 EmbeddingVector
 */
function recordToVector(record: Record<string, unknown>): EmbeddingVector {
  return {
    id: record.id as string,
    memoryId: record.memoryId as string,
    modelId: record.modelId as string,
    vector: record.vector as number[],
    dimension: record.dimension as number,
    // 从整数转换回布尔值
    isActive: (record.activeStatus as number) === 1,
    createdAt: new Date(record.createdAt as number),
  };
}

/**
 * 向量存储适配器
 *
 * 职责：
 * - 多维度向量存储
 * - 按模型 ID 索引
 * - 向量检索
 * - 迁移支持
 */
export class VectorAdapter {
  private db: lancedb.Connection | null = null;
  private table: lancedb.Table | null = null;
  private config: VectorAdapterConfig;
  private initialized = false;
  private tableDimension: number | null = null;

  constructor(config: VectorAdapterConfig) {
    const parsed = VectorAdapterConfigSchema.parse(config);
    this.config = parsed;
  }

  /**
   * 初始化适配器
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // 扩展存储路径
    const storagePath = this.expandPath(this.config.storagePath);
    const dbPath = join(storagePath, 'lancedb');

    // 确保目录存在
    await mkdir(dbPath, { recursive: true });

    // 连接数据库
    this.db = await lancedb.connect(dbPath);

    // 创建或打开表
    const tableName = this.config.tableName;
    const tables = await this.db.tableNames();

    if (tables.includes(tableName)) {
      this.table = await this.db.openTable(tableName);
      // 检测表的向量维度
      const sample = await this.table?.query().limit(1).toArray();
      if (sample && sample.length > 0) {
        this.tableDimension = (sample[0].vector as number[])?.length ?? null;
      }
    }
    // 不预先创建表，而是在第一次存储向量时创建
    // 这样可以支持任意维度的向量

    this.initialized = true;
    const count = await this.table?.countRows() ?? 0;
    log.info('向量适配器已初始化', { path: dbPath, table: tableName, existingVectors: count, dimension: this.tableDimension });
  }

  /**
   * 存储向量
   */
  async store(
    memoryId: string,
    modelId: string,
    vector: number[]
  ): Promise<VectorStoreResult> {
    await this.ensureInitialized();

    const id = crypto.randomUUID();
    const record = createVectorRecord(id, memoryId, modelId, vector);

    try {
      // 如果表不存在，先创建表
      if (!this.table) {
        await this.createTableWithVector(record);
      } else {
        await this.table.add([record]);
      }
      
      log.debug('向量已存储', { id, memoryId, modelId, dimension: vector.length });

      return { success: true, id };
    } catch (error) {
      log.error('向量存储失败', { memoryId, modelId, error: String(error) });
      return { success: false, id: '', error: String(error) };
    }
  }

  /**
   * 创建表并存储第一条向量
   */
  private async createTableWithVector(record: Record<string, unknown>): Promise<void> {
    if (!this.db) {
      throw new Error('数据库未连接');
    }

    const tableName = this.config.tableName;
    this.table = await this.db.createTable(tableName, [record]);
    this.tableDimension = (record.vector as number[]).length;
    
    log.info('向量表已创建', { tableName, dimension: this.tableDimension });
  }

  /**
   * 批量存储向量
   */
  async storeBatch(
    items: Array<{ memoryId: string; modelId: string; vector: number[] }>
  ): Promise<BatchStoreResult> {
    await this.ensureInitialized();

    if (items.length === 0) {
      return { success: true, ids: [], errors: [] };
    }

    const ids: string[] = [];
    const errors: Array<{ index: number; error: string }> = [];
    const records: Record<string, unknown>[] = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      try {
        const id = crypto.randomUUID();
        ids.push(id);
        records.push(createVectorRecord(id, item.memoryId, item.modelId, item.vector));
      } catch (error) {
        errors.push({ index: i, error: String(error) });
      }
    }

    try {
      // 如果表不存在，先创建表
      if (!this.table && records.length > 0) {
        await this.createTableWithVector(records[0]);
        // createTableWithVector 会设置 this.table
      }

      // 添加所有记录（包括第一条，因为 createTableWithVector 可能已经添加了）
      // 使用非空断言，因为 ensureInitialized 和上面的逻辑确保 table 存在
      if (this.table && records.length > 0) {
        await this.table.add(records);
      }
      
      log.debug('批量向量已存储', { count: records.length });

      return { success: true, ids, errors };
    } catch (error) {
      log.error('批量向量存储失败', { error: String(error) });
      return { success: false, ids: [], errors: [{ index: -1, error: String(error) }] };
    }
  }

  /**
   * 获取向量
   */
  async get(id: string): Promise<EmbeddingVector | undefined> {
    await this.ensureInitialized();

    const results = await this.table
      ?.query()
      .where(`id = "${this.escape(id)}"`)
      .limit(1)
      .toArray();

    if (!results || results.length === 0) {
      return undefined;
    }

    return recordToVector(results[0]);
  }

  /**
   * 按记忆 ID 获取向量
   */
  async getByMemoryId(memoryId: string, modelId?: string): Promise<EmbeddingVector[]> {
    await this.ensureInitialized();

    let query = this.table?.query().where(`memoryId = "${this.escape(memoryId)}"`);

    if (modelId) {
      query = query?.where(`modelId = "${this.escape(modelId)}"`);
    }

    const results = await query?.toArray() ?? [];
    return results.map(r => recordToVector(r));
  }

  /**
   * 按模型 ID 获取所有向量
   */
  async getByModelId(modelId: string, limit?: number): Promise<EmbeddingVector[]> {
    await this.ensureInitialized();

    const results = await this.table
      ?.query()
      .where(`modelId = "${this.escape(modelId)}"`)
      .limit(limit ?? 10000)
      .toArray();

    return results?.map(r => recordToVector(r)) ?? [];
  }

  /**
   * 获取活跃向量
   */
  async getActiveVectors(modelId?: string): Promise<EmbeddingVector[]> {
    await this.ensureInitialized();

    let query = this.table?.query().where('activeStatus = 1');

    if (modelId) {
      query = query?.where(`modelId = "${this.escape(modelId)}"`);
    }

    const results = await query?.limit(10000).toArray();
    return results?.map(r => recordToVector(r)) ?? [];
  }

  /**
   * 向量检索
   */
  async search(options: VectorSearchOptions): Promise<Array<{
    vector: EmbeddingVector;
    score: number;
  }>> {
    await this.ensureInitialized();

    if (!this.table) {
      return [];
    }

    const modelId = options.modelId ?? 'active';
    const limit = options.limit ?? this.config.defaultLimit;

    // 构建查询
    let search = this.table.vectorSearch(options.vector);

    // 过滤模型
    if (modelId !== 'active') {
      search = search.where(`modelId = "${this.escape(modelId)}"`);
    } else {
      search = search.where('activeStatus = 1');
    }

    // 执行检索
    const results = await search.limit(Math.min(limit, this.config.maxLimit)).toArray();

    // 计算相似度分数
    return results.map(r => ({
      vector: recordToVector(r),
      score: 1 - ((r as Record<string, unknown>)._distance as number ?? 0),
    }));
  }

  /**
   * 更新向量活跃状态
   */
  async setActive(id: string, isActive: boolean): Promise<boolean> {
    await this.ensureInitialized();

    if (!this.table) {
      return false;
    }

    // 使用 update 方法更新 activeStatus 字段
    try {
      await this.table.update({
        where: `id = "${this.escape(id)}"`,
        valuesSql: { activeStatus: isActive ? '1' : '0' }
      });
      log.debug('向量活跃状态已更新', { id, isActive });
      return true;
    } catch (error) {
      log.error('更新向量活跃状态失败', { id, error: String(error) });
      return false;
    }
  }

  /**
   * 批量设置活跃状态
   */
  async setBatchActive(ids: string[], isActive: boolean): Promise<number> {
    await this.ensureInitialized();

    if (!this.table || ids.length === 0) {
      return 0;
    }

    const idList = ids.map(id => `"${this.escape(id)}"`).join(', ');

    try {
      await this.table.update({
        where: `id IN (${idList})`,
        valuesSql: { activeStatus: isActive ? '1' : '0' }
      });

      log.debug('批量活跃状态已更新', { count: ids.length, isActive });
      return ids.length;
    } catch (error) {
      log.error('批量更新活跃状态失败', { error: String(error) });
      return 0;
    }
  }

  /**
   * 删除向量
   */
  async delete(id: string): Promise<boolean> {
    await this.ensureInitialized();

    await this.table?.delete(`id = "${this.escape(id)}"`);
    log.debug('向量已删除', { id });
    return true;
  }

  /**
   * 批量删除向量
   */
  async deleteBatch(ids: string[]): Promise<number> {
    await this.ensureInitialized();

    if (ids.length === 0) return 0;

    const idList = ids.map(id => `"${this.escape(id)}"`).join(', ');
    await this.table?.delete(`id IN (${idList})`);

    log.debug('批量向量已删除', { count: ids.length });
    return ids.length;
  }

  /**
   * 按模型 ID 删除所有向量
   */
  async deleteByModelId(modelId: string): Promise<number> {
    await this.ensureInitialized();

    // 先统计数量
    const count = await this.countByModelId(modelId);
    await this.table?.delete(`modelId = "${this.escape(modelId)}"`);

    log.info('模型向量已删除', { modelId, count });
    return count;
  }

  /**
   * 统计向量数量
   */
  async count(): Promise<number> {
    await this.ensureInitialized();
    return this.table?.countRows() ?? 0;
  }

  /**
   * 按模型统计向量数量
   */
  async countByModelId(modelId: string): Promise<number> {
    await this.ensureInitialized();

    const results = await this.table
      ?.query()
      .where(`modelId = "${this.escape(modelId)}"`)
      .toArray();

    return results?.length ?? 0;
  }

  /**
   * 获取所有模型 ID
   */
  async getModelIds(): Promise<string[]> {
    await this.ensureInitialized();

    const results = await this.table?.query().toArray();
    const modelIds = new Set(results?.map(r => r.modelId as string) ?? []);
    return Array.from(modelIds);
  }

  /**
   * 获取模型维度
   */
  async getModelDimension(modelId: string): Promise<number | undefined> {
    await this.ensureInitialized();

    const results = await this.table
      ?.query()
      .where(`modelId = "${this.escape(modelId)}"`)
      .limit(1)
      .toArray();

    return results?.[0]?.dimension as number | undefined;
  }

  /**
   * 关闭适配器
   */
  async close(): Promise<void> {
    this.initialized = false;
    log.info('向量适配器已关闭');
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

  private async getBatch(ids: string[]): Promise<EmbeddingVector[]> {
    if (ids.length === 0) return [];

    const idList = ids.map(id => `"${this.escape(id)}"`).join(', ');
    const results = await this.table
      ?.query()
      .where(`id IN (${idList})`)
      .toArray();

    return results?.map(r => recordToVector(r)) ?? [];
  }
}

/**
 * 创建向量适配器实例
 */
export function createVectorAdapter(config: VectorAdapterConfig): VectorAdapter {
  return new VectorAdapter(config);
}