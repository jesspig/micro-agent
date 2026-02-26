/**
 * 通道管理器
 */

import type { ChannelType } from '@micro-agent/types';
import type { Channel } from './channel';
import type { OutboundMessage } from './events';
import { getLogger } from '@logtape/logtape';

const log = getLogger(['channel', 'manager']);

/**
 * 通道管理器
 */
export class ChannelManager {
  private channels = new Map<ChannelType, Channel>();

  /**
   * 注册通道
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
        log.error('启动通道 {name} 失败', { name: channel.name, error });
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
        log.error('停止通道 {name} 失败', { name: channel.name, error });
      }
    }
  }

  /**
   * 发送消息到指定通道
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
