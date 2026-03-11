/**
 * Channel 接口契约定义
 * 
 * 扩展 IChannel 接口，定义 Channel 模块的核心契约
 */

import type { IChannel } from "../contracts.js";
import type { ChannelCapabilities } from "../types.js";
import type { 
  ChannelType,
  ChannelConfig, 
  ChannelStatus, 
  InboundMessage
} from "./types.js";

// ============================================================================
// 消息处理器类型
// ============================================================================

/**
 * 消息处理器类型
 * 处理入站消息的回调函数
 */
export type MessageHandler = (message: InboundMessage) => void | Promise<void>;

// ============================================================================
// Channel 扩展接口
// ============================================================================

/**
 * IChannel 扩展接口
 * 
 * 在 IChannel 基础上扩展类型信息和状态管理能力。
 * 具体 Channel 实现应继承 BaseChannel 或实现此接口。
 */
export interface IChannelExtended extends IChannel {
  /** Channel 类型标识 */
  readonly type: ChannelType;
  /** Channel 完整配置 */
  readonly config: ChannelConfig;
  /** Channel 能力标识 */
  readonly capabilities: ChannelCapabilities;

  /**
   * 获取 Channel 当前状态
   * @returns 状态快照
   */
  getStatus(): ChannelStatus;

  /**
   * 注册消息处理器
   * @param handler - 消息处理函数
   */
  onMessage(handler: MessageHandler): void;

  /**
   * 移除消息处理器
   * @param handler - 消息处理函数
   */
  offMessage(handler: MessageHandler): void;
}

/**
 * Channel 类型联合
 */
export type { ChannelType } from "./types.js";
