import { describe, it, expect, beforeEach } from 'bun:test';
import { DingTalkChannel } from '../../src/channels/dingtalk';
import type { MessageBus } from '../../src/bus/queue';

class MockBus implements MessageBus {
  async publishInbound(): Promise<void> {}
  async publishOutbound(): Promise<void> {}
  async consumeInbound(): Promise<never> { throw new Error(); }
  async consumeOutbound(): Promise<never> { throw new Error(); }
  get inboundLength(): number { return 0; }
  get outboundLength(): number { return 0; }
}

describe('DingTalkChannel', () => {
  let bus: MockBus;
  let channel: DingTalkChannel;

  beforeEach(() => {
    bus = new MockBus();
    channel = new DingTalkChannel(bus, {
      clientId: 'test-client-id',
      clientSecret: 'test-client-secret',
      allowFrom: [],
    });
  });

  describe('基础功能', () => {
    it('should have correct name', () => {
      expect(channel.name).toBe('dingtalk');
    });

    it('should not be running initially', () => {
      expect(channel.isRunning).toBe(false);
    });
  });
});
