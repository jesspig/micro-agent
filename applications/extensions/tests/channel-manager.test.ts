import { describe, it, expect, beforeEach } from 'bun:test';
import { ChannelManager, ChannelHelper } from '@micro-agent/sdk';
import type { Channel, OutboundMessage, ChannelType } from '@micro-agent/types';
import type { MessageBus } from '@micro-agent/sdk';

class MockBus implements MessageBus {
  async publishInbound(): Promise<void> {}
  async publishOutbound(): Promise<void> {}
  async consumeInbound(): Promise<never> { throw new Error('Not implemented'); }
  async consumeOutbound(): Promise<never> { throw new Error('Not implemented'); }
  get inboundLength(): number { return 0; }
  get outboundLength(): number { return 0; }
}

class MockChannel implements Channel {
  readonly name: ChannelType;
  private helper: ChannelHelper;
  private _running = false;
  startCalled = false;
  stopCalled = false;
  lastMessage: OutboundMessage | null = null;

  constructor(name: string, allowFrom: string[] = []) {
    this.name = name as ChannelType;
    this.helper = new ChannelHelper(new MockBus(), allowFrom);
  }

  get isRunning(): boolean {
    return this._running;
  }

  async start(): Promise<void> {
    this._running = true;
    this.startCalled = true;
  }

  async stop(): Promise<void> {
    this._running = false;
    this.stopCalled = true;
  }

  async send(msg: OutboundMessage): Promise<void> {
    this.lastMessage = msg;
  }
}

describe('ChannelManager', () => {
  let manager: ChannelManager;

  beforeEach(() => {
    manager = new ChannelManager();
  });

  describe('通道注册', () => {
    it('should register channel', () => {
      const channel = new MockChannel('feishu');
      manager.register(channel);

      expect(manager.getRunningChannels()).toHaveLength(0);
    });

    it('should throw for duplicate channel', () => {
      const channel1 = new MockChannel('feishu');
      const channel2 = new MockChannel('feishu');

      manager.register(channel1);
      expect(() => manager.register(channel2)).toThrow('通道已注册');
    });
  });

  describe('通道启动和停止', () => {
    it('should start all channels', async () => {
      const channel1 = new MockChannel('feishu');
      const channel2 = new MockChannel('qq');

      manager.register(channel1);
      manager.register(channel2);

      await manager.startAll();

      expect(channel1.startCalled).toBe(true);
      expect(channel2.startCalled).toBe(true);
      expect(manager.getRunningChannels()).toContain('feishu');
      expect(manager.getRunningChannels()).toContain('qq');
    });

    it('should stop all channels', async () => {
      const channel = new MockChannel('feishu');
      manager.register(channel);
      await manager.startAll();

      await manager.stopAll();

      expect(channel.stopCalled).toBe(true);
      expect(manager.getRunningChannels()).toHaveLength(0);
    });
  });

  describe('消息发送', () => {
    it('should send message to correct channel', async () => {
      const feishuChannel = new MockChannel('feishu');
      const qqChannel = new MockChannel('qq');

      manager.register(feishuChannel);
      manager.register(qqChannel);

      const msg: OutboundMessage = {
        channel: 'feishu' as ChannelType,
        chatId: 'chat1',
        content: 'Hello',
        media: [],
        metadata: {},
      };

      await manager.send(msg);

      expect(feishuChannel.lastMessage).toEqual(msg);
      expect(qqChannel.lastMessage).toBeNull();
    });

    it('should throw for unregistered channel', async () => {
      const msg: OutboundMessage = {
        channel: 'feishu' as ChannelType,
        chatId: 'chat1',
        content: 'Hello',
        media: [],
        metadata: {},
      };

      expect(manager.send(msg)).rejects.toThrow('通道不存在');
    });
  });

  describe('运行状态', () => {
    it('should return empty array when no channels running', () => {
      expect(manager.getRunningChannels()).toHaveLength(0);
    });

    it('should return only running channels', async () => {
      const runningChannel = new MockChannel('feishu');
      const stoppedChannel = new MockChannel('qq');

      manager.register(runningChannel);
      manager.register(stoppedChannel);

      await runningChannel.start();

      const running = manager.getRunningChannels();
      expect(running).toContain('feishu');
      expect(running).not.toContain('qq');
    });
  });
});
