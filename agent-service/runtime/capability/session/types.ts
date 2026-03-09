/**
 * 会话能力类型定义
 *
 * ========== 模块迁移记录 (完成于 2026-03-09) ==========
 * 状态: 已完成
 * - ContextInjectorConfig → @micro-agent/sdk/session
 * - ContextInjectionResult → @micro-agent/sdk/session
 * - TitleGeneratorConfig → @micro-agent/sdk/session
 * - TitleGenerationResult → @micro-agent/sdk/session
 */

import { z } from 'zod';
import type { SessionKey, SessionState, SessionTag } from '../../../types/session';

/** 会话搜索选项 Schema */
export const SessionSearchOptionsSchema = z.object({
  /** 搜索关键词 */
  query: z.string().min(1),
  /** 搜索字段 */
  fields: z.array(z.enum(['title', 'summary', 'tags', 'content'])).default(['title', 'summary']),
  /** 结果数量限制 */
  limit: z.number().min(1).max(100).default(20),
  /** 偏移量 */
  offset: z.number().min(0).default(0),
  /** 状态过滤 */
  state: z.enum(['active', 'idle', 'closed', 'archived']).optional(),
  /** 最小相关性分数 */
  minScore: z.number().min(0).max(1).default(0.1),
  /** 排序方式 */
  orderBy: z.enum(['relevance', 'createdAt', 'updatedAt']).default('relevance'),
});

/** 会话搜索选项（输入类型，可选字段） */
export type SessionSearchOptionsInput = z.input<typeof SessionSearchOptionsSchema>;

/** 会话搜索选项 */
export type SessionSearchOptions = z.infer<typeof SessionSearchOptionsSchema>;

/** 会话搜索结果项 */
export interface SessionSearchResultItem {
  /** 会话键 */
  sessionKey: SessionKey;
  /** 标题 */
  title: string | null;
  /** 摘要 */
  summary: string | null;
  /** 相关性分数 (BM25) */
  score: number;
  /** 匹配的字段 */
  matchedFields: string[];
  /** 高亮片段 */
  highlights: Array<{
    field: string;
    snippet: string;
  }>;
  /** 状态 */
  state: SessionState;
  /** 创建时间 */
  createdAt: Date;
  /** 更新时间 */
  updatedAt: Date;
}

/** 会话搜索结果 */
export interface SessionSearchResult {
  /** 结果列表 */
  items: SessionSearchResultItem[];
  /** 总数量 */
  total: number;
  /** 是否有更多结果 */
  hasMore: boolean;
  /** 搜索耗时（毫秒） */
  elapsedMs: number;
}

/** 会话搜索器配置 */
export interface SessionSearcherConfig {
  /** 数据库路径 */
  dbPath: string;
  /** 默认搜索限制 */
  defaultLimit: number;
  /** 最大搜索限制 */
  maxLimit: number;
  /** 是否启用高亮 */
  enableHighlight: boolean;
}

/** 会话管理器配置 */
export interface SessionManagerConfig {
  /** 数据库路径 */
  dbPath: string;
  /** 默认分页大小 */
  defaultPageSize: number;
  /** 最大分页大小 */
  maxPageSize: number;
}

/** 会话更新选项 */
export interface SessionUpdateOptions {
  /** 标题 */
  title?: string;
  /** 摘要 */
  summary?: string;
  /** 状态 */
  state?: SessionState;
  /** 是否星标 */
  isStarred?: boolean;
  /** 标签 */
  tags?: SessionTag[];
}