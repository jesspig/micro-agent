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
import { 
  channelLogger, 
  createTimer, 
  logMethodCall, 
  logMethodReturn, 
  logMethodError 
} from "../../applications/shared/logger.js";

const logger = channelLogger();

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
    const timer = createTimer();
    logMethodCall(logger, { 
      method: "constructor", 
      module: "BaseChannel",
      params: { id: config.id, type: config.type }
    });
    
    this.status = {
      id: config.id,
      type: config.type,
      connected: false,
      messageCount: 0,
    };
    
    logger.info("Channel 基类初始化", { 
      id: config.id, 
      type: config.type 
    });
    
    logMethodReturn(logger, { 
      method: "constructor", 
      module: "BaseChannel",
      duration: timer() 
    });
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

  /**
   * 更新已有消息（用于流式输出）
   * 默认实现：返回不支持更新的错误，子类可重写
   * @param _messageId - 消息 ID
   * @param _text - 新消息内容
   * @param _format - 消息格式
   * @returns 发送结果
   */
  async updateMessage(_messageId: string, _text: string, _format?: "text" | "markdown"): Promise<SendResult> {
    const timer = createTimer();
    
    logMethodCall(logger, { 
      method: "updateMessage", 
      module: "BaseChannel",
      params: { messageId: _messageId, format: _format }
    });
    
    const result: SendResult = { success: false, error: "当前 Channel 不支持消息更新" };
    
    logger.warn("消息更新不支持", { 
      messageId: _messageId,
      channelId: this.id 
    });
    
    logMethodReturn(logger, { 
      method: "updateMessage", 
      module: "BaseChannel",
      result: { success: false, error: result.error },
      duration: timer() 
    });
    
    return result;
  }

  // ============================================================================
  // 消息处理
  // ============================================================================

  /**
   * 注册消息处理器
   * @param handler - 消息处理函数
   */
  onMessage(handler: MessageHandler): void {
    const timer = createTimer();
    logMethodCall(logger, { 
      method: "onMessage", 
      module: "BaseChannel",
      params: { channelId: this.id, handlerCount: this.messageHandlers.size }
    });
    
    this.messageHandlers.add(handler);
    
    logger.info("消息处理器已注册", { 
      channelId: this.id,
      totalHandlers: this.messageHandlers.size 
    });
    
    logMethodReturn(logger, { 
      method: "onMessage", 
      module: "BaseChannel",
      duration: timer() 
    });
  }

  /**
   * 移除消息处理器
   * @param handler - 消息处理函数
   */
  offMessage(handler: MessageHandler): void {
    const timer = createTimer();
    logMethodCall(logger, { 
      method: "offMessage", 
      module: "BaseChannel",
      params: { channelId: this.id }
    });
    
    const beforeCount = this.messageHandlers.size;
    this.messageHandlers.delete(handler);
    const afterCount = this.messageHandlers.size;
    
    logger.info("消息处理器已移除", { 
      channelId: this.id,
      beforeCount,
      afterCount 
    });
    
    logMethodReturn(logger, { 
      method: "offMessage", 
      module: "BaseChannel",
      duration: timer() 
    });
  }

  /**
   * 触发消息事件
   * 调用所有已注册的处理器，并更新状态
   * @param message - 入站消息
   */
  protected emitMessage(message: InboundMessage): void {
    const timer = createTimer();
    
    // 截断消息内容用于日志
    const truncateForLog = (text: string, maxLen = 500): string => {
      if (!text) return "";
      return text.length > maxLen ? text.substring(0, maxLen) + "...(truncated)" : text;
    };
    
    logger.info("触发消息事件", { 
      channelId: this.id,
      handlerCount: this.messageHandlers.size,
      from: message.from,
      to: message.to,
      content: truncateForLog(message.text)
    });
    
    let successCount = 0;
    let errorCount = 0;
    
    for (const handler of this.messageHandlers) {
      try {
        // 处理 async handler，捕获 Promise rejection
        const result = handler(message);
        if (result instanceof Promise) {
          result.catch((error) => {
            errorCount++;
            const err = error instanceof Error ? error : new Error(String(error));
            logger.error("消息处理器异步执行失败", {
              channelId: this.id,
              error: { name: err.name, message: err.message, stack: err.stack }
            });
          });
        }
        successCount++;
      } catch (error) {
        errorCount++;
        const err = error instanceof Error ? error : new Error(String(error));
        logMethodError(logger, { 
          method: "emitMessage", 
          module: "BaseChannel",
          error: { name: err.name, message: err.message, stack: err.stack },
          params: { channelId: this.id }
        });
      }
    }
    
    this.status.messageCount++;
    this.status.lastActivity = Date.now();
    
    logger.debug("消息事件处理完成", { 
      channelId: this.id,
      successCount,
      errorCount,
      totalMessageCount: this.status.messageCount,
      duration: timer()
    });
  }

  // ============================================================================
  // 状态管理
  // ============================================================================

  /**
   * 获取当前状态快照
   * @returns 状态快照
   */
  getStatus(): ChannelStatus {
    const timer = createTimer();
    logMethodCall(logger, { 
      method: "getStatus", 
      module: "BaseChannel",
      params: { channelId: this.id }
    });
    
    const status = { ...this.status };
    
    logMethodReturn(logger, { 
      method: "getStatus", 
      module: "BaseChannel",
      result: { id: status.id, connected: status.connected, messageCount: status.messageCount },
      duration: timer() 
    });
    
    return status;
  }

  /**
   * 更新连接状态
   * @param connected - 是否已连接
   * @param error - 可选错误信息
   */
  protected setConnected(connected: boolean, error?: string): void {
    const timer = createTimer();
    logMethodCall(logger, { 
      method: "setConnected", 
      module: "BaseChannel",
      params: { channelId: this.id, connected, error }
    });
    
    this.status.connected = connected;
    if (error) {
      this.status.lastError = error;
    }
    
    logger.info("连接状态更新", { 
      channelId: this.id,
      connected,
      error: error ?? null 
    });
    
    logMethodReturn(logger, { 
      method: "setConnected", 
      module: "BaseChannel",
      duration: timer() 
    });
  }
}