/**
 * 分层调度器测试
 *
 * 测试 LayeredScheduler 的核心功能：
 * - buildGraph 构建依赖图
 * - hasCycle 循环检测
 * - topologicalSort 拓扑排序
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { LayeredScheduler } from '../runtime/kernel/layered-scheduler';
import type { ExecutableTask } from '../runtime/kernel/priority-queue';

describe('LayeredScheduler', () => {
  let scheduler: LayeredScheduler;

  // 创建测试任务的辅助函数
  const createTask = (id: string, dependencies: string[] = []): ExecutableTask => ({
    id,
    description: `Task ${id}`,
    priority: 'normal',
    dependencies,
    execute: async () => `result-${id}`,
    status: 'pending',
  });

  beforeEach(() => {
    scheduler = new LayeredScheduler();
  });

  // =========================================================================
  // buildGraph 构建依赖图测试
  // =========================================================================

  describe('buildGraph', () => {
    it('应该正确构建依赖图', () => {
      const tasks = [
        createTask('a'),
        createTask('b', ['a']),
        createTask('c', ['a']),
      ];

      scheduler.buildGraph(tasks);
      const layers = scheduler.topologicalSort();

      expect(layers.length).toBeGreaterThan(0);
    });

    it('应该处理空任务列表', () => {
      scheduler.buildGraph([]);
      const layers = scheduler.topologicalSort();
      expect(layers).toEqual([]);
    });

    it('应该处理无依赖的任务', () => {
      const tasks = [
        createTask('a'),
        createTask('b'),
        createTask('c'),
      ];

      scheduler.buildGraph(tasks);
      const layers = scheduler.topologicalSort();

      // 所有任务应在同一层
      expect(layers.length).toBe(1);
      expect(layers[0].length).toBe(3);
    });
  });

  // =========================================================================
  // hasCycle 循环检测测试
  // =========================================================================

  describe('hasCycle', () => {
    it('无循环依赖时应返回 false', () => {
      const tasks = [
        createTask('a'),
        createTask('b', ['a']),
        createTask('c', ['b']),
      ];

      scheduler.buildGraph(tasks);
      expect(scheduler.hasCycle()).toBe(false);
    });

    it('简单循环依赖时应返回 true', () => {
      const tasks = [
        createTask('a', ['c']),
        createTask('b', ['a']),
        createTask('c', ['b']),
      ];

      scheduler.buildGraph(tasks);
      expect(scheduler.hasCycle()).toBe(true);
    });

    it('自引用循环依赖时应返回 true', () => {
      const tasks = [
        createTask('a', ['a']),
      ];

      scheduler.buildGraph(tasks);
      expect(scheduler.hasCycle()).toBe(true);
    });

    it('部分循环依赖时应返回 true', () => {
      const tasks = [
        createTask('a'),
        createTask('b', ['a']),
        createTask('c', ['d']),
        createTask('d', ['c']),
      ];

      scheduler.buildGraph(tasks);
      expect(scheduler.hasCycle()).toBe(true);
    });

    it('无依赖任务应无循环', () => {
      const tasks = [
        createTask('a'),
        createTask('b'),
        createTask('c'),
      ];

      scheduler.buildGraph(tasks);
      expect(scheduler.hasCycle()).toBe(false);
    });
  });

  // =========================================================================
  // topologicalSort 拓扑排序测试
  // =========================================================================

  describe('topologicalSort', () => {
    it('应该正确分层依赖任务', () => {
      const tasks = [
        createTask('a'),
        createTask('b', ['a']),
        createTask('c', ['a']),
        createTask('d', ['b', 'c']),
      ];

      scheduler.buildGraph(tasks);
      const layers = scheduler.topologicalSort();

      // 第一层: a
      // 第二层: b, c
      // 第三层: d
      expect(layers.length).toBe(3);
      expect(layers[0]).toEqual(['a']);
      expect(layers[1].sort()).toEqual(['b', 'c']);
      expect(layers[2]).toEqual(['d']);
    });

    it('无依赖任务应在同一层', () => {
      const tasks = [
        createTask('a'),
        createTask('b'),
        createTask('c'),
      ];

      scheduler.buildGraph(tasks);
      const layers = scheduler.topologicalSort();

      expect(layers.length).toBe(1);
      expect(layers[0].sort()).toEqual(['a', 'b', 'c']);
    });

    it('链式依赖应产生多层', () => {
      const tasks = [
        createTask('a'),
        createTask('b', ['a']),
        createTask('c', ['b']),
        createTask('d', ['c']),
      ];

      scheduler.buildGraph(tasks);
      const layers = scheduler.topologicalSort();

      expect(layers.length).toBe(4);
      expect(layers[0]).toEqual(['a']);
      expect(layers[1]).toEqual(['b']);
      expect(layers[2]).toEqual(['c']);
      expect(layers[3]).toEqual(['d']);
    });

    it('循环依赖时应抛出错误', () => {
      const tasks = [
        createTask('a', ['b']),
        createTask('b', ['a']),
      ];

      scheduler.buildGraph(tasks);
      expect(() => scheduler.topologicalSort()).toThrow('存在循环依赖');
    });

    it('应该处理菱形依赖', () => {
      //     a
      //    / \
      //   b   c
      //    \ /
      //     d
      const tasks = [
        createTask('a'),
        createTask('b', ['a']),
        createTask('c', ['a']),
        createTask('d', ['b', 'c']),
      ];

      scheduler.buildGraph(tasks);
      const layers = scheduler.topologicalSort();

      expect(layers.length).toBe(3);
      expect(layers[0]).toEqual(['a']);
      expect(layers[1].sort()).toEqual(['b', 'c']);
      expect(layers[2]).toEqual(['d']);
    });

    it('应该处理复杂依赖关系', () => {
      const tasks = [
        createTask('a'),
        createTask('b', ['a']),
        createTask('c', ['a']),
        createTask('d', ['b']),
        createTask('e', ['b', 'c']),
        createTask('f', ['d', 'e']),
      ];

      scheduler.buildGraph(tasks);
      const layers = scheduler.topologicalSort();

      // 验证层级顺序正确
      expect(layers.length).toBe(4);
      expect(layers[0]).toEqual(['a']);
      
      // 验证依赖顺序: b 和 c 必须在 d, e, f 之前
      const allTasks = layers.flat();
      expect(allTasks.indexOf('a')).toBeLessThan(allTasks.indexOf('b'));
      expect(allTasks.indexOf('a')).toBeLessThan(allTasks.indexOf('c'));
      expect(allTasks.indexOf('b')).toBeLessThan(allTasks.indexOf('d'));
      expect(allTasks.indexOf('b')).toBeLessThan(allTasks.indexOf('e'));
      expect(allTasks.indexOf('c')).toBeLessThan(allTasks.indexOf('e'));
      expect(allTasks.indexOf('d')).toBeLessThan(allTasks.indexOf('f'));
      expect(allTasks.indexOf('e')).toBeLessThan(allTasks.indexOf('f'));
    });
  });
});
