/**
 * 错误处理器和恢复机制
 *
 * 职责：
 * 1. 错误分类和处理
 * 2. 重试策略执行
 * 3. 熔断器保护
 * 4. 检查点恢复
 */

import type { AgentState, AgentStateUpdate } from "./state";

// ============================================================================
// 错误类型定义
// ============================================================================

/** 错误类型枚举 */
export enum ErrorType {
  /** 可恢复错误：可通过重试恢复 */
  RECOVERABLE = "RECOVERABLE",
  /** 部分失败：部分功能受影响 */
  PARTIAL_FAILURE = "PARTIAL_FAILURE",
  /** 致命错误：无法恢复 */
  FATAL = "FATAL",
}

/** 退避策略类型 */
export type BackoffStrategy = "exponential" | "linear" | "fixed";

/** 重试策略 */
export interface RetryPolicy {
  /** 最大重试次数 */
  maxRetries: number;
  /** 退避策略 */
  backoffStrategy: BackoffStrategy;
  /** 初始延迟（毫秒） */
  initialDelay: number;
  /** 最大延迟（毫秒） */
  maxDelay: number;
}

/** 降级策略 */
export interface FallbackStrategy {
  /** 是否启用降级 */
  enabled: boolean;
  /** 降级处理函数 */
  handler?: (error: Error, context: ErrorContext) => Promise<AgentStateUpdate>;
  /** 降级返回值 */
  fallbackValue?: unknown;
}

/** 熔断器策略 */
export interface CircuitBreakerConfig {
  /** 失败阈值 */
  failureThreshold: number;
  /** 恢复超时（毫秒） */
  recoveryTimeout: number;
  /** 半开状态尝试次数 */
  halfOpenAttempts: number;
}

/** 错误处理策略 */
export interface ErrorHandlingStrategy {
  /** 重试策略 */
  retryPolicy: RetryPolicy;
  /** 降级策略 */
  fallbackStrategy: FallbackStrategy;
  /** 熔断器策略 */
  circuitBreaker: CircuitBreakerConfig;
}

/** 错误上下文 */
export interface ErrorContext {
  /** 错误发生时间 */
  timestamp: number;
  /** 当前迭代次数 */
  iteration: number;
  /** 重试次数 */
  retryCount: number;
  /** 相关状态 */
  state?: AgentState;
  /** 额外元数据 */
  metadata?: Record<string, unknown>;
}

/** 错误处理结果 */
export interface ErrorHandlingResult {
  /** 错误类型 */
  type: ErrorType;
  /** 是否已处理 */
  handled: boolean;
  /** 是否需要重试 */
  shouldRetry: boolean;
  /** 重试延迟（毫秒） */
  retryDelay?: number;
  /** 状态更新 */
  stateUpdate?: AgentStateUpdate;
  /** 错误消息 */
  message: string;
}

/** 检查点数据 */
export interface Checkpoint {
  /** 检查点 ID */
  id: string;
  /** 创建时间 */
  timestamp: number;
  /** 会话键 */
  sessionKey: string;
  /** 状态快照 */
  stateSnapshot: AgentState;
  /** 元数据 */
  metadata: Record<string, unknown>;
}

// ============================================================================
// 默认配置
// ============================================================================

/** 默认重试策略 */
const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxRetries: 3,
  backoffStrategy: "exponential",
  initialDelay: 1000,
  maxDelay: 30000,
};

/** 默认降级策略 */
const DEFAULT_FALLBACK_STRATEGY: FallbackStrategy = {
  enabled: false,
};

/** 默认熔断器配置 */
const DEFAULT_CIRCUIT_BREAKER: CircuitBreakerConfig = {
  failureThreshold: 5,
  recoveryTimeout: 60000,
  halfOpenAttempts: 1,
};

/** 默认错误处理策略 */
const DEFAULT_ERROR_STRATEGY: ErrorHandlingStrategy = {
  retryPolicy: DEFAULT_RETRY_POLICY,
  fallbackStrategy: DEFAULT_FALLBACK_STRATEGY,
  circuitBreaker: DEFAULT_CIRCUIT_BREAKER,
};

