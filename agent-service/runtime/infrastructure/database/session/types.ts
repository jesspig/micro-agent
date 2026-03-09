/**
 * 会话存储类型定义
 */

import type { ContentPart, SessionKey } from '../../../../types';

// 重导出 SessionKey 以便此模块的使用者可以直接导入
export type { SessionKey };

/** 会话消息 */
export interface SessionMessage {
  /** 角色 */
  role: 'user' | 'assistant' | 'system' | 'tool';
  /** 内容 */
  content: string | ContentPart[];
  /** 时间戳 */
  timestamp: number;
  /** 工具调用 ID（如果是工具消息） */
  tool_call_id?: string;
  /** 工具调用列表 */
  tool_calls?: Array<{
    id: string;
    name: string;
    arguments: Record<string, unknown>;
  }>;
}

/** 会话元数据 */
export interface SessionMetadata {
  /** 会话键 */
  key: SessionKey;
  /** 通道 */
  channel: string;
  /** 聊天 ID */
  chatId: string;
  /** 创建时间 */
  createdAt: Date;
  /** 更新时间 */
  updatedAt: Date;
  /** 最后整合计数 */
  lastConsolidated: number;
}

/** 完整会话 */
export interface Session extends SessionMetadata {
  /** 消息列表 */
  messages: SessionMessage[];
}

/** 会话存储配置 */
export interface SessionStoreConfig {
  /** 会话数据目录 */
  sessionsDir: string;
  /** 最大消息数 */
  maxMessages: number;
  /** 会话超时时间（毫秒） */
  sessionTimeout: number;
}
