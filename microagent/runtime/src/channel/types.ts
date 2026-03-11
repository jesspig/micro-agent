/**
 * Channel 类型定义
 * 
 * 定义 Channel 模块所需的类型扩展
 */

import type { ChannelConfig as BaseChannelConfig, InboundMessage as BaseInboundMessage } from "../types.js";

// ============================================================================
// Channel 类型
// ============================================================================

/**
 * Channel 类型标识
 */
export type ChannelType = "qq" | "feishu" | "wechat-work" | "dingtalk";

/**
 * 扩展的 Channel 配置
 * 继承基础配置，添加特定字段
 */
export interface ChannelConfig extends BaseChannelConfig {
  /** Channel 唯一标识 */
  id: string;
  /** Channel 类型 */
  type: ChannelType;
  /** 是否启用 */
  enabled: boolean;
  /** Webhook 密钥 */
  webhookSecret?: string;
}

/**
 * Channel 状态
 */
export interface ChannelStatus {
  /** Channel 唯一标识 */
  id: string;
  /** Channel 类型 */
  type: ChannelType;
  /** 是否已连接 */
  connected: boolean;
  /** 最后活动时间 */
  lastActivity?: number;
  /** 最后错误信息 */
  lastError?: string;
  /** 消息计数 */
  messageCount: number;
}

/**
 * 扩展的入站消息
 * 继承基础入站消息，添加目标字段
 */
export interface InboundMessage extends BaseInboundMessage {
  /** 目标标识 */
  to: string;
  /** Channel 标识 */
  channelId: string;
}

// 从 types.ts 重新导出基础类型，便于统一导入
export type { 
  ChannelCapabilities, 
  OutboundMessage, 
  SendResult 
} from "../types.js";