// ============================================================================
// 熔断器实现
// ============================================================================

/** 熔断器状态 */
type CircuitState = "closed" | "open" | "half-open";

/** 熔断器 */
class CircuitBreaker {
  private state: CircuitState = "closed";
  private failureCount = 0;
  private lastFailureTime = 0;
  private halfOpenSuccessCount = 0;

  constructor(private readonly config: CircuitBreakerConfig) {}

  /** 检查是否允许执行 */
  canExecute(): boolean {
    const now = Date.now();

    switch (this.state) {
      case "closed":
        return true;
      case "open":
        // 检查是否到达恢复时间
        if (now - this.lastFailureTime >= this.config.recoveryTimeout) {
          this.state = "half-open";
          this.halfOpenSuccessCount = 0;
          return true;
        }
        return false;
      case "half-open":
        return true;
    }
  }

  /** 记录成功 */
  recordSuccess(): void {
    if (this.state === "half-open") {
      this.halfOpenSuccessCount++;
      if (this.halfOpenSuccessCount >= this.config.halfOpenAttempts) {
        this.state = "closed";
        this.failureCount = 0;
      }
    } else if (this.state === "closed") {
      this.failureCount = 0;
    }
  }

  /** 记录失败 */
  recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === "half-open") {
      this.state = "open";
    } else if (this.failureCount >= this.config.failureThreshold) {
      this.state = "open";
    }
  }

  /** 获取当前状态 */
  getState(): CircuitState {
    return this.state;
  }

  /** 获取失败计数 */
  getFailureCount(): number {
    return this.failureCount;
  }

  /** 重置熔断器 */
  reset(): void {
    this.state = "closed";
    this.failureCount = 0;
    this.lastFailureTime = 0;
    this.halfOpenSuccessCount = 0;
  }
}

// ============================================================================
// 错误处理器
// ============================================================================

/**
 * 错误处理器
 *
 * 负责错误分类、重试计算和降级处理
 */
export class ErrorHandler {
  private readonly circuitBreaker: CircuitBreaker;

  constructor(private readonly strategy: ErrorHandlingStrategy = DEFAULT_ERROR_STRATEGY) {
    this.circuitBreaker = new CircuitBreaker(strategy.circuitBreaker);
  }

  /**
   * 处理错误
   *
   * @param error - 错误对象
   * @param context - 错误上下文
   * @returns 错误处理结果
   */
  async handleError(error: Error, context: ErrorContext): Promise<ErrorHandlingResult> {
    const errorType = this.classifyError(error);

    // 检查熔断器状态
    if (!this.circuitBreaker.canExecute()) {
      return {
        type: ErrorType.FATAL,
        handled: false,
        shouldRetry: false,
        message: "熔断器已打开，拒绝执行",
      };
    }

    // 根据错误类型处理
    switch (errorType) {
      case ErrorType.RECOVERABLE:
        return this.handleRecoverableError(error, context);
      case ErrorType.PARTIAL_FAILURE:
        return this.handlePartialFailure(error, context);
      case ErrorType.FATAL:
        return this.handleFatalError(error, context);
    }
  }

  /**
   * 处理可恢复错误
   */
  private async handleRecoverableError(
    error: Error,
    context: ErrorContext
  ): Promise<ErrorHandlingResult> {
    const { retryPolicy, fallbackStrategy } = this.strategy;

    // 检查是否可以重试
    if (context.retryCount < retryPolicy.maxRetries) {
      const delay = this.calculateBackoff(context.retryCount);

      return {
        type: ErrorType.RECOVERABLE,
        handled: true,
        shouldRetry: true,
        retryDelay: delay,
        message: `可恢复错误，将在 ${delay}ms 后重试 (${context.retryCount + 1}/${retryPolicy.maxRetries})`,
      };
    }

    // 重试次数已用尽，尝试降级
    if (fallbackStrategy.enabled && fallbackStrategy.handler) {
      const stateUpdate = await fallbackStrategy.handler(error, context);
      return {
        type: ErrorType.RECOVERABLE,
        handled: true,
        shouldRetry: false,
        stateUpdate,
        message: "重试次数已用尽，已执行降级处理",
      };
    }

    // 无法恢复
    this.circuitBreaker.recordFailure();
    return {
      type: ErrorType.RECOVERABLE,
      handled: false,
      shouldRetry: false,
      message: `重试次数已用尽: ${error.message}`,
    };
  }

