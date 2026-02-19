/**
 * 通道管理器
 * 
 * 管理所有通道，提供统一的消息发送接口。
 */
import type { ChannelType } from '../types/interfaces';
import type { Channel } from './base';
import type { OutboundMessage } from '../bus/events';

/**
 * 通道管理器
 * 
 * 管理所有通道，提供统一的消息发送接口。
 */
export class ChannelManager {
  private channels = new Map<ChannelType, Channel>();

  /**
   * 注册通道
   * @param channel - 通道实例
   * @throws {Error} 通道已注册时抛出
   */
  register(channel: Channel): void {
    if (this.channels.has(channel.name)) {
      throw new Error(`通道已注册: ${channel.name}`);
    }
    this.channels.set(channel.name, channel);
  }

  /**
   * 启动所有通道
   */
  async startAll(): Promise<void> {
    for (const channel of this.channels.values()) {
      try {
        await channel.start();
      } catch (error) {
        console.error(`启动通道 ${channel.name} 失败:`, error);
      }
    }
  }

  /**
   * 停止所有通道
   */
  async stopAll(): Promise<void> {
    for (const channel of this.channels.values()) {
      try {
        await channel.stop();
      } catch (error) {
        console.error(`停止通道 ${channel.name} 失败:`, error);
      }
    }
  }

  /**
   * 发送消息到指定通道
   * @param msg - 出站消息
   * @throws {Error} 通道不存在时抛出
   */
  async send(msg: OutboundMessage): Promise<void> {
    const channel = this.channels.get(msg.channel);
    if (!channel) {
      throw new Error(`通道不存在: ${msg.channel}`);
    }
    await channel.send(msg);
  }

  /**
   * 获取运行中的通道列表
   */
  getRunningChannels(): ChannelType[] {
    return Array.from(this.channels.entries())
      .filter(([, ch]) => ch.isRunning)
      .map(([name]) => name);
  }
}
