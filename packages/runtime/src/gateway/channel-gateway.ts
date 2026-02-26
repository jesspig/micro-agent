/**
 * Channel Gateway 实现
 *
 * 作为消息处理的中心枢纽：
 * 1. 接收来自任意 Channel 的消息
 * 2. 调用 AgentExecutor/LLM 处理
 * 3. 将响应广播到所有活跃 Channel
 */

import type { Channel, ChannelType, InboundMessage, BroadcastMessage } from '@micro-agent/types';
import type { AgentExecutor } from '../executor';
import { getLogger } from '@logtape/logtape';

const log = getLogger(['gateway']);

/** 最大重连次数 */
const MAX_RECONNECT = 3;

/**
 * ChannelGateway 配置
 */
export interface ChannelGatewayConfig {
  /** Agent 执行器 */
  executor: AgentExecutor;
  /** 获取活跃通道的函数 */
  getChannels: () => Channel[];
}

/**
 * Channel Gateway - 消息处理枢纽
 */
export class ChannelGatewayImpl {
  /** 统一会话 ID */
  readonly sessionKey = 'default';
  /** 重连计数 */
  private reconnectAttempts = new Map<ChannelType, number>();
  /** Agent 执行器 */
  private readonly executor: AgentExecutor;
  /** 获取通道函数 */
  private readonly getChannels: () => Channel[];

  constructor(config: ChannelGatewayConfig) {
    this.executor = config.executor;
    this.getChannels = config.getChannels;
  }

  /**
   * 处理来自任意通道的消息
   * 
   * 流程：Channel → Gateway → LLM → Gateway → 所有 Channel
   */
  async process(msg: InboundMessage): Promise<void> {
    log.info('📥 接收消息', { channel: msg.channel, content: msg.content.slice(0, 50) });

    try {
      // 调用 LLM 处理
      const response = await this.executor.processMessage(msg);

      if (response) {
        // 广播响应到所有活跃 Channel
        await this.broadcast({
          content: response.content,
          replyTo: response.replyTo,
          media: response.media,
          metadata: response.metadata,
        });
      }
    } catch (error) {
      log.error('处理消息失败', { error: String(error) });
    }
  }

  /**
   * 广播消息到所有活跃 Channel
   */
  async broadcast(msg: BroadcastMessage): Promise<PromiseSettledResult<void>[]> {
    const channels = this.getChannels().filter(ch => ch.isRunning);
    
    if (channels.length === 0) {
      log.warn('无可用 Channel，消息已丢弃');
      return [];
    }

    log.info('📤 广播消息到 {count} 个 Channel', { count: channels.length });

    const results = await Promise.allSettled(
      channels.map(ch => this.sendToChannel(ch, msg))
    );

    // 记录失败结果
    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        this.handleChannelError(channels[i].name, r.reason);
      }
    });

    return results;
  }

  /**
   * 发送消息到单个 Channel
   */
  private async sendToChannel(channel: Channel, msg: BroadcastMessage): Promise<void> {
    await channel.send({
      channel: channel.name,
      chatId: 'default',
      content: msg.content,
      replyTo: msg.replyTo,
      media: msg.media ?? [],
      metadata: msg.metadata ?? {},
    });
  }

  /**
   * 处理 Channel 错误（异步重连）
   */
  private handleChannelError(channel: ChannelType, error: unknown): void {
    log.error('Channel {name} 发送失败', { name: channel, error });

    // 异步重连，不阻塞
    const attempts = this.reconnectAttempts.get(channel) ?? 0;
    if (attempts < MAX_RECONNECT) {
      this.reconnectAttempts.set(channel, attempts + 1);
      this.tryReconnect(channel).catch(e => {
        log.warn('重连失败', { channel, error: e });
      });
    } else {
      log.error('Channel {name} 重连次数已达上限，标记为不可用', { name: channel });
    }
  }

  /**
   * 异步重连 Channel
   */
  private async tryReconnect(channel: ChannelType): Promise<void> {
    const ch = this.getChannels().find(c => c.name === channel);
    if (!ch) return;

    try {
      await ch.stop();
      await ch.start();
      this.reconnectAttempts.delete(channel);
      log.info('Channel {name} 重连成功', { name: channel });
    } catch (e) {
      log.warn('Channel {name} 重连失败', { name: channel, error: e });
    }
  }
}