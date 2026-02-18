/**
 * SDK 核心通道模块
 * 
 * 提供通道接口定义和辅助类。
 */
import type { ChannelType } from '../types/interfaces';
import type { InboundMessage, OutboundMessage } from '../bus/events';
import type { MessageBus } from '../bus/queue';

/**
 * 通道接口
 * 
 * 定义所有通道必须实现的方法。
 */
export interface Channel {
  /** 通道名称 */
  readonly name: ChannelType;

  /** 启动通道 */
  start(): Promise<void>;

  /** 停止通道 */
  stop(): Promise<void>;

  /** 发送消息 */
  send(msg: OutboundMessage): Promise<void>;

  /** 检查是否运行中 */
  readonly isRunning: boolean;
}

/**
 * 通道辅助对象（组合优于继承）
 * 
 * 提供通用的辅助方法，通道类通过组合而非继承使用。
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

  /** 检查发送者是否被允许 */
  isAllowed(senderId: string): boolean {
    if (this.allowFrom.length === 0) return true;
    return this.allowFrom.includes(senderId);
  }

  /** 处理入站消息 */
  async handleInbound(
    channelName: ChannelType,
    senderId: string,
    chatId: string,
    content: string,
    media: string[] = [],
    metadata: Record<string, unknown> = {}
  ): Promise<void> {
    if (!this.isAllowed(senderId)) {
      return;
    }

    const msg: InboundMessage = {
      channel: channelName,
      senderId,
      chatId,
      content,
      timestamp: new Date(),
      media,
      metadata,
    };

    await this.bus.publishInbound(msg);
  }
}
