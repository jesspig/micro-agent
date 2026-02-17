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
 * 通道基类
 * 
 * 提供通用的辅助方法，子类只需实现核心逻辑。
 */
export abstract class BaseChannel implements Channel {
  abstract readonly name: ChannelType;
  protected _running = false;

  /**
   * @param bus - 消息总线
   * @param allowFrom - 允许的发送者列表，空数组表示不限制
   */
  constructor(
    protected bus: MessageBus,
    protected allowFrom: string[] = []
  ) {}

  abstract start(): Promise<void>;
  abstract stop(): Promise<void>;
  abstract send(msg: OutboundMessage): Promise<void>;

  get isRunning(): boolean {
    return this._running;
  }

  /**
   * 检查发送者是否被允许
   * @param senderId - 发送者 ID
   */
  protected isAllowed(senderId: string): boolean {
    if (this.allowFrom.length === 0) return true;
    return this.allowFrom.includes(senderId);
  }

  /**
   * 处理入站消息
   * @param senderId - 发送者 ID
   * @param chatId - 聊天 ID
   * @param content - 消息内容
   * @param media - 媒体文件列表
   * @param metadata - 元数据
   */
  protected async handleInbound(
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
      channel: this.name,
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
