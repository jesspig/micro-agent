/**
 * 记忆系统类型定义
 */

// 从父模块重新导出
export type {
  MemoryEntryType,
  MemoryMetadata,
  MemoryEntry,
  Summary,
  MemoryStats,
  MemoryFilter,
  SearchOptions,
} from '../types';

/** 记忆存储配置 */
export interface MemoryStoreConfig {
  /** 存储路径 */
  storagePath: string;
  /** 嵌入服务实例 */
  embeddingService?: EmbeddingService;
  /** 默认检索数量限制 */
  defaultSearchLimit?: number;
  /** 最大检索数量限制 */
  maxSearchLimit?: number;
  /** 短期记忆保留天数 */
  shortTermRetentionDays?: number;
}

/** 清理结果 */
export interface CleanupResult {
  /** 删除条目数 */
  deletedCount: number;
  /** 摘要条目数 */
  summarizedCount: number;
  /** 错误列表 */
  errors: string[];
}

/** 嵌入服务接口 */
export interface EmbeddingService {
  /** 检查服务是否可用 */
  isAvailable(): boolean;
  /** 生成单个文本的嵌入向量 */
  embed(text: string): Promise<number[]>;
  /** 批量生成嵌入向量 */
  embedBatch(texts: string[]): Promise<number[][]>;
}
