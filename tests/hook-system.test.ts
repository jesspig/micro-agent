import { describe, it, expect, beforeEach } from 'bun:test';
import { HookSystem } from '@micro-agent/sdk';

describe('HookSystem', () => {
  let hooks: HookSystem;

  beforeEach(() => {
    hooks = new HookSystem();
  });

  describe('registerHook', () => {
    it('should register and execute hook', async () => {
      hooks.registerHook('pre:inbound', (ctx) => ({ ...ctx, processed: true }));
      const result = await hooks.executeHooks('pre:inbound', { value: 1 });
      expect(result).toEqual({ value: 1, processed: true });
    });

    it('should execute hooks by priority', async () => {
      const order: number[] = [];
      hooks.registerHook('pre:inbound', (ctx) => { order.push(2); return ctx; }, 200);
      hooks.registerHook('pre:inbound', (ctx) => { order.push(1); return ctx; }, 100);
      hooks.registerHook('pre:inbound', (ctx) => { order.push(3); return ctx; }, 300);
      
      await hooks.executeHooks('pre:inbound', {});
      expect(order).toEqual([1, 2, 3]);
    });
  });

  describe('executeHooks', () => {
    it('should pass context through chain', async () => {
      hooks.registerHook('pre:inbound', (ctx) => ({ ...ctx, step1: true }));
      hooks.registerHook('pre:inbound', (ctx) => ({ ...ctx, step2: true }));
      
      const result = await hooks.executeHooks('pre:inbound', { original: true });
      expect(result).toEqual({ original: true, step1: true, step2: true });
    });

    it('should return original context if no hooks', async () => {
      const result = await hooks.executeHooks('pre:inbound', { value: 1 });
      expect(result).toEqual({ value: 1 });
    });

    it('should support async hooks', async () => {
      hooks.registerHook('pre:inbound', async (ctx) => {
        await new Promise(r => setTimeout(r, 10));
        return { ...ctx, async: true };
      });
      
      const result = await hooks.executeHooks('pre:inbound', {});
      expect(result).toEqual({ async: true });
    });
  });

  describe('clear', () => {
    it('should clear all hooks of a type', async () => {
      hooks.registerHook('pre:inbound', (ctx) => ({ ...ctx, modified: true }));
      hooks.clear('pre:inbound');
      
      const result = await hooks.executeHooks('pre:inbound', { original: true });
      expect(result).toEqual({ original: true });
    });
  });
});
