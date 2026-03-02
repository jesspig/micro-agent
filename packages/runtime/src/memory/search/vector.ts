/**
 * 向量检索模块
 */

import type { MemoryEntry, MemoryFilter } from '../../types';
import type { MemoryStoreConfig } from '../types';
import type { MemoryStoreCore } from '../core';
import { getLogger } from '@logtape/logtape';

const log = getLogger(['memory', 'search', 'vector']);

/**
 * 向量检索器
 */
export class VectorSearcher {
  private core: MemoryStoreCore;
  private config: MemoryStoreConfig;

  constructor(core: MemoryStoreCore, config: MemoryStoreConfig) {
    this.core = core;
    this.config = config;
  }

  /**
   * 向量检索
   */
  async search(
    query: string,
    limit: number,
    filter?: MemoryFilter,
    modelId?: string
  ): Promise<MemoryEntry[]> {
    // 检查嵌入服务是否可用
    if (!this.config.embeddingService || !this.config.embeddingService.isAvailable()) {
      log.info('🔍 [MemoryStore] 嵌入服务不可用，跳过向量检索');
      return [];
    }

    // 确定使用的模型和向量列
    const targetModel = modelId ?? this.config.embedModel;
    const vectorColumn = targetModel
      ? this.core['getModelVectorColumn'](targetModel)
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

      // 构建过滤条件
      const conditions: string[] = [];

      if (filter?.sessionId) {
        conditions.push(`sessionId = "${this.core['escapeValue'](filter.sessionId)}"`);
      }
      if (filter?.type) {
        const types = Array.isArray(filter.type) ? filter.type : [filter.type];
        const typeConditions = types.map((t) => `type = "${this.core['escapeValue'](t)}"`).join(' OR ');
        conditions.push(`(${typeConditions})`);
      }

      const searchLimit = limit * 2;

      let queryBuilder = this.core.dbTable!.vectorSearch(vector).column(vectorColumn).limit(searchLimit);

      if (conditions.length > 0) {
        const whereClause = conditions.join(' AND ');
        queryBuilder = queryBuilder.where(whereClause);
      }

      log.debug('🔍 [MemoryStore] 执行向量搜索', {
        vectorColumn,
        queryDimension: vector.length,
        filter: conditions.length > 0 ? conditions.join(' AND ') : 'none',
      });

      const rawResults = await queryBuilder.toArray();

      // 过滤掉空向量记录
      const results = rawResults
        .filter((r) => {
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
        })
        .slice(0, limit);

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
        elapsed: `${elapsed}ms`,
      });

      return results.map((r) => this.core['recordToEntry'](r));
    } catch (error) {
      log.warn('⚠️ [MemoryStore] 向量检索失败', { error: String(error) });
      return [];
    }
  }

  /**
   * 检查是否存在指定模型的向量列
   */
  async hasVectorColumn(modelId: string): Promise<boolean> {
    const columns = await this.getExistingVectorColumns();
    const targetColumn = this.core['getModelVectorColumn'](modelId);
    return columns.includes(targetColumn);
  }

  /**
   * 获取所有已存在的向量列名
   */
  private async getExistingVectorColumns(): Promise<string[]> {
    const table = this.core.dbTable;
    if (!table) return [];

    try {
      const schema = await table.schema();
      const vectorColumns: string[] = [];

      for (const field of schema.fields) {
        if (field.name.startsWith('vector_')) {
          vectorColumns.push(field.name);
        }
      }

      return vectorColumns;
    } catch (error) {
      log.error('🚨 [MemoryStore] 获取向量列失败', { error: String(error) });
      return [];
    }
  }

  /**
   * 获取向量列的维度
   */
  private async getVectorDimension(column: string): Promise<number> {
    const table = this.core.dbTable;
    if (!table) return 0;

    try {
      const schema = await table.schema();
      const field = schema.fields.find((f) => f.name === column);
      if (!field) return 0;

      const results = await table.query().where(`${column} IS NOT NULL`).limit(10).toArray();

      for (const result of results) {
        const value = result[column];
        if (!value) continue;

        let dim = 0;
        if (Array.isArray(value)) {
          dim = value.length;
        } else if (typeof value === 'object') {
          if ('length' in value && typeof (value as { length: number }).length === 'number') {
            dim = (value as { length: number }).length;
          } else if (
            'toArray' in value &&
            typeof (value as { toArray: () => unknown }).toArray === 'function'
          ) {
            const arr = (value as { toArray: () => number[] }).toArray();
            dim = arr.length;
          }
        }

        if (dim > 0) return dim;
      }

      return 0;
    } catch (error) {
      log.warn('📐 [MemoryStore] 获取向量维度失败', { column, error: String(error) });
      return 0;
    }
  }
}
