/**
 * Channel 管理器
 *
 * 负责多个 Channel 的注册、生命周期管理和消息分发
 */

import type { IChannelExtended, MessageHandler } from "./contract.js";
import { RegistryError } from "../errors.js";
import { 
  channelLogger, 
  createTimer, 
  logMethodCall, 
  logMethodReturn, 
  logMethodError 
} from "../../applications/shared/logger.js";

const logger = channelLogger();

// ============================================================================
// Channel 管理器
// ============================================================================

/**
 * Channel 管理器
 *
 * 管理多个 Channel 实例，提供统一的注册、启动、停止和消息处理接口。
 */
export class ChannelManager {
  /** 已注册的 Channel 实例 */
  private channels = new Map<string, IChannelExtended>();

  /** 全局消息处理器 */
  private globalHandlers = new Set<MessageHandler>();

  // ============================================================================
  // 注册操作
  // ============================================================================

  /**
   * 注册 Channel
   * @param channel - Channel 实例
   * @throws RegistryError 如果 Channel 已存在
   */
  register(channel: IChannelExtended): void {
    const timer = createTimer();
    logMethodCall(logger, { 
      method: "register", 
      module: "ChannelManager",
      params: { channelId: channel.id, channelType: channel.type }
    });
    
    try {
      if (this.channels.has(channel.id)) {
        throw new RegistryError(
          `Channel "${channel.id}" 已存在`,
          "Channel",
          channel.id
        );
      }
      this.channels.set(channel.id, channel);
      
      logger.info("Channel 已注册", { 
        channelId: channel.id,
        channelType: channel.type,
        totalChannels: this.channels.size 
      });
      
      logMethodReturn(logger, { 
        method: "register", 
        module: "ChannelManager",
        duration: timer() 
      });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logMethodError(logger, { 
        method: "register", 
        module: "ChannelManager",
        error: { name: err.name, message: err.message, stack: err.stack },
        params: { channelId: channel.id },
        duration: timer() 
      });
      throw error;
    }
  }

  /**
   * 获取指定 Channel
   * @param id - Channel 标识
   * @returns Channel 实例，若不存在则返回 undefined
   */
  get(id: string): IChannelExtended | undefined {
    const timer = createTimer();
    logMethodCall(logger, { 
      method: "get", 
      module: "ChannelManager",
      params: { channelId: id }
    });
    
    const channel = this.channels.get(id);
    
    logger.debug("获取 Channel", { 
      channelId: id,
      found: !!channel 
    });
    
    logMethodReturn(logger, { 
      method: "get", 
      module: "ChannelManager",
      result: channel ? { id: channel.id, type: channel.type } : undefined,
      duration: timer() 
    });
    
    return channel;
  }

  /**
   * 列出所有 Channel
   * @returns Channel 实例列表
   */
  list(): IChannelExtended[] {
    const timer = createTimer();
    logMethodCall(logger, { 
      method: "list", 
      module: "ChannelManager",
      params: {}
    });
    
    const channels = Array.from(this.channels.values());
    
    logger.debug("列出所有 Channel", { 
      count: channels.length,
      channelIds: channels.map(c => c.id)
    });
    
    logMethodReturn(logger, { 
      method: "list", 
      module: "ChannelManager",
      result: { count: channels.length },
      duration: timer() 
    });
    
    return channels;
  }

  /**
   * 检查 Channel 是否存在
   * @param id - Channel 标识
   * @returns 是否存在
   */
  has(id: string): boolean {
    const timer = createTimer();
    logMethodCall(logger, { 
      method: "has", 
      module: "ChannelManager",
      params: { channelId: id }
    });
    
    const exists = this.channels.has(id);
    
    logMethodReturn(logger, { 
      method: "has", 
      module: "ChannelManager",
      result: { exists },
      duration: timer() 
    });
    
    return exists;
  }

  // ============================================================================
  // 生命周期管理
  // ============================================================================

  /**
   * 启动所有 Channel
   * 并行启动，忽略单个失败
   */
  async startAll(): Promise<void> {
    const timer = createTimer();
    logMethodCall(logger, { 
      method: "startAll", 
      module: "ChannelManager",
      params: { channelCount: this.channels.size }
    });
    
    logger.info("开始启动所有 Channel", { 
      totalChannels: this.channels.size 
    });
    
    const results = await Promise.allSettled(
      Array.from(this.channels.values()).map((ch) => ch.start(ch.config))
    );

    let successCount = 0;
    let failureCount = 0;
    
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const channel = Array.from(this.channels.values())[i];
      
      if (result && result.status === "rejected") {
        failureCount++;
        logMethodError(logger, { 
          method: "startAll", 
          module: "ChannelManager",
          error: { 
            name: "ChannelStartError", 
            message: String(result.reason)
          },
          params: { channelId: channel?.id }
        });
      } else {
        successCount++;
      }
    }
    
    logger.info("所有 Channel 启动完成", { 
      totalChannels: this.channels.size,
      successCount,
      failureCount,
      duration: timer()
    });
    
    logMethodReturn(logger, { 
      method: "startAll", 
      module: "ChannelManager",
      result: { successCount, failureCount },
      duration: timer() 
    });
  }

  /**
   * 停止所有 Channel
   */
  async stopAll(): Promise<void> {
    const timer = createTimer();
    logMethodCall(logger, { 
      method: "stopAll", 
      module: "ChannelManager",
      params: { channelCount: this.channels.size }
    });
    
    logger.info("开始停止所有 Channel", { 
      totalChannels: this.channels.size 
    });
    
    await Promise.all(
      Array.from(this.channels.values()).map((ch) => ch.stop())
    );
    
    logger.info("所有 Channel 已停止", { 
      totalChannels: this.channels.size,
      duration: timer()
    });
    
    logMethodReturn(logger, { 
      method: "stopAll", 
      module: "ChannelManager",
      duration: timer() 
    });
  }

  // ============================================================================
  // 消息处理
  // ============================================================================

  /**
   * 注册全局消息处理器
   * 处理器将应用于所有已注册和新注册的 Channel
   * @param handler - 消息处理函数
   */
  onMessage(handler: MessageHandler): void {
    const timer = createTimer();
    logMethodCall(logger, { 
      method: "onMessage", 
      module: "ChannelManager",
      params: { globalHandlerCount: this.globalHandlers.size }
    });
    
    this.globalHandlers.add(handler);
    // 注册到所有 Channel
    for (const channel of this.channels.values()) {
      channel.onMessage(handler);
    }
    
    logger.info("全局消息处理器已注册", { 
      totalHandlers: this.globalHandlers.size,
      registeredToChannels: this.channels.size 
    });
    
    logMethodReturn(logger, { 
      method: "onMessage", 
      module: "ChannelManager",
      duration: timer() 
    });
  }

  /**
   * 移除全局消息处理器
   * @param handler - 消息处理函数
   */
  offMessage(handler: MessageHandler): void {
    const timer = createTimer();
    logMethodCall(logger, { 
      method: "offMessage", 
      module: "ChannelManager",
      params: { globalHandlerCount: this.globalHandlers.size }
    });
    
    const beforeCount = this.globalHandlers.size;
    this.globalHandlers.delete(handler);
    const afterCount = this.globalHandlers.size;
    
    for (const channel of this.channels.values()) {
      channel.offMessage(handler);
    }
    
    logger.info("全局消息处理器已移除", { 
      beforeCount,
      afterCount,
      removedFromChannels: this.channels.size 
    });
    
    logMethodReturn(logger, { 
      method: "offMessage", 
      module: "ChannelManager",
      duration: timer() 
    });
  }
}