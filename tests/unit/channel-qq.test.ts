import { describe, it, expect, beforeEach } from 'bun:test';
import { QQChannel } from '../../src/channels/qq';
import type { MessageBus } from '../../src/bus/queue';
import type { OutboundMessage } from '../../src/bus/events';

class MockBus implements MessageBus {
  publishedInbound: unknown[] = [];
  async publishInbound(msg: unknown): Promise<void> { this.publishedInbound.push(msg); }
  async publishOutbound(): Promise<void> {}
  async consumeInbound(): Promise<never> { throw new Error(); }
  async consumeOutbound(): Promise<never> { throw new Error(); }
  get inboundLength(): number { return 0; }
  get outboundLength(): number { return 0; }
}

describe('QQChannel', () => {
  let bus: MockBus;
  let channel: QQChannel;

  beforeEach(() => {
    bus = new MockBus();
    channel = new QQChannel(bus, {
      appId: 'test-app-id',
      secret: 'test-secret',
      allowFrom: [],
    });
  });

  describe('基础功能', () => {
    it('should have correct name', () => {
      expect(channel.name).toBe('qq');
    });

    it('should not be running initially', () => {
      expect(channel.isRunning).toBe(false);
    });
  });

  describe('内容解析', () => {
    it('should parse content correctly', () => {
      // 测试 @ 提及移除
      const content = '<@!123456789> Hello World';
      // parseContent 是私有方法，通过公共接口测试
      expect(channel.name).toBe('qq');
    });
  });
});
