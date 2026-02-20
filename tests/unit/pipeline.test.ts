import { describe, it, expect, beforeEach } from 'bun:test';
import { Pipeline } from '@microbot/core';

describe('Pipeline', () => {
  let pipeline: Pipeline<{ value: number; order?: number[] }>;

  beforeEach(() => {
    pipeline = new Pipeline<{ value: number; order?: number[] }>();
  });

  describe('use', () => {
    it('should execute middleware in order', async () => {
      const order: number[] = [];
      
      pipeline.use(async (ctx, next) => {
        order.push(1);
        await next();
      });
      pipeline.use(async (ctx, next) => {
        order.push(2);
        await next();
      });
      
      await pipeline.execute({ value: 0 });
      expect(order).toEqual([1, 2]);
    });

    it('should pass context through middleware', async () => {
      pipeline.use(async (ctx, next) => {
        ctx.value += 1;
        await next();
      });
      pipeline.use(async (ctx, next) => {
        ctx.value *= 2;
        await next();
      });
      
      const ctx = { value: 1 };
      await pipeline.execute(ctx);
      expect(ctx.value).toBe(4);
    });
  });

  describe('middleware can stop execution', () => {
    it('should stop if next is not called', async () => {
      let secondCalled = false;
      
      pipeline.use(async (ctx, next) => {
        // 不调用 next
      });
      pipeline.use(async (ctx, next) => {
        secondCalled = true;
        await next();
      });
      
      await pipeline.execute({ value: 0 });
      expect(secondCalled).toBe(false);
    });
  });

  describe('clear', () => {
    it('should clear all middleware', async () => {
      let called = false;
      pipeline.use(async (ctx, next) => {
        called = true;
        await next();
      });
      
      pipeline.clear();
      await pipeline.execute({ value: 0 });
      expect(called).toBe(false);
    });
  });

  describe('empty pipeline', () => {
    it('should work with no middleware', async () => {
      const ctx = { value: 1 };
      await pipeline.execute(ctx);
      expect(ctx.value).toBe(1);
    });
  });
});