  /**
   * 处理部分失败
   */
  private async handlePartialFailure(
    error: Error,
    context: ErrorContext
  ): Promise<ErrorHandlingResult> {
    const { fallbackStrategy } = this.strategy;

    if (fallbackStrategy.enabled && fallbackStrategy.handler) {
      const stateUpdate = await fallbackStrategy.handler(error, context);
      return {
        type: ErrorType.PARTIAL_FAILURE,
        handled: true,
        shouldRetry: false,
        stateUpdate,
        message: `部分功能失败，已执行降级处理: ${error.message}`,
      };
    }

    return {
      type: ErrorType.PARTIAL_FAILURE,
      handled: false,
      shouldRetry: false,
      message: `部分功能失败，无降级方案: ${error.message}`,
    };
  }

  /**
   * 处理致命错误
   */
  private handleFatalError(error: Error, _context: ErrorContext): ErrorHandlingResult {
    this.circuitBreaker.recordFailure();

    return {
      type: ErrorType.FATAL,
      handled: false,
      shouldRetry: false,
      message: `致命错误: ${error.message}`,
    };
  }

  /**
   * 计算退避时间
   *
   * @param attempt - 当前尝试次数
   * @returns 退避延迟（毫秒）
   */
  calculateBackoff(attempt: number): number {
    const { backoffStrategy, initialDelay, maxDelay } = this.strategy.retryPolicy;

    let delay: number;

    switch (backoffStrategy) {
      case "exponential":
        // initialDelay * 2^attempt
        delay = initialDelay * Math.pow(2, attempt);
        break;
      case "linear":
        // initialDelay * attempt
        delay = initialDelay * (attempt + 1);
        break;
      case "fixed":
        // initialDelay
        delay = initialDelay;
        break;
    }

    // 限制最大延迟
    return Math.min(delay, maxDelay);
  }

  /**
   * 错误分类
   *
   * 基于错误消息判断错误类型
   *
   * @param error - 错误对象
   * @returns 错误类型
   */
  classifyError(error: Error): ErrorType {
    const message = error.message.toLowerCase();

    // 可恢复错误：超时、网络问题
    if (
      message.includes("timeout") ||
      message.includes("etimedout") ||
      message.includes("econnrefused") ||
      message.includes("econnreset") ||
      message.includes("network") ||
      message.includes("socket hang up")
    ) {
      return ErrorType.RECOVERABLE;
    }

    // 可恢复错误：限流
    if (
      message.includes("rate limit") ||
      message.includes("429") ||
      message.includes("too many requests")
    ) {
      return ErrorType.RECOVERABLE;
    }

    // 致命错误：Token 预算
    if (
      message.includes("token budget") ||
      message.includes("context length") ||
      message.includes("max tokens")
    ) {
      return ErrorType.FATAL;
    }

    // 其他错误：部分失败
    return ErrorType.PARTIAL_FAILURE;
  }

  /**
   * 记录成功（更新熔断器状态）
   */
  recordSuccess(): void {
    this.circuitBreaker.recordSuccess();
  }

  /**
   * 获取熔断器状态
   */
  getCircuitBreakerState(): string {
    return this.circuitBreaker.getState();
  }

  /**
   * 重置熔断器
   */
  resetCircuitBreaker(): void {
    this.circuitBreaker.reset();
  }
}

// ============================================================================
// 恢复管理器
// ============================================================================

/**
 * 恢复管理器
 *
 * 负责检查点创建和状态恢复
 */
export class RecoveryManager {
  private readonly checkpoints: Map<string, Checkpoint> = new Map();
  private readonly maxCheckpoints: number;

  constructor(maxCheckpoints = 10) {
    this.maxCheckpoints = maxCheckpoints;
  }

