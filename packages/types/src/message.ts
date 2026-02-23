/**
 * 消息类型定义
 */

import type { ChannelType } from './interfaces';
import type { ContentPart, ToolCall } from './tool';

/** 消息角色 */
export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

/** 入站消息（从通道接收） */
export interface InboundMessage {
  /** 通道类型 */
  channel: ChannelType;
  /** 发送者 ID */
  senderId: string;
  /** 聊天 ID */
  chatId: string;
  /** 消息内容 */
  content: string;
  /** 时间戳 */
  timestamp: Date;
  /** 媒体文件 */
  media: string[];
  /** 元数据 */
  metadata: Record<string, unknown>;
  /** 当前工作目录（用于目录级配置查找） */
  currentDir?: string;
}

/** 出站消息（发送到通道） */
export interface OutboundMessage {
  /** 通道类型 */
  channel: ChannelType;
  /** 聊天 ID */
  chatId: string;
  /** 消息内容 */
  content: string;
  /** 回复消息 ID */
  replyTo?: string;
  /** 媒体文件 */
  media: string[];
  /** 元数据 */
  metadata: Record<string, unknown>;
  /** 广播目标通道（可选） */
  targetChannels?: Array<{ channel: ChannelType; chatId: string }>;
}

/** 会话键 */
export type SessionKey = `${string}:${string}`;

/** 消息内容类型（支持纯文本或多模态数组） */
export type MessageContent = string | ContentPart[];

/** LLM 消息格式 */
export interface LLMMessage {
  /** 角色 */
  role: MessageRole;
  /** 内容（支持纯文本或多模态数组） */
  content: MessageContent;
  /** 工具调用 ID（role=tool 时） */
  toolCallId?: string;
  /** 工具调用列表（role=assistant 时） */
  toolCalls?: ToolCall[];
}

/** LLM 响应格式 */
export interface LLMResponse {
  /** 文本内容 */
  content: string;
  /** 工具调用列表 */
  toolCalls?: ToolCall[];
  /** 是否包含工具调用 */
  hasToolCalls: boolean;
  /** 实际使用的 Provider 名称 */
  usedProvider?: string;
  /** 实际使用的模型 ID */
  usedModel?: string;
}
