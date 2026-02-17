import { BaseChannel } from './base';
import type { OutboundMessage } from '../bus/events';
import type { MessageBus } from '../bus/queue';
import type { ChannelType } from '../types/interfaces';

/** 钉钉配置 */
interface DingTalkConfig {
  clientId: string;
  clientSecret: string;
  allowFrom: string[];
}

/**
 * 钉钉通道
 * 
 * 使用 Stream 模式接收消息。
 */
export class DingTalkChannel extends BaseChannel {
  readonly name: ChannelType = 'dingtalk';
  private accessToken: string | null = null;

  constructor(bus: MessageBus, private config: DingTalkConfig) {
    super(bus, config.allowFrom);
  }

  async start(): Promise<void> {
    // 获取 access_token
    this.accessToken = await this.getAccessToken();

    // Stream 模式连接（简化实现）
    this._running = true;
  }

  async stop(): Promise<void> {
    this.accessToken = null;
    this._running = false;
  }

  async send(msg: OutboundMessage): Promise<void> {
    if (!this.accessToken) {
      throw new Error('钉钉通道未启动');
    }

    // 发送消息
    const url = 'https://api.dingtalk.com/v1.0/robot/oToMessages/batchSend';

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'x-acs-dingtalk-access-token': this.accessToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        robotCode: this.config.clientId,
        userIds: [msg.chatId],
        msgKey: 'sampleText',
        msgParam: JSON.stringify({ content: msg.content }),
      }),
    });

    if (!response.ok) {
      throw new Error(`钉钉消息发送失败: ${response.status}`);
    }
  }

  /**
   * 获取 access_token
   */
  private async getAccessToken(): Promise<string> {
    const url = 'https://api.dingtalk.com/v1.0/oauth2/accessToken';

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        appKey: this.config.clientId,
        appSecret: this.config.clientSecret,
      }),
    });

    const data = await response.json() as { accessToken: string };
    return data.accessToken;
  }
}
