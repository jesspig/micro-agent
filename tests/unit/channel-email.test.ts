import { describe, it, expect, beforeEach } from 'bun:test';
import { EmailChannel } from '../../src/channels/email';
import type { MessageBus } from '../../src/bus/queue';

class MockBus implements MessageBus {
  publishedInbound: unknown[] = [];
  async publishInbound(msg: unknown): Promise<void> { this.publishedInbound.push(msg); }
  async publishOutbound(): Promise<void> {}
  async consumeInbound(): Promise<never> { throw new Error(); }
  async consumeOutbound(): Promise<never> { throw new Error(); }
  get inboundLength(): number { return 0; }
  get outboundLength(): number { return 0; }
}

describe('EmailChannel', () => {
  let bus: MockBus;
  let channel: EmailChannel;

  beforeEach(() => {
    bus = new MockBus();
    channel = new EmailChannel(bus, {
      imapHost: 'imap.test.com',
      imapPort: 993,
      smtpHost: 'smtp.test.com',
      smtpPort: 587,
      user: 'test@test.com',
      password: 'test-password',
      allowFrom: [],
    });
  });

  describe('基础功能', () => {
    it('should have correct name', () => {
      expect(channel.name).toBe('email');
    });

    it('should not be running initially', () => {
      expect(channel.isRunning).toBe(false);
    });
  });
});
