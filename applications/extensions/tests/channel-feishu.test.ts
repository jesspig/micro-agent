import { describe, it, expect } from 'bun:test';
import { type MessageBus, type ChannelType, type OutboundMessage } from '@micro-agent/sdk';

// FeishuChannel 尚未迁移到新架构，暂时跳过相关测试

// Mock MessageBus
class MockBus {
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
  // FeishuChannel 尚未迁移到新架构，暂时跳过测试
  it.skip('should be migrated to new architecture', () => {
    expect(true).toBe(true);
  });
});