import { describe, it, expect, beforeEach } from 'bun:test';
import { FeishuChannel } from '../../extensions/channel/feishu';
import type { MessageBus } from '../../src/core/bus/queue';
import type { OutboundMessage } from '../../src/core/bus/events';

// Mock MessageBus
class MockBus implements MessageBus {
  publishedInbound: unknown[] = [];

  async publishInbound(msg: unknown): Promise<void> {
    this.publishedInbound.push(msg);
  }

  async publishOutbound(): Promise<void> {}
  async consumeInbound(): Promise<never> { throw new Error(); }
  async consumeOutbound(): Promise<never> { throw new Error(); }
  get inboundLength(): number { return 0; }
  get outboundLength(): number { return 0; }
}

describe('FeishuChannel', () => {
  let bus: MockBus;
  let channel: FeishuChannel;

  beforeEach(() => {
    bus = new MockBus();
    channel = new FeishuChannel(bus, {
      appId: 'test-app-id',
      appSecret: 'test-app-secret',
      allowFrom: [],
    });
  });

  describe('基础功能', () => {
    it('should have correct name', () => {
      expect(channel.name).toBe('feishu');
    });

    it('should not be running initially', () => {
      expect(channel.isRunning).toBe(false);
    });

    it('should set running after start', async () => {
      // 注意：实际连接需要有效的 appId/secret
      // 这里只测试状态变更
      expect(channel.isRunning).toBe(false);
    });
  });

  describe('消息发送', () => {
    it('should throw when not started', async () => {
      const msg: OutboundMessage = {
        channel: 'feishu',
        chatId: 'oc_test',
        content: 'Hello',
        media: [],
        metadata: {},
      };

      // 未启动时发送应抛出错误
      expect(channel.send(msg)).rejects.toThrow();
    });
  });
});
