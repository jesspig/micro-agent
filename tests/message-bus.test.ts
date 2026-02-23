import { describe, it, expect, beforeEach } from 'bun:test';
import { MessageBus } from '@microbot/sdk';

describe('MessageBus', () => {
  let bus: MessageBus;

  beforeEach(() => {
    bus = new MessageBus();
  });

  describe('inbound', () => {
    it('should publish and consume inbound message', async () => {
      const msg = {
        channel: 'feishu' as const,
        senderId: 'user-1',
        chatId: 'chat-1',
        content: 'hello',
        timestamp: new Date(),
        media: [],
        metadata: {},
      };

      await bus.publishInbound(msg);
      const received = await bus.consumeInbound();

      expect(received).toEqual(msg);
    });

    it('should maintain queue order', async () => {
      await bus.publishInbound({ channel: 'feishu', senderId: '1', chatId: 'c', content: 'a', timestamp: new Date(), media: [], metadata: {} });
      await bus.publishInbound({ channel: 'feishu', senderId: '2', chatId: 'c', content: 'b', timestamp: new Date(), media: [], metadata: {} });

      const first = await bus.consumeInbound();
      const second = await bus.consumeInbound();

      expect(first.content).toBe('a');
      expect(second.content).toBe('b');
    });

    it('should return correct queue length', async () => {
      expect(bus.inboundLength).toBe(0);
      
      await bus.publishInbound({ channel: 'feishu', senderId: '1', chatId: 'c', content: 'a', timestamp: new Date(), media: [], metadata: {} });
      expect(bus.inboundLength).toBe(1);
      
      await bus.consumeInbound();
      expect(bus.inboundLength).toBe(0);
    });
  });

  describe('outbound', () => {
    it('should publish and consume outbound message', async () => {
      const msg = {
        channel: 'feishu' as const,
        chatId: 'chat-1',
        content: 'reply',
        media: [],
        metadata: {},
      };

      await bus.publishOutbound(msg);
      const received = await bus.consumeOutbound();

      expect(received).toEqual(msg);
    });
  });

  describe('async consume', () => {
    it('should wait for message if queue is empty', async () => {
      let resolved = false;
      const promise = bus.consumeInbound().then(() => { resolved = true; });
      
      // 此时还没有消息，promise 未 resolve
      await new Promise(r => setTimeout(r, 10));
      expect(resolved).toBe(false);
      
      // 发布消息后，promise 应该 resolve
      await bus.publishInbound({ channel: 'feishu', senderId: '1', chatId: 'c', content: 'a', timestamp: new Date(), media: [], metadata: {} });
      await promise;
      expect(resolved).toBe(true);
    });
  });
});
