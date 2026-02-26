/**
 * 通道管理器
 *
 * 管理所有通道，提供消息路由和广播接口。
 */

import type { Channel, ChannelType, BroadcastMessage } from '@micro-agent/types';
import { getLogger } from '@logtape/logtape';

const log = getLogger(['channel', 'manager']);

/** 消息处理器接口 */
export interface MessageHandler {
  /** 处理入站消息 */
  process(msg: import('@micro-agent/types').InboundMessage): Promise<void>;
}

/**
 * 通道管理器
 *
 * 管理所有通道，消息流经 gateway 进行处理和广播。
 */
export class ChannelManager {
  private channels = new Map<ChannelType, Channel>();
  private handler: MessageHandler | null = null;

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
   * 设置消息处理器（ChannelGateway）
   */
  setHandler(handler: MessageHandler): void {
    this.handler = handler;
  }

  /**
   * 接收来自通道的消息，转发给处理器
   */
  async onMessage(msg: import('@micro-agent/types').InboundMessage): Promise<void> {
    if (!this.handler) {
      log.warn('未设置消息处理器，消息已丢弃');
      return;
    }
    await this.handler.process(msg);
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
   * 获取运行中的通道列表
   */
  getRunningChannels(): ChannelType[] {
    return Array.from(this.channels.entries())
      .filter(([, ch]) => ch.isRunning)
      .map(([name]) => name);
  }

  /**
   * 获取所有 Channel 对象
   */
  getChannels(): Channel[] {
    return Array.from(this.channels.values());
  }

  /**
   * 发送消息到指定通道（向后兼容）
   */
  async send(msg: import('@micro-agent/types').OutboundMessage): Promise<void> {
    const channel = this.channels.get(msg.channel);
    if (!channel) {
      throw new Error(`通道不存在: ${msg.channel}`);
    }
    await channel.send(msg);
  }

  /**
   * 广播消息到所有活跃 Channel
   */
  async broadcast(msg: BroadcastMessage): Promise<PromiseSettledResult<void>[]> {
    const runningChannels = this.getChannels().filter(ch => ch.isRunning);

    if (runningChannels.length === 0) {
      log.warn('无可用 Channel，消息已丢弃');
      return [];
    }

    log.info('广播消息到 {count} 个 Channel', { count: runningChannels.length });

    const results = await Promise.allSettled(
      runningChannels.map(ch => ch.send({
        channel: ch.name,
        chatId: 'default',
        content: msg.content,
        replyTo: msg.replyTo,
        media: msg.media ?? [],
        metadata: msg.metadata ?? {},
      }))
    );

    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        log.error('Channel {name} 发送失败', { name: runningChannels[i].name, reason: r.reason });
      }
    });

    return results;
  }
}
