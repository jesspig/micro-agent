import { BaseChannel } from './base';
import type { OutboundMessage } from '../bus/events';
import type { MessageBus } from '../bus/queue';
import type { ChannelType } from '../types/interfaces';
import { ImapFlow, type ImapFlow as ImapFlowType } from 'imapflow';
import nodemailer from 'nodemailer';

/** 邮箱配置 */
interface EmailConfig {
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
  user: string;
  password: string;
  allowFrom: string[];
}

/**
 * 邮箱通道
 * 
 * 使用 IMAP 接收邮件，SMTP 发送邮件。
 * 默认 30 秒轮询间隔，使用 UID 去重。
 */
export class EmailChannel extends BaseChannel {
  readonly name: ChannelType = 'email';
  private imapClient: ImapFlowType | null = null;
  private smtpTransport: nodemailer.Transporter | null = null;
  private seenUids = new Set<string>();
  private pollInterval: Timer | null = null;

  constructor(bus: MessageBus, private config: EmailConfig) {
    super(bus, config.allowFrom);
  }

  async start(): Promise<void> {
    // 初始化 IMAP
    this.imapClient = new ImapFlow({
      host: this.config.imapHost,
      port: this.config.imapPort,
      secure: true,
      auth: {
        user: this.config.user,
        pass: this.config.password,
      },
    });

    // 初始化 SMTP
    this.smtpTransport = nodemailer.createTransport({
      host: this.config.smtpHost,
      port: this.config.smtpPort,
      secure: true,
      auth: {
        user: this.config.user,
        pass: this.config.password,
      },
    });

    // 连接 IMAP
    await this.imapClient.connect();

    // 开始轮询
    this.startPolling();

    this._running = true;
  }

  async stop(): Promise<void> {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }

    try {
      await this.imapClient?.logout();
    } catch {
      // 忽略登出错误
    }

    this.smtpTransport?.close();

    this.imapClient = null;
    this.smtpTransport = null;
    this._running = false;
  }

  async send(msg: OutboundMessage): Promise<void> {
    if (!this.smtpTransport) {
      throw new Error('邮箱通道未启动');
    }

    await this.smtpTransport.sendMail({
      from: this.config.user,
      to: msg.chatId,
      subject: 'Re: ' + ((msg.metadata.subject as string) ?? ''),
      text: msg.content,
    });
  }

  /**
   * 开始轮询邮件
   */
  private startPolling(): void {
    this.pollInterval = setInterval(() => {
      this.poll().catch(console.error);
    }, 30000);
  }

  /**
   * 轮询新邮件
   */
  private async poll(): Promise<void> {
    if (!this.imapClient) return;

    try {
      await this.imapClient.mailboxOpen('INBOX');

      for await (const msg of this.imapClient.fetch({ seen: false }, { uid: true, source: true })) {
        const uid = msg.uid.toString();

        // 跳过已处理的邮件
        if (this.seenUids.has(uid)) continue;
        this.seenUids.add(uid);

        // 解析邮件
        if (msg.source) {
          const parsed = this.parseEmail(msg.source.toString());
          await this.handleInbound(parsed.from, parsed.from, parsed.content);
        }
      }
    } catch (error) {
      console.error('邮件轮询失败:', error);
    }
  }

  /**
   * 解析邮件内容
   */
  private parseEmail(raw: string): { from: string; content: string } {
    // 简化实现：提取发件人和正文
    const fromMatch = raw.match(/From:\s*(.+)/i);
    const from = fromMatch ? fromMatch[1].trim() : 'unknown';

    // 提取正文（简化版）
    const contentMatch = raw.match(/\r\n\r\n([\s\S]+)/);
    const content = contentMatch ? contentMatch[1].trim() : raw;

    return { from, content };
  }
}