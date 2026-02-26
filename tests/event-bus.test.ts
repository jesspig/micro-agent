import { describe, it, expect, beforeEach } from 'bun:test';
import { EventBus } from '@micro-agent/sdk';

describe('EventBus', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new EventBus();
  });

  describe('on/off', () => {
    it('should subscribe and receive events', async () => {
      let received = false;
      bus.on('message:received', () => { received = true; });
      await bus.emit('message:received', {});
      expect(received).toBe(true);
    });

    it('should receive payload', async () => {
      let payload: unknown;
      bus.on('message:received', (p) => { payload = p; });
      await bus.emit('message:received', { content: 'hello' });
      expect(payload).toEqual({ content: 'hello' });
    });

    it('should unsubscribe', async () => {
      let count = 0;
      const handler = () => { count++; };
      bus.on('message:received', handler);
      await bus.emit('message:received', {});
      bus.off('message:received', handler);
      await bus.emit('message:received', {});
      expect(count).toBe(1);
    });
  });

  describe('once', () => {
    it('should fire only once', async () => {
      let count = 0;
      bus.once('system:started', () => { count++; });
      await bus.emit('system:started', {});
      await bus.emit('system:started', {});
      expect(count).toBe(1);
    });
  });

  describe('multiple handlers', () => {
    it('should call all handlers', async () => {
      const results: number[] = [];
      bus.on('message:received', () => { results.push(1); });
      bus.on('message:received', () => { results.push(2); });
      await bus.emit('message:received', {});
      expect(results).toEqual([1, 2]);
    });
  });
});
