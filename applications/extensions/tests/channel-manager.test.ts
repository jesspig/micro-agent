import { describe, it, expect, beforeEach } from 'bun:test';
import { type Channel, type ChannelType } from '@micro-agent/sdk';

// ChannelManager 和 ChannelHelper 尚未迁移到新 SDK，使用简化实现测试

/**
 * 简单的通道管理器实现（用于测试）
 */
class SimpleChannelManager {
  private channels = new Map<string, Channel>();

  register(channel: Channel): void {
    if (this.channels.has(channel.name)) {
      throw new Error('通道已注册');
    }
    this.channels.set(channel.name, channel);
  }

  unregister(name: string): void {
    this.channels.delete(name);
  }

  async startAll(): Promise<void> {
    for (const channel of this.channels.values()) {
      await channel.start();
    }
  }

  async stopAll(): Promise<void> {
    for (const channel of this.channels.values()) {
      await channel.stop();
    }
  }

  getRunningChannels(): string[] {
    return Array.from(this.channels.values())
      .filter(c => c.isRunning)
      .map(c => c.name as string);
  }

  async send(msg: { channel: ChannelType; chatId: string; content: string; replyTo?: string; media?: string[]; metadata?: Record<string, unknown> }): Promise<void> {
    const channel = this.channels.get(msg.channel as string);
    if (!channel) {
      throw new Error('通道不存在');
    }
    await channel.send(msg);
  }
}

/**
 * Mock Channel 实现
 */
class MockChannel implements Channel {
  readonly name: ChannelType;
  private _running = false;
  startCalled = false;
  stopCalled = false;
  lastMessage: { channel: ChannelType; chatId: string; content: string } | null = null;

  constructor(name: string) {
    this.name = name as ChannelType;
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

  async send(msg: { channel: ChannelType; chatId: string; content: string; replyTo?: string; media?: string[]; metadata?: Record<string, unknown> }): Promise<void> {
    this.lastMessage = msg;
  }
}

describe('SimpleChannelManager', () => {
  let manager: SimpleChannelManager;

  beforeEach(() => {
    manager = new SimpleChannelManager();
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

      const msg = {
        channel: 'feishu' as ChannelType,
        chatId: 'chat1',
        content: 'Hello',
      };

      await manager.send(msg);

      expect(feishuChannel.lastMessage).toEqual(msg);
      expect(qqChannel.lastMessage).toBeNull();
    });

    it('should throw for unregistered channel', async () => {
      const msg = {
        channel: 'feishu' as ChannelType,
        chatId: 'chat1',
        content: 'Hello',
      };

      await expect(manager.send(msg)).rejects.toThrow('通道不存在');
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