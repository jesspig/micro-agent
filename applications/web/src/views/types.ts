/**
 * 前端视图类型定义
 */

/** 消息角色 */
export type MessageRole = 'user' | 'assistant' | 'system';

/** 聊天消息 */
export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
}

/** 会话 */
export interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
}

/** 设置 */
export interface AppSettings {
  chatModel: string;
  visionModel?: string;
  coderModel?: string;
  memoryEnabled: boolean;
  maxHistoryMessages: number;
}