/**
 * 优先级队列测试
 *
 * 测试 PriorityTaskQueue 的核心功能：
 * - enqueue 按优先级排序
 * - dequeue 取出最高优先级
 * - dequeueBatch 批量获取
 * - size/isEmpty 状态查询
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { PriorityTaskQueue, type ExecutableTask } from '../runtime/kernel/priority-queue';

describe('PriorityTaskQueue', () => {
  let queue: PriorityTaskQueue;

  // 创建测试任务的辅助函数
  const createTask = (id: string, priority: ExecutableTask['priority']): ExecutableTask => ({
    id,
    description: `Task ${id}`,
    priority,
    dependencies: [],
    execute: async () => `result-${id}`,
    status: 'pending',
  });

  beforeEach(() => {
    queue = new PriorityTaskQueue();
  });

  // =========================================================================
  // enqueue 按优先级排序测试
  // =========================================================================

  describe('enqueue', () => {
    it('应该将任务按优先级降序插入', () => {
      const lowTask = createTask('low', 'low');
      const highTask = createTask('high', 'high');
      const criticalTask = createTask('critical', 'critical');
      const normalTask = createTask('normal', 'normal');

      // 乱序添加
      queue.enqueue(lowTask);
      queue.enqueue(highTask);
      queue.enqueue(criticalTask);
      queue.enqueue(normalTask);

      // 验证顺序: critical > high > normal > low
      const tasks = queue.getAll();
      expect(tasks[0].id).toBe('critical');
      expect(tasks[1].id).toBe('high');
      expect(tasks[2].id).toBe('normal');
      expect(tasks[3].id).toBe('low');
    });

    it('相同优先级应保持添加顺序（FIFO）', () => {
      const task1 = createTask('task1', 'normal');
      const task2 = createTask('task2', 'normal');
      const task3 = createTask('task3', 'normal');

      queue.enqueue(task1);
      queue.enqueue(task2);
      queue.enqueue(task3);

      const tasks = queue.getAll();
      expect(tasks[0].id).toBe('task1');
      expect(tasks[1].id).toBe('task2');
      expect(tasks[2].id).toBe('task3');
    });

    it('应该正确处理所有四种优先级', () => {
      queue.enqueue(createTask('low1', 'low'));
      queue.enqueue(createTask('critical1', 'critical'));
      queue.enqueue(createTask('high1', 'high'));
      queue.enqueue(createTask('normal1', 'normal'));

      const tasks = queue.getAll();
      expect(tasks.map(t => t.priority)).toEqual(['critical', 'high', 'normal', 'low']);
    });
  });

  // =========================================================================
  // dequeue 取出最高优先级测试
  // =========================================================================

  describe('dequeue', () => {
    it('应该取出最高优先级任务', () => {
      queue.enqueue(createTask('low', 'low'));
      queue.enqueue(createTask('critical', 'critical'));
      queue.enqueue(createTask('high', 'high'));

      const task = queue.dequeue();
      expect(task?.id).toBe('critical');
      expect(queue.size).toBe(2);
    });

    it('空队列应该返回 undefined', () => {
      const task = queue.dequeue();
      expect(task).toBeUndefined();
    });

    it('连续 dequeue 应按优先级顺序返回', () => {
      queue.enqueue(createTask('low', 'low'));
      queue.enqueue(createTask('critical', 'critical'));
      queue.enqueue(createTask('high', 'high'));
      queue.enqueue(createTask('normal', 'normal'));

      expect(queue.dequeue()?.id).toBe('critical');
      expect(queue.dequeue()?.id).toBe('high');
      expect(queue.dequeue()?.id).toBe('normal');
      expect(queue.dequeue()?.id).toBe('low');
      expect(queue.dequeue()).toBeUndefined();
    });
  });

  // =========================================================================
  // dequeueBatch 批量获取测试
  // =========================================================================

  describe('dequeueBatch', () => {
    it('应该批量获取指定数量的任务', () => {
      queue.enqueue(createTask('task1', 'high'));
      queue.enqueue(createTask('task2', 'high'));
      queue.enqueue(createTask('task3', 'normal'));

      const batch = queue.dequeueBatch(2);
      expect(batch.length).toBe(2);
      expect(batch.map(t => t.id)).toEqual(['task1', 'task2']);
      expect(queue.size).toBe(1);
    });

    it('请求数量超过队列大小时应返回全部', () => {
      queue.enqueue(createTask('task1', 'normal'));
      queue.enqueue(createTask('task2', 'normal'));

      const batch = queue.dequeueBatch(10);
      expect(batch.length).toBe(2);
      expect(queue.isEmpty()).toBe(true);
    });

    it('应该支持过滤器', () => {
      queue.enqueue(createTask('task1', 'high'));
      queue.enqueue(createTask('task2', 'low'));
      queue.enqueue(createTask('task3', 'high'));

      const batch = queue.dequeueBatch(2, t => t.priority === 'high');
      expect(batch.length).toBe(2);
      expect(batch.every(t => t.priority === 'high')).toBe(true);
      // 低优先级任务应保留在队列中
      expect(queue.size).toBe(1);
      expect(queue.getAll()[0].id).toBe('task2');
    });

    it('空队列应返回空数组', () => {
      const batch = queue.dequeueBatch(5);
      expect(batch).toEqual([]);
    });
  });

  // =========================================================================
  // size/isEmpty 状态查询测试
  // =========================================================================

  describe('size 和 isEmpty', () => {
    it('新队列应该为空', () => {
      expect(queue.isEmpty()).toBe(true);
      expect(queue.size).toBe(0);
    });

    it('添加任务后 size 应正确反映', () => {
      queue.enqueue(createTask('task1', 'normal'));
      expect(queue.isEmpty()).toBe(false);
      expect(queue.size).toBe(1);

      queue.enqueue(createTask('task2', 'normal'));
      expect(queue.size).toBe(2);
    });

    it('取出任务后 size 应更新', () => {
      queue.enqueue(createTask('task1', 'normal'));
      queue.enqueue(createTask('task2', 'normal'));

      queue.dequeue();
      expect(queue.size).toBe(1);

      queue.dequeue();
      expect(queue.isEmpty()).toBe(true);
      expect(queue.size).toBe(0);
    });
  });
});
