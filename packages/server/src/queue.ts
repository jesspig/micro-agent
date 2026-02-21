/**
 * 消息总线
 * 
 * 管理入站和出站消息的异步队列
 */

import type { InboundMessage, OutboundMessage } from './events';

/**
 * 消息总线
 */
export class MessageBus {
  private inboundQueue: InboundMessage[] = [];
  private outboundQueue: OutboundMessage[] = [];
  private inboundResolvers: ((msg: InboundMessage) => void)[] = [];
  private outboundResolvers: ((msg: OutboundMessage) => void)[] = [];

  /**
   * 发布入站消息
   */
  async publishInbound(msg: InboundMessage): Promise<void> {
    if (this.inboundResolvers.length > 0) {
      const resolver = this.inboundResolvers.shift()!;
      resolver(msg);
    } else {
      this.inboundQueue.push(msg);
    }
  }

  /**
   * 消费入站消息
   */
  async consumeInbound(): Promise<InboundMessage> {
    if (this.inboundQueue.length > 0) {
      return this.inboundQueue.shift()!;
    }
    return new Promise((resolve) => {
      this.inboundResolvers.push(resolve);
    });
  }

  /**
   * 发布出站消息
   */
  async publishOutbound(msg: OutboundMessage): Promise<void> {
    if (this.outboundResolvers.length > 0) {
      const resolver = this.outboundResolvers.shift()!;
      resolver(msg);
    } else {
      this.outboundQueue.push(msg);
    }
  }

  /**
   * 消费出站消息
   */
  async consumeOutbound(): Promise<OutboundMessage> {
    if (this.outboundQueue.length > 0) {
      return this.outboundQueue.shift()!;
    }
    return new Promise((resolve) => {
      this.outboundResolvers.push(resolve);
    });
  }

  /** 获取入站队列长度 */
  get inboundLength(): number {
    return this.inboundQueue.length;
  }

  /** 获取出站队列长度 */
  get outboundLength(): number {
    return this.outboundQueue.length;
  }
}
