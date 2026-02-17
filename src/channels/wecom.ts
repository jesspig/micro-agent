import { ChannelHelper } from './helper';
import type { OutboundMessage } from '../bus/events';
import type { MessageBus } from '../bus/queue';
import type { ChannelType } from '../types/interfaces';

/** 企业微信配置 */
interface WeComConfig {
  corpId: string;
  agentId: string;
  secret: string;
  token?: string;
  encodingAESKey?: string;
  allowFrom: string[];
}

/**
 * 企业微信通道
 * 
 * 支持 Webhook 和应用模式。
 */
export class WeComChannel {
  readonly name: ChannelType = 'wecom';
  private accessToken: string | null = null;
  private _running = false;

  constructor(
    private bus: MessageBus,
    private config: WeComConfig,
    private helper: ChannelHelper
  ) {}

  get isRunning(): boolean {
    return this._running;
  }

  async start(): Promise<void> {
    // 获取 access_token
    this.accessToken = await this.getAccessToken();

    this._running = true;
  }

  async stop(): Promise<void> {
    this.accessToken = null;
    this._running = false;
  }

  async send(msg: OutboundMessage): Promise<void> {
    if (!this.accessToken) {
      throw new Error('企业微信通道未启动');
    }

    // 发送消息
    const url = `https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${this.accessToken}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        touser: msg.chatId,
        msgtype: 'text',
        agentid: this.config.agentId,
        text: { content: msg.content },
      }),
    });

    const data = await response.json() as { errcode: number; errmsg: string };
    if (data.errcode !== 0) {
      throw new Error(`企业微信消息发送失败: ${data.errmsg}`);
    }
  }

  /**
   * 获取 access_token
   */
  private async getAccessToken(): Promise<string> {
    const url = `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${this.config.corpId}&corpsecret=${this.config.secret}`;

    const response = await fetch(url);
    const data = await response.json() as { access_token: string; errcode?: number };

    if (data.errcode && data.errcode !== 0) {
      throw new Error('获取企业微信 access_token 失败');
    }

    return data.access_token;
  }
}