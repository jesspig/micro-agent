import { BaseChannel } from './base';
import type { OutboundMessage } from '../bus/events';
import type { MessageBus } from '../bus/queue';
import type { ChannelType } from '../types/interfaces';
import { Client, AppType } from '@larksuiteoapi/node-sdk';

/** 飞书通道配置 */
interface FeishuConfig {
  appId: string;
  appSecret: string;
  allowFrom: string[];
}

/** 飞书消息事件 */
interface FeishuMessageEvent {
  event: {
    message: {
      content: string;
      chat_id: string;
      message_type: string;
    };
    sender: {
      sender_id: {
        open_id: string;
      };
    };
  };
}

/**
 * 飞书通道
 * 
 * 使用 WebSocket 长连接接收消息。
 * 注意：消息处理需在 3 秒内完成。
 */
export class FeishuChannel extends BaseChannel {
  readonly name: ChannelType = 'feishu';
  private client: Client | null = null;

  constructor(bus: MessageBus, private config: FeishuConfig) {
    super(bus, config.allowFrom);
  }

  async start(): Promise<void> {
    this.client = new Client({
      appId: this.config.appId,
      appSecret: this.config.appSecret,
      appType: AppType.SelfBuild,
    });

    // 订阅消息事件（简化实现）
    // 实际使用时需要配置事件订阅
    this._running = true;
  }

  async stop(): Promise<void> {
    this.client = null;
    this._running = false;
  }

  async send(msg: OutboundMessage): Promise<void> {
    if (!this.client) {
      throw new Error('飞书通道未启动');
    }

    await this.client.im.message.create({
      params: { receive_id_type: 'chat_id' },
      data: {
        receive_id: msg.chatId,
        msg_type: 'text',
        content: JSON.stringify({ text: msg.content }),
      },
    });
  }

  /**
   * 处理飞书消息事件（供外部事件订阅调用）
   */
  async handleFeishuEvent(event: FeishuMessageEvent): Promise<void> {
    const message = event.event.message;
    const sender = event.event.sender;

    // 解析消息内容
    let content = message.content;
    try {
      const parsed = JSON.parse(content);
      content = parsed.text || content;
    } catch {
      // 非 JSON 格式，保持原样
    }

    await this.handleInbound(
      sender.sender_id.open_id,
      message.chat_id,
      content,
      [],
      { messageType: message.message_type }
    );
  }
}
