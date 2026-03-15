/**
 * Channel 管理器
 *
 * 负责多个 Channel 的注册、生命周期管理和消息分发
 */

import type { IChannelExtended, MessageHandler } from "./contract.js";
import { RegistryError } from "../errors.js";

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
    if (this.channels.has(channel.id)) {
      throw new RegistryError(
        `Channel "${channel.id}" 已存在`,
        "Channel",
        channel.id
      );
    }
    this.channels.set(channel.id, channel);
  }

  /**
   * 获取指定 Channel
   * @param id - Channel 标识
   * @returns Channel 实例，若不存在则返回 undefined
   */
  get(id: string): IChannelExtended | undefined {
    return this.channels.get(id);
  }

  /**
   * 列出所有 Channel
   * @returns Channel 实例列表
   */
  list(): IChannelExtended[] {
    return Array.from(this.channels.values());
  }

  /**
   * 检查 Channel 是否存在
   * @param id - Channel 标识
   * @returns 是否存在
   */
  has(id: string): boolean {
    return this.channels.has(id);
  }

  // ============================================================================
  // 生命周期管理
  // ============================================================================

  /**
   * 启动所有 Channel
   * 并行启动，忽略单个失败
   */
  async startAll(): Promise<void> {
    const results = await Promise.allSettled(
      Array.from(this.channels.values()).map((ch) => ch.start(ch.config))
    );

    for (const result of results) {
      if (result.status === "rejected") {
        // 静默处理启动失败
      }
    }
  }

  /**
   * 停止所有 Channel
   */
  async stopAll(): Promise<void> {
    await Promise.all(
      Array.from(this.channels.values()).map((ch) => ch.stop())
    );
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
    this.globalHandlers.add(handler);
    // 注册到所有 Channel
    for (const channel of this.channels.values()) {
      channel.onMessage(handler);
    }
  }

  /**
   * 移除全局消息处理器
   * @param handler - 消息处理函数
   */
  offMessage(handler: MessageHandler): void {
    this.globalHandlers.delete(handler);
    for (const channel of this.channels.values()) {
      channel.offMessage(handler);
    }
  }
}
