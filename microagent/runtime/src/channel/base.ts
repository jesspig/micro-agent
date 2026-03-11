/**
 * Channel 抽象基类
 * 
 * 提供 Channel 的通用实现逻辑，具体实现继承此类
 */

import type { ChannelCapabilities } from "../types.js";
import type { 
  IChannelExtended, 
  MessageHandler, 
  ChannelType 
} from "./contract.js";
import type { 
  ChannelConfig, 
  ChannelStatus, 
  InboundMessage, 
  OutboundMessage, 
  SendResult 
} from "./types.js";

// ============================================================================
// Channel 抽象基类
// ============================================================================

/**
 * Channel 抽象基类
 * 
 * 封装消息处理、状态管理等通用逻辑。
 * 具体 Channel 实现需实现 start、stop、send 方法。
 */
export abstract class BaseChannel implements IChannelExtended {
  /** Channel 唯一标识 */
  abstract readonly id: string;
  
  /** Channel 类型标识 */
  abstract readonly type: ChannelType;
  
  /** Channel 完整配置 */
  abstract readonly config: ChannelConfig;
  
  /** Channel 能力标识 */
  abstract readonly capabilities: ChannelCapabilities;

  /** 消息处理器集合 */
  protected messageHandlers = new Set<MessageHandler>();
  
  /** 内部状态 */
  protected status: ChannelStatus;

  /**
   * 构造函数
   * @param config - Channel 配置
   */
  constructor(config: ChannelConfig) {
    this.status = {
      id: config.id,
      type: config.type,
      connected: false,
      messageCount: 0,
    };
  }

  // ============================================================================
  // 抽象方法（由子类实现）
  // ============================================================================

  /**
   * 启动 Channel
   * @param config - Channel 配置
   */
  abstract start(config: ChannelConfig): Promise<void>;

  /**
   * 停止 Channel
   */
  abstract stop(): Promise<void>;

  /**
   * 发送消息
   * @param message - 出站消息
   * @returns 发送结果
   */
  abstract send(message: OutboundMessage): Promise<SendResult>;

  // ============================================================================
  // 消息处理
  // ============================================================================

  /**
   * 注册消息处理器
   * @param handler - 消息处理函数
   */
  onMessage(handler: MessageHandler): void {
    this.messageHandlers.add(handler);
  }

  /**
   * 移除消息处理器
   * @param handler - 消息处理函数
   */
  offMessage(handler: MessageHandler): void {
    this.messageHandlers.delete(handler);
  }

  /**
   * 触发消息事件
   * 调用所有已注册的处理器，并更新状态
   * @param message - 入站消息
   */
  protected emitMessage(message: InboundMessage): void {
    for (const handler of this.messageHandlers) {
      try {
        handler(message);
      } catch (error) {
        console.error(`[Channel:${this.id}] 消息处理器错误:`, error);
      }
    }
    this.status.messageCount++;
    this.status.lastActivity = Date.now();
  }

  // ============================================================================
  // 状态管理
  // ============================================================================

  /**
   * 获取当前状态快照
   * @returns 状态快照
   */
  getStatus(): ChannelStatus {
    return { ...this.status };
  }

  /**
   * 更新连接状态
   * @param connected - 是否已连接
   * @param error - 可选错误信息
   */
  protected setConnected(connected: boolean, error?: string): void {
    this.status.connected = connected;
    if (error) {
      this.status.lastError = error;
    }
  }
}
