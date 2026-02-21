/**
 * 会话存储类型定义
 */

import type { SessionKey, ContentPart } from '@microbot/types';

/** 会话消息 */
export interface SessionMessage {
  role: 'user' | 'assistant' | 'system';
  content: string | ContentPart[];
  timestamp: number;
  /** 工具调用（可选） */
  tool_calls?: unknown;
  /** 工具调用 ID（可选） */
  tool_call_id?: string;
  /** 工具名称（可选） */
  name?: string;
}

/** 会话元数据 */
export interface SessionMetadata {
  _type: 'metadata';
  channel: string;
  chatId: string;
  createdAt: string;
  updatedAt: string;
  /** 已整合的消息数量 */
  lastConsolidated: number;
}

/** 会话数据 */
export interface Session {
  key: SessionKey;
  channel: string;
  chatId: string;
  messages: SessionMessage[];
  createdAt: Date;
  updatedAt: Date;
  lastConsolidated: number;
}

/** 会话存储配置 */
export interface SessionStoreConfig {
  /** 会话目录 */
  sessionsDir: string;
  /** 最大消息数 */
  maxMessages: number;
  /** 会话超时时间（毫秒），超过此时间创建新会话 */
  sessionTimeout: number;
}
