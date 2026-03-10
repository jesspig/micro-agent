/**
 * 资源监控器
 *
 * 监控和管理系统资源，支持并行执行的资源预测和可用性检查。
 */

import { getLogger } from '@logtape/logtape';

const log = getLogger(['kernel', 'resource-monitor']);

// ============================================================================
// 资源类型定义
// ============================================================================

/** 资源需求 */
export interface ResourceRequirement {
  /** CPU 使用率需求 (0-1) */
  cpu: number;
  /** 内存需求 (MB) */
  memory: number;
  /** LLM Token 需求 */
  llmTokens: number;
  /** 网络带宽需求 (Mbps)，可选 */
  networkBandwidth?: number;
}

/** 系统指标 */
export interface SystemMetrics {
  /** CPU 使用率 (0-1) */
  cpuUsage: number;
  /** 内存使用率 (0-1) */
  memoryUsage: number;
  /** 可用内存 (MB) */
  availableMemory: number;
  /** 总内存 (MB) */
  totalMemory: number;
  /** 更新时间戳 */
  timestamp: number;
}

/** LLM 指标 */
export interface LLMMetrics {
  /** 每分钟请求数 */
  requestsPerMinute: number;
  /** 已使用 Token 数 */
  tokensUsed: number;
  /** Token 限制 */
  tokenLimit: number;
  /** 当前活动请求数 */
  activeRequests: number;
  /** 最大并发请求数 */
  maxConcurrentRequests: number;
  /** 更新时间戳 */
  timestamp: number;
}

/** 网络指标 */
export interface NetworkMetrics {
  /** 活动连接数 */
  activeConnections: number;
  /** 带宽使用 (Mbps) */
  bandwidthUsage: number;
  /** 最大带宽 (Mbps) */
  maxBandwidth: number;
  /** 更新时间戳 */
  timestamp: number;
}

/** 资源可用性 */
export interface ResourceAvailability {
  /** 系统指标 */
  system: SystemMetrics;
  /** LLM 指标 */
  llm: LLMMetrics;
  /** 网络指标 */
  network: NetworkMetrics;
  /** 是否可以满足需求 */
  canSatisfy(requirement: ResourceRequirement): boolean;
  /** 获取资源余量 */
  getHeadroom(): ResourceRequirement;
}

// ============================================================================
// 任务类型资源预测映射
// ============================================================================

/** 任务类型 */
export type TaskType =
  | 'file-read'
  | 'file-write'
  | 'api-call'
  | 'llm-query'
  | 'database-query'
  | 'memory-operation'
  | 'knowledge-retrieval'
  | 'tool-execution'
  | 'unknown';

/** 任务类型资源预测映射表 */
const TASK_RESOURCE_PREDICTIONS: Record<TaskType, ResourceRequirement> = {
  'file-read': { cpu: 0.1, memory: 50, llmTokens: 0 },
  'file-write': { cpu: 0.1, memory: 50, llmTokens: 0 },
  'api-call': { cpu: 0.2, memory: 100, llmTokens: 0 },
  'llm-query': { cpu: 0.3, memory: 200, llmTokens: 2000 },
  'database-query': { cpu: 0.2, memory: 100, llmTokens: 0 },
  'memory-operation': { cpu: 0.05, memory: 30, llmTokens: 0 },
  'knowledge-retrieval': { cpu: 0.15, memory: 80, llmTokens: 0 },
  'tool-execution': { cpu: 0.1, memory: 50, llmTokens: 0 },
  'unknown': { cpu: 0.2, memory: 100, llmTokens: 500 },
};

// ============================================================================
// ResourceAvailabilityImpl 实现
// ============================================================================

/**
 * 资源可用性实现
 */
class ResourceAvailabilityImpl implements ResourceAvailability {
  constructor(
    public system: SystemMetrics,
    public llm: LLMMetrics,
    public network: NetworkMetrics,
  ) {}

  /**
   * 检查是否可以满足资源需求
   */
  canSatisfy(requirement: ResourceRequirement): boolean {
    // 检查 CPU
    const availableCpu = 1 - this.system.cpuUsage;
    if (availableCpu < requirement.cpu) {
      log.debug('[ResourceAvailability] CPU 资源不足', {
        available: availableCpu,
        required: requirement.cpu,
      });
      return false;
    }

    // 检查内存
    if (this.system.availableMemory < requirement.memory) {
      log.debug('[ResourceAvailability] 内存资源不足', {
        available: this.system.availableMemory,
        required: requirement.memory,
      });
      return false;
    }

    // 检查 LLM Token
    const availableTokens = this.llm.tokenLimit - this.llm.tokensUsed;
    if (availableTokens < requirement.llmTokens) {
      log.debug('[ResourceAvailability] LLM Token 不足', {
        available: availableTokens,
        required: requirement.llmTokens,
      });
      return false;
    }

    // 检查网络带宽（可选）
    if (requirement.networkBandwidth !== undefined) {
      const availableBandwidth = this.network.maxBandwidth - this.network.bandwidthUsage;
      if (availableBandwidth < requirement.networkBandwidth) {
        log.debug('[ResourceAvailability] 网络带宽不足', {
          available: availableBandwidth,
          required: requirement.networkBandwidth,
        });
        return false;
      }
    }

    return true;
  }

