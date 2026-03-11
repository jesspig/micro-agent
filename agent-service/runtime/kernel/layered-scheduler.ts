/**
 * 分层调度器
 *
 * 使用拓扑排序实现分层并行调度。
 */

import { getLogger } from '@logtape/logtape';
import type { ExecutableTask } from './priority-queue';
import { PriorityTaskQueue } from './priority-queue';
import type { AdaptiveConcurrencyController } from './concurrency-controller';

const log = getLogger(['kernel', 'layered-scheduler']);

// ============================================================================
// 类型定义
// ============================================================================

/** 执行结果 */
export interface TaskResult {
  taskId: string;
  success: boolean;
  result?: unknown;
  error?: Error;
  duration: number;
}

/** 调度结果 */
export interface ScheduleResult {
  /** 分层结果 */
  layers: string[][];
  /** 执行结果 */
  results: Map<string, TaskResult>;
  /** 总耗时 */
  totalDuration: number;
}

/** 依赖图节点 */
interface DependencyNode {
  taskId: string;
  dependencies: Set<string>;
  dependents: Set<string>;
}

// ============================================================================
// 分层调度器
// ============================================================================

/**
 * 分层调度器
 *
 * 核心算法：
 * 1. 构建依赖图
 * 2. 拓扑排序生成分层
 * 3. 同层任务并行执行
 */
export class LayeredScheduler {
  private dependencyGraph: Map<string, DependencyNode> = new Map();

  /**
   * 构建依赖图
   */
  buildGraph(tasks: ExecutableTask[]): void {
    this.dependencyGraph.clear();

    // 创建节点
    for (const task of tasks) {
      this.dependencyGraph.set(task.id, {
        taskId: task.id,
        dependencies: new Set(task.dependencies),
        dependents: new Set(),
      });
    }

    // 建立反向依赖
    for (const task of tasks) {
      for (const depId of task.dependencies) {
        const depNode = this.dependencyGraph.get(depId);
        if (depNode) {
          depNode.dependents.add(task.id);
        }
      }
    }

    log.debug('[LayeredScheduler] 依赖图构建完成', { nodeCount: this.dependencyGraph.size });
  }

  /**
   * 检测循环依赖（DFS）
   */
  hasCycle(): boolean {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const dfs = (taskId: string): boolean => {
      visited.add(taskId);
      recursionStack.add(taskId);

      const node = this.dependencyGraph.get(taskId);
      if (node) {
        for (const depId of node.dependencies) {
          if (!visited.has(depId)) {
            if (dfs(depId)) return true;
          } else if (recursionStack.has(depId)) {
            log.warn('[LayeredScheduler] 检测到循环依赖', { taskId, depId });
            return true;
          }
        }
      }

      recursionStack.delete(taskId);
      return false;
    };

    for (const taskId of this.dependencyGraph.keys()) {
      if (!visited.has(taskId)) {
        if (dfs(taskId)) return true;
      }
    }

    return false;
  }

  /**
   * Kahn 拓扑排序
   *
   * 返回分层结果，同层任务可并行执行。
   */
  topologicalSort(): string[][] {
    if (this.hasCycle()) {
      throw new Error('存在循环依赖，无法进行拓扑排序');
    }

    const layers: string[][] = [];
    const inDegree = new Map<string, number>();
    const remaining = new Set<string>();

    // 计算入度
    for (const [taskId, node] of this.dependencyGraph) {
      inDegree.set(taskId, node.dependencies.size);
      remaining.add(taskId);
    }

    while (remaining.size > 0) {
      // 找出所有入度为 0 的节点
      const layer: string[] = [];
      for (const taskId of remaining) {
        if (inDegree.get(taskId) === 0) {
          layer.push(taskId);
        }
      }

      if (layer.length === 0) {
        throw new Error('拓扑排序失败：存在未处理的依赖');
      }

      layers.push(layer);

      // 移除当前层节点并更新入度
      for (const taskId of layer) {
        remaining.delete(taskId);
        const node = this.dependencyGraph.get(taskId);
        if (node) {
          for (const dependentId of node.dependents) {
            const currentDegree = inDegree.get(dependentId) ?? 0;
            inDegree.set(dependentId, currentDegree - 1);
          }
        }
      }
    }

    log.debug('[LayeredScheduler] 拓扑排序完成', { layers: layers.length });
    return layers;
  }

  /**
   * 调度执行
   *
   * 按层并行执行任务，同层任务并发执行。
   */
  async scheduleExecution(
    tasks: ExecutableTask[],
    concurrencyController: AdaptiveConcurrencyController
  ): Promise<ScheduleResult> {
    const startTime = Date.now();
    const taskMap = new Map<string, ExecutableTask>();
    const results = new Map<string, TaskResult>();

    // 初始化任务
    for (const task of tasks) {
      taskMap.set(task.id, { ...task, status: 'pending' });
    }

    // 构建依赖图并分层
    this.buildGraph(tasks);
    const layers = this.topologicalSort();

    log.info('[LayeredScheduler] 开始分层执行', { layers: layers.length, totalTasks: tasks.length });

    // 按层执行
    for (let i = 0; i < layers.length; i++) {
      const layer = layers[i];
      const concurrency = concurrencyController.getCurrentConcurrency();

      log.debug('[LayeredScheduler] 执行层', { layer: i + 1, tasks: layer.length, concurrency });

      // 分批并行执行当前层任务
      const layerResults = await this.executeLayer(layer, taskMap, concurrency);

      // 更新结果和指标
      for (const result of layerResults) {
        results.set(result.taskId, result);
        concurrencyController.updateMetrics({
          avgLatency: result.duration,
          successRate: result.success ? 1 : 0,
        });
      }

      // 调整并发度
      concurrencyController.adjustConcurrency();
    }

    const totalDuration = Date.now() - startTime;
    log.info('[LayeredScheduler] 执行完成', { totalDuration, taskCount: results.size });

    return { layers, results, totalDuration };
  }

  /**
   * 执行单层任务
   */
  private async executeLayer(
    layerTaskIds: string[],
    taskMap: Map<string, ExecutableTask>,
    concurrency: number
  ): Promise<TaskResult[]> {
    const results: TaskResult[] = [];
    const queue = new PriorityTaskQueue();

    // 将层任务加入优先队列
    for (const taskId of layerTaskIds) {
      const task = taskMap.get(taskId);
      if (task && task.status === 'pending') {
        queue.enqueue(task);
      }
    }

    // 分批执行
    while (!queue.isEmpty()) {
      const batch = queue.dequeueBatch(concurrency);
      if (batch.length === 0) break;

      const batchResults = await Promise.all(
        batch.map(task => this.executeTask(task))
      );
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * 执行单个任务
   */
  private async executeTask(task: ExecutableTask): Promise<TaskResult> {
    const startTime = Date.now();
    task.status = 'running';

    try {
      log.debug('[LayeredScheduler] 执行任务', { taskId: task.id });
      const result = await task.execute();
      task.status = 'completed';
      task.result = result;

      return {
        taskId: task.id,
        success: true,
        result,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      task.status = 'failed';
      task.error = error instanceof Error ? error : new Error(String(error));

      log.error('[LayeredScheduler] 任务执行失败', { taskId: task.id, error: task.error.message });

      return {
        taskId: task.id,
        success: false,
        error: task.error,
        duration: Date.now() - startTime,
      };
    }
  }
}