  /**
   * 创建检查点
   *
   * @param sessionKey - 会话键
   * @param state - 当前状态
   * @param metadata - 元数据
   * @returns 检查点 ID
   */
  createCheckpoint(sessionKey: string, state: AgentState, metadata: Record<string, unknown> = {}): string {
    const id = this.generateCheckpointId(sessionKey);

    const checkpoint: Checkpoint = {
      id,
      timestamp: Date.now(),
      sessionKey,
      stateSnapshot: structuredClone(state) as AgentState,
      metadata,
    };

    this.checkpoints.set(id, checkpoint);
    this.cleanupOldCheckpoints(sessionKey);

    return id;
  }

  /**
   * 从检查点恢复
   *
   * @param checkpointId - 检查点 ID
   * @returns 状态快照，如果检查点不存在则返回 null
   */
  recoverFromCheckpoint(checkpointId: string): AgentState | null {
    const checkpoint = this.checkpoints.get(checkpointId);
    if (!checkpoint) {
      return null;
    }

    return structuredClone(checkpoint.stateSnapshot) as AgentState;
  }

  /**
   * 获取指定会话的最新检查点
   *
   * @param sessionKey - 会话键
   * @returns 最新的检查点，如果不存在则返回 null
   */
  getLatestCheckpoint(sessionKey: string): Checkpoint | null {
    const sessionCheckpoints = this.getSessionCheckpoints(sessionKey);
    if (sessionCheckpoints.length === 0) {
      return null;
    }

    // 按时间戳排序，返回最新的
    return sessionCheckpoints.sort((a, b) => b.timestamp - a.timestamp)[0];
  }

  /**
   * 清理旧检查点
   *
   * 保留最新的 N 个检查点
   *
   * @param sessionKey - 会话键
   */
  cleanupOldCheckpoints(sessionKey: string): void {
    const sessionCheckpoints = this.getSessionCheckpoints(sessionKey);

    if (sessionCheckpoints.length > this.maxCheckpoints) {
      // 按时间戳排序，删除最旧的
      const sorted = sessionCheckpoints.sort((a, b) => b.timestamp - a.timestamp);
      const toRemove = sorted.slice(this.maxCheckpoints);

      for (const checkpoint of toRemove) {
        this.checkpoints.delete(checkpoint.id);
      }
    }
  }

  /**
   * 删除指定检查点
   *
   * @param checkpointId - 检查点 ID
   * @returns 是否成功删除
   */
  deleteCheckpoint(checkpointId: string): boolean {
    return this.checkpoints.delete(checkpointId);
  }

  /**
   * 清理所有检查点
   */
  clearAllCheckpoints(): void {
    this.checkpoints.clear();
  }

  /**
   * 获取检查点数量
   */
  getCheckpointCount(): number {
    return this.checkpoints.size;
  }

  /**
   * 获取指定会话的所有检查点
   */
  private getSessionCheckpoints(sessionKey: string): Checkpoint[] {
    return Array.from(this.checkpoints.values()).filter((cp) => cp.sessionKey === sessionKey);
  }

  /**
   * 生成检查点 ID
   */
  private generateCheckpointId(sessionKey: string): string {
    return `${sessionKey}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  }
}

// ============================================================================
// 便捷函数
// ============================================================================

/**
 * 创建默认错误处理器
 */
export function createErrorHandler(strategy?: Partial<ErrorHandlingStrategy>): ErrorHandler {
  const fullStrategy: ErrorHandlingStrategy = {
    retryPolicy: { ...DEFAULT_RETRY_POLICY, ...strategy?.retryPolicy },
    fallbackStrategy: { ...DEFAULT_FALLBACK_STRATEGY, ...strategy?.fallbackStrategy },
    circuitBreaker: { ...DEFAULT_CIRCUIT_BREAKER, ...strategy?.circuitBreaker },
  };

  return new ErrorHandler(fullStrategy);
}

/**
 * 创建恢复管理器
 */
export function createRecoveryManager(maxCheckpoints?: number): RecoveryManager {
  return new RecoveryManager(maxCheckpoints);
}