  /**
   * 获取资源余量
   */
  getHeadroom(): ResourceRequirement {
    return {
      cpu: 1 - this.system.cpuUsage,
      memory: this.system.availableMemory,
      llmTokens: this.llm.tokenLimit - this.llm.tokensUsed,
      networkBandwidth: this.network.maxBandwidth - this.network.bandwidthUsage,
    };
  }
}

// ============================================================================
// ResourceMonitor 实现
// ============================================================================

/** 资源监控器配置 */
export interface ResourceMonitorConfig {
  /** Token 限制，默认 128000 */
  tokenLimit?: number;
  /** 最大并发 LLM 请求数，默认 5 */
  maxConcurrentRequests?: number;
  /** 最大网络带宽 (Mbps)，默认 100 */
  maxBandwidth?: number;
  /** 指标更新间隔 (ms)，默认 5000 */
  updateInterval?: number;
}

/**
 * 资源监控器
 *
 * 负责监控系统资源使用情况，预测任务资源需求，提供资源可用性检查。
 */
export class ResourceMonitor {
  private systemMetrics: SystemMetrics;
  private llmMetrics: LLMMetrics;
  private networkMetrics: NetworkMetrics;
  private updateTimer?: Timer;
  private requestTimestamps: number[] = [];

  constructor(private config: ResourceMonitorConfig = {}) {
    const now = Date.now();

    // 初始化系统指标
    this.systemMetrics = {
      cpuUsage: 0,
      memoryUsage: 0,
      availableMemory: 0,
      totalMemory: 0,
      timestamp: now,
    };

    // 初始化 LLM 指标
    this.llmMetrics = {
      requestsPerMinute: 0,
      tokensUsed: 0,
      tokenLimit: config.tokenLimit ?? 128000,
      activeRequests: 0,
      maxConcurrentRequests: config.maxConcurrentRequests ?? 5,
      timestamp: now,
    };

    // 初始化网络指标
    this.networkMetrics = {
      activeConnections: 0,
      bandwidthUsage: 0,
      maxBandwidth: config.maxBandwidth ?? 100,
      timestamp: now,
    };

    log.info('[ResourceMonitor] 初始化完成', {
      tokenLimit: this.llmMetrics.tokenLimit,
      maxConcurrentRequests: this.llmMetrics.maxConcurrentRequests,
    });
  }

  /**
   * 启动自动更新
   */
  startAutoUpdate(): void {
    if (this.updateTimer) {
      return;
    }

    const interval = this.config.updateInterval ?? 5000;
    this.updateTimer = setInterval(() => {
      this.updateSystemMetrics();
    }, interval);

    log.info('[ResourceMonitor] 启动自动更新', { interval });
  }

