/**
 * 消息类型定义
 */

import type { ChannelType } from '@micro-agent/types';

/** 入站消息 */
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
  /** 当前工作目录 */
  currentDir?: string;
}

/** 出站消息 */
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
}

/** 会话键 */
export type SessionKey = `${string}:${string}`;
