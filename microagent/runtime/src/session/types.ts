/**
 * Session 类型定义
 *
 * 定义会话管理相关的类型
 */

import type { Message, SessionMetadata } from "../types.js";

/**
 * Session 配置
 */
export interface SessionConfig {
  /** Session 标识 */
  sessionKey: string;
  /** 最大消息数量 */
  maxMessages: number;
  /** 是否自动保存 */
  autoSave: boolean;
  /** 持久化路径 */
  persistPath?: string;
}

/**
 * Session 状态
 */
export interface SessionState {
  /** 消息数量 */
  messageCount: number;
  /** 总 token 数 */
  totalTokens: number;
  /** 最后活动时间 */
  lastActivity: number;
}

/**
 * Session 快照
 */
export interface SessionSnapshot {
  /** 元数据 */
  metadata: SessionMetadata;
  /** 消息列表 */
  messages: Message[];
  /** 状态 */
  state: SessionState;
}
