import { describe, it, expect, beforeEach } from 'bun:test';
import { ContainerImpl } from '../../src/core/container';

describe('Container', () => {
  let container: ContainerImpl;

  beforeEach(() => {
    container = new ContainerImpl();
  });

  describe('register', () => {
    it('should register transient factory', () => {
      let count = 0;
      container.register('counter', () => ++count);

      expect(container.resolve('counter')).toBe(1);
      expect(container.resolve('counter')).toBe(2);
    });

    it('should register different tokens', () => {
      container.register('a', () => 'value-a');
      container.register('b', () => 'value-b');

      expect(container.resolve('a')).toBe('value-a');
      expect(container.resolve('b')).toBe('value-b');
    });
  });

  describe('singleton', () => {
    it('should return same instance', () => {
      const obj = { value: 1 };
      container.singleton('obj', () => obj);

      expect(container.resolve('obj')).toBe(obj);
      expect(container.resolve('obj')).toBe(obj);
    });

    it('should call factory only once', () => {
      let callCount = 0;
      container.singleton('lazy', () => ({ count: ++callCount }));

      container.resolve('lazy');
      container.resolve('lazy');

      expect(callCount).toBe(1);
    });
  });

  describe('resolve', () => {
    it('should throw for unregistered token', () => {
      expect(() => container.resolve('unknown')).toThrow('未注册依赖: unknown');
    });
  });

  describe('has', () => {
    it('should return true for registered token', () => {
      container.register('test', () => 'value');
      expect(container.has('test')).toBe(true);
    });

    it('should return false for unregistered token', () => {
      expect(container.has('unknown')).toBe(false);
    });
  });
});
