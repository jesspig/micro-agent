import { describe, it, expect, beforeEach } from 'bun:test';
import { WeComChannel } from '../../src/channels/wecom';
import type { MessageBus } from '../../src/bus/queue';

class MockBus implements MessageBus {
  async publishInbound(): Promise<void> {}
  async publishOutbound(): Promise<void> {}
  async consumeInbound(): Promise<never> { throw new Error(); }
  async consumeOutbound(): Promise<never> { throw new Error(); }
  get inboundLength(): number { return 0; }
  get outboundLength(): number { return 0; }
}

describe('WeComChannel', () => {
  let bus: MockBus;
  let channel: WeComChannel;

  beforeEach(() => {
    bus = new MockBus();
    channel = new WeComChannel(bus, {
      corpId: 'test-corp-id',
      agentId: 'test-agent-id',
      secret: 'test-secret',
      allowFrom: [],
    });
  });

  describe('基础功能', () => {
    it('should have correct name', () => {
      expect(channel.name).toBe('wecom');
    });

    it('should not be running initially', () => {
      expect(channel.isRunning).toBe(false);
    });
  });
});
