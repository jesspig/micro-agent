import { BaseChannel } from './base';
import type { OutboundMessage } from '../bus/events';
import type { MessageBus } from '../bus/queue';
import type { ChannelType } from '../types/interfaces';

/** QQ 频道配置 */
interface QQConfig {
  appId: string;
  secret: string;
  allowFrom: string[];
}

/**
 * QQ 频道通道
 * 
 * 使用 WebSocket 连接接收消息。
 */
export class QQChannel extends BaseChannel {
  readonly name: ChannelType = 'qq';
  private ws: WebSocket | null = null;

  constructor(bus: MessageBus, private config: QQConfig) {
    super(bus, config.allowFrom);
  }

  async start(): Promise<void> {
    // 获取 WebSocket 连接地址
    const wsUrl = await this.getWebSocketUrl();
    this.ws = new WebSocket(wsUrl);

    this.ws.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data as string);
        if (data.t === 'AT_MESSAGE_CREATE' || data.t === 'MESSAGE_CREATE') {
          const content = this.parseContent(data.d.content);
          await this.handleInbound(
            data.d.author.id,
            data.d.channel_id,
            content
          );
        }
      } catch (error) {
        console.error('QQ 消息解析失败:', error);
      }
    };

    this.ws.onerror = (error) => {
      console.error('QQ WebSocket 错误:', error);
    };

    this._running = true;
  }

  async stop(): Promise<void> {
    this.ws?.close();
    this.ws = null;
    this._running = false;
  }

  async send(msg: OutboundMessage): Promise<void> {
    const url = `https://api.sgroup.qq.com/channels/${msg.chatId}/messages`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bot ${this.config.appId}.${this.config.secret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ content: msg.content }),
    });

    if (!response.ok) {
      throw new Error(`QQ 消息发送失败: ${response.status}`);
    }
  }

  /**
   * 获取 WebSocket 连接地址
   */
  private async getWebSocketUrl(): Promise<string> {
    // QQ 频道 WebSocket 地址
    return 'wss://api.sgroup.qq.com/websocket';
  }

  /**
   * 解析消息内容，移除 @ 提及
   */
  private parseContent(content: string): string {
    return content.replace(/<@!\d+>/g, '').trim();
  }
}