  /**
   * 停止自动更新
   */
  stopAutoUpdate(): void {
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = undefined;
      log.info('[ResourceMonitor] 停止自动更新');
    }
  }

  /**
   * 更新系统指标
   */
  updateSystemMetrics(): void {
    const now = Date.now();

    // 获取内存信息 (Bun API)
    const memoryUsage = process.memoryUsage();
    const totalMemory = 16 * 1024; // 假设 16GB，实际应从系统获取
    const usedMemory = memoryUsage.heapUsed / (1024 * 1024);
    const availableMemory = totalMemory - usedMemory;

    // 估算 CPU 使用率
    // 注意：Bun 没有直接的 CPU 使用率 API，这里使用简化估算
    const cpuUsage = Math.min(1, usedMemory / totalMemory * 0.5);

    this.systemMetrics = {
      cpuUsage,
      memoryUsage: usedMemory / totalMemory,
      availableMemory,
      totalMemory,
      timestamp: now,
    };

    log.debug('[ResourceMonitor] 系统指标更新', {
      cpuUsage: cpuUsage.toFixed(2),
      memoryUsage: this.systemMetrics.memoryUsage.toFixed(2),
      availableMemory: `${availableMemory.toFixed(0)}MB`,
    });
  }

  /**
   * 更新 LLM 指标
   */
  updateLLMMetrics(update: {
    tokensUsed?: number;
    activeRequests?: number;
    requestCompleted?: boolean;
  }): void {
    const now = Date.now();

    // 更新 Token 使用
    if (update.tokensUsed !== undefined) {
      this.llmMetrics.tokensUsed += update.tokensUsed;
    }

    // 更新活动请求数
    if (update.activeRequests !== undefined) {
      this.llmMetrics.activeRequests = update.activeRequests;
    } else if (update.requestCompleted) {
      this.llmMetrics.activeRequests = Math.max(0, this.llmMetrics.activeRequests - 1);
    }

    // 记录请求时间戳，计算每分钟请求数
    if (update.requestCompleted) {
      this.requestTimestamps.push(now);
      // 只保留最近一分钟的记录
      const oneMinuteAgo = now - 60000;
      this.requestTimestamps = this.requestTimestamps.filter(t => t > oneMinuteAgo);
    }
    this.llmMetrics.requestsPerMinute = this.requestTimestamps.length;

    this.llmMetrics.timestamp = now;

    log.debug('[ResourceMonitor] LLM 指标更新', {
      tokensUsed: this.llmMetrics.tokensUsed,
      activeRequests: this.llmMetrics.activeRequests,
      requestsPerMinute: this.llmMetrics.requestsPerMinute,
    });
  }

  /**
   * 记录 LLM 请求开始
   */
  recordLLMRequestStart(): void {
    this.llmMetrics.activeRequests += 1;
    this.llmMetrics.timestamp = Date.now();
  }

  /**
   * 重置 LLM Token 计数（用于新会话或周期重置）
   */
  resetLLMTokenCount(): void {
    this.llmMetrics.tokensUsed = 0;
    this.llmMetrics.timestamp = Date.now();
    log.info('[ResourceMonitor] LLM Token 计数已重置');
  }

  /**
   * 更新网络指标
   */
  updateNetworkMetrics(update: {
    activeConnections?: number;
    bandwidthUsage?: number;
  }): void {
    const now = Date.now();

    if (update.activeConnections !== undefined) {
      this.networkMetrics.activeConnections = update.activeConnections;
    }
    if (update.bandwidthUsage !== undefined) {
      this.networkMetrics.bandwidthUsage = update.bandwidthUsage;
    }

    this.networkMetrics.timestamp = now;
  }

  /**
   * 获取当前资源可用性
   */
  getResourceAvailability(): ResourceAvailability {
    return new ResourceAvailabilityImpl(
      { ...this.systemMetrics },
      { ...this.llmMetrics },
      { ...this.networkMetrics },
    );
  }

  /**
   * 预测任务资源需求
   */
  predictResourceRequirement(taskType: TaskType): ResourceRequirement {
    const prediction = TASK_RESOURCE_PREDICTIONS[taskType];
    log.debug('[ResourceMonitor] 预测资源需求', {
      taskType,
      prediction,
    });
    return { ...prediction };
  }

  /**
   * 预测多个任务的资源需求总和
   */
  predictTotalRequirement(taskTypes: TaskType[]): ResourceRequirement {
    const total: ResourceRequirement = {
      cpu: 0,
      memory: 0,
      llmTokens: 0,
      networkBandwidth: 0,
    };

    for (const taskType of taskTypes) {
      const req = this.predictResourceRequirement(taskType);
      total.cpu = Math.max(total.cpu, req.cpu); // CPU 取最大值
      total.memory += req.memory; // 内存累加
      total.llmTokens += req.llmTokens; // Token 累加
      if (req.networkBandwidth) {
        total.networkBandwidth = Math.max(
          total.networkBandwidth ?? 0,
          req.networkBandwidth,
        );
      }
    }

    return total;
  }

  /**
   * 检查是否可以执行任务
   */
  canExecute(taskType: TaskType): boolean {
    const requirement = this.predictResourceRequirement(taskType);
    const availability = this.getResourceAvailability();
    return availability.canSatisfy(requirement);
  }

  /**
   * 检查是否可以并行执行多个任务
   */
  canExecuteParallel(taskTypes: TaskType[]): boolean {
    const totalRequirement = this.predictTotalRequirement(taskTypes);
    const availability = this.getResourceAvailability();

    // 额外检查并发请求数限制
    const llmTasks = taskTypes.filter(t => t === 'llm-query').length;
    if (this.llmMetrics.activeRequests + llmTasks > this.llmMetrics.maxConcurrentRequests) {
      log.debug('[ResourceMonitor] 超过最大并发请求数', {
        active: this.llmMetrics.activeRequests,
        requested: llmTasks,
        max: this.llmMetrics.maxConcurrentRequests,
      });
      return false;
    }

    return availability.canSatisfy(totalRequirement);
  }

  /**
   * 获取当前状态摘要
   */
  getStatusSummary(): {
    system: { cpuUsage: string; memoryUsage: string; availableMemory: string };
    llm: { tokensUsed: string; tokensRemaining: string; activeRequests: number };
    network: { activeConnections: number; bandwidthUsage: string };
  } {
    return {
      system: {
        cpuUsage: `${(this.systemMetrics.cpuUsage * 100).toFixed(1)}%`,
        memoryUsage: `${(this.systemMetrics.memoryUsage * 100).toFixed(1)}%`,
        availableMemory: `${this.systemMetrics.availableMemory.toFixed(0)}MB`,
      },
      llm: {
        tokensUsed: this.llmMetrics.tokensUsed.toString(),
        tokensRemaining: (this.llmMetrics.tokenLimit - this.llmMetrics.tokensUsed).toString(),
        activeRequests: this.llmMetrics.activeRequests,
      },
      network: {
        activeConnections: this.networkMetrics.activeConnections,
        bandwidthUsage: `${this.networkMetrics.bandwidthUsage.toFixed(1)}Mbps`,
      },
    };
  }
}
