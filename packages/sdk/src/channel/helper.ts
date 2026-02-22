/**
 * 通道辅助类
 */

import type { ChannelType, InboundMessage } from '@microbot/types';
import type { MessageBus } from '@microbot/runtime';

/**
 * 入站消息参数
 */
export interface InboundMessageParams {
  channelName: ChannelType;
  senderId: string;
  chatId: string;
  content: string;
  media?: string[];
  metadata?: Record<string, unknown>;
  currentDir?: string;
}

/**
 * 通道辅助对象
 * 
 * 提供通道的基础功能实现。
 */
export class ChannelHelper {
  protected _running = false;

  constructor(
    protected bus: MessageBus,
    protected allowFrom: string[] = []
  ) {}

  get isRunning(): boolean {
    return this._running;
  }

  isAllowed(senderId: string): boolean {
    if (this.allowFrom.length === 0) return true;
    return this.allowFrom.includes(senderId);
  }

  async handleInbound(params: InboundMessageParams): Promise<void> {
    if (!this.isAllowed(params.senderId)) return;

    const msg: InboundMessage = {
      channel: params.channelName,
      senderId: params.senderId,
      chatId: params.chatId,
      content: params.content,
      timestamp: new Date(),
      media: params.media ?? [],
      metadata: params.metadata ?? {},
      currentDir: params.currentDir,
    };

    await this.bus.publishInbound(msg);
  }
}
