import { describe, it, expect, beforeEach } from 'bun:test';
import { BaseChannel, type Channel } from '../../src/channels/base';
import type { OutboundMessage } from '../../src/bus/events';
import type { MessageBus } from '../../src/bus/queue';
import type { ChannelType } from '../../src/types/interfaces';

// Mock MessageBus
class MockBus implements MessageBus {
  publishedInbound: unknown[] = [];
  publishedOutbound: unknown[] = [];

  async publishInbound(msg: unknown): Promise<void> {
    this.publishedInbound.push(msg);
  }

  async publishOutbound(msg: unknown): Promise<void> {
    this.publishedOutbound.push(msg);
  }

  async consumeInbound(): Promise<never> {
    throw new Error('Not implemented');
  }

  async consumeOutbound(): Promise<never> {
    throw new Error('Not implemented');
  }

  get inboundLength(): number {
    return 0;
  }

  get outboundLength(): number {
    return 0;
  }
}

// 测试用具体通道实现
class TestChannel extends BaseChannel {
  readonly name: ChannelType = 'feishu';

  async start(): Promise<void> {
    this._running = true;
  }

  async stop(): Promise<void> {
    this._running = false;
  }

  async send(msg: OutboundMessage): Promise<void> {
    // 测试实现
  }

  // 暴露 protected 方法供测试
  async testHandleInbound(
    senderId: string,
    chatId: string,
    content: string,
    media?: string[]
  ): Promise<void> {
    return this.handleInbound(senderId, chatId, content, media);
  }
}

describe('BaseChannel', () => {
  let bus: MockBus;
  let channel: TestChannel;

  beforeEach(() => {
    bus = new MockBus();
    channel = new TestChannel(bus, []);
  });

  describe('基础功能', () => {
    it('should have correct name', () => {
      expect(channel.name).toBe('feishu');
    });

    it('should not be running initially', () => {
      expect(channel.isRunning).toBe(false);
    });

    it('should be running after start', async () => {
      await channel.start();
      expect(channel.isRunning).toBe(true);
    });

    it('should not be running after stop', async () => {
      await channel.start();
      await channel.stop();
      expect(channel.isRunning).toBe(false);
    });
  });

  describe('发送者权限控制', () => {
    it('should allow all senders when allowFrom is empty', async () => {
      const channelWithEmptyAllow = new TestChannel(bus, []);
      await channelWithEmptyAllow.testHandleInbound('user1', 'chat1', 'hello');

      expect(bus.publishedInbound).toHaveLength(1);
    });

    it('should allow only specified senders', async () => {
      const channelWithAllow = new TestChannel(bus, ['user1', 'user2']);
      await channelWithAllow.testHandleInbound('user1', 'chat1', 'hello');
      await channelWithAllow.testHandleInbound('user3', 'chat1', 'blocked');

      expect(bus.publishedInbound).toHaveLength(1);
      expect((bus.publishedInbound[0] as { senderId: string }).senderId).toBe('user1');
    });
  });

  describe('入站消息处理', () => {
    it('should publish inbound message with correct format', async () => {
      await channel.testHandleInbound('sender1', 'chat1', 'Hello World');

      const msg = bus.publishedInbound[0] as {
        channel: string;
        senderId: string;
        chatId: string;
        content: string;
        media: string[];
      };

      expect(msg.channel).toBe('feishu');
      expect(msg.senderId).toBe('sender1');
      expect(msg.chatId).toBe('chat1');
      expect(msg.content).toBe('Hello World');
      expect(msg.media).toEqual([]);
    });

    it('should include media in message', async () => {
      await channel.testHandleInbound('sender1', 'chat1', 'Check this', ['image.png']);

      const msg = bus.publishedInbound[0] as { media: string[] };
      expect(msg.media).toEqual(['image.png']);
    });
  });
});
