/**
 * CLI 通道实现
 *
 * 将 CLI 作为标准 Channel 实现，支持会话共享和消息广播。
 */

import type { Channel, ChannelType, InboundMessage } from '@micro-agent/types';
import type { MessageBus } from '@micro-agent/sdk';
import { createInterface, Interface } from 'readline';
import { getLogger } from '@logtape/logtape';

const log = getLogger(['channel', 'cli']);

/** CLI 配置 */
export interface CliConfig {
  /** 提示符 */
  prompt?: string;
}

/**
 * CLI Channel 实现
 */
export class CliChannel implements Channel {
  readonly name: ChannelType = 'cli';
  
  private _isRunning = false;
  private rl: Interface | null = null;
  private pendingBroadcasts: string[] = [];
  private isInputting = false;

  constructor(
    private readonly bus: MessageBus,
    private readonly config: CliConfig = {}
  ) {}

  get isRunning(): boolean {
    return this._isRunning;
  }

  /**
   * 启动 CLI 通道
   */
  async start(): Promise<void> {
    if (this._isRunning) return;

    this.rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    this._isRunning = true;
    log.info('CLI 通道已启动');
  }

  /**
   * 停止 CLI 通道
   */
  async stop(): Promise<void> {
    if (!this._isRunning) return;

    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }

    this._isRunning = false;
    log.info('CLI 通道已停止');
  }

  /**
   * 发送消息到 CLI（广播输出）
   */
  async send(msg: { channel: ChannelType; chatId: string; content: string; replyTo?: string; media?: string[]; metadata?: Record<string, unknown> }): Promise<void> {
    if (!this._isRunning) {
      log.warn('CLI 通道未运行，消息已丢弃');
      return;
    }

    // 输入时禁用广播输出，缓存消息
    if (this.isInputting) {
      this.pendingBroadcasts.push(msg.content);
      return;
    }

    // 输出消息
    this.output(msg.content);
  }

  /**
   * 显示缓存的广播消息
   */
  flushBroadcasts(): void {
    if (this.pendingBroadcasts.length > 0) {
      console.log();
      console.log('\x1b[33m[新消息]\x1b[0m');
      for (const msg of this.pendingBroadcasts) {
        this.output(msg);
      }
      this.pendingBroadcasts = [];
    }
  }

  /**
   * 设置输入状态
   */
  setInputting(value: boolean): void {
    this.isInputting = value;
  }

  /**
   * 获取 readline 接口
   */
  getReadline(): Interface | null {
    return this.rl;
  }

  /**
   * 发布用户输入到 MessageBus
   */
  async publishInput(content: string): Promise<void> {
    const msg: InboundMessage = {
      channel: 'cli',
      chatId: 'default',
      senderId: 'user',
      content,
      media: [],
      metadata: {},
      timestamp: new Date(),
    };

    await this.bus.publishInbound(msg);
  }

  /**
   * 输出消息到控制台
   */
  private output(content: string): void {
    console.log();
    console.log(`\x1b[36m\x1b[1m助手:\x1b[0m ${content}`);
    console.log();
  }
}
