/**
 * 检索类型定义
 */

import type { MemoryEntry, MemoryFilter, SearchOptions } from '../../types';

/** 检索模式类型 */
export type SearchMode = 'vector' | 'fulltext' | 'hybrid' | 'migration-hybrid' | 'unknown';

/** 检索选项扩展 */
export interface MemorySearchOptions extends SearchOptions {
  /** 目标模型 ID */
  model?: string;
}

/** 检索结果项（带分数） */
export interface ScoredMemoryEntry extends MemoryEntry {
  /** 相似度分数 */
  score: number;
}

/** 检索结果 */
export interface SearchResult {
  /** 记忆条目 */
  entries: MemoryEntry[];
  /** 使用的检索模式 */
  mode: SearchMode;
  /** 检索耗时（毫秒） */
  elapsed: number;
}

/** 双层检索配置 */
export interface DualLayerConfig {
  /** 返回结果数 */
  limit: number;
  /** 向量候选数 */
  candidates: number;
  /** 过滤条件 */
  filter?: MemoryFilter;
  /** 模型 ID */
  modelId?: string;
}

/** 关键词评分结果 */
export interface KeywordScoredEntry {
  entry: MemoryEntry;
  vectorScore: number;
  keywordScore: number;
  finalScore: number;
}
