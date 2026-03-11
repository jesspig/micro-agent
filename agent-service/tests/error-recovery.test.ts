/**
 * 错误处理测试
 *
 * 测试 ErrorHandler 和 RecoveryManager 的核心功能：
 * - ErrorHandler.handleError
 * - calculateBackoff 退避计算
 * - classifyError 错误分类
 * - RecoveryManager 检查点功能
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
  ErrorHandler,
  RecoveryManager,
  ErrorType,
  type ErrorContext,
  type ErrorHandlingStrategy,
} from '../runtime/kernel/error-recovery';

describe('ErrorHandler', () => {
  let errorHandler: ErrorHandler;

  const createContext = (overrides: Partial<ErrorContext> = {}): ErrorContext => ({
    timestamp: Date.now(),
    iteration: 0,
    retryCount: 0,
    ...overrides,
  });

  beforeEach(() => {
    errorHandler = new ErrorHandler();
  });

  // =========================================================================
  // classifyError 错误分类测试
  // =========================================================================

  describe('classifyError', () => {
    it('超时错误应分类为可恢复', () => {
      const error = new Error('Connection timeout');
      expect(errorHandler.classifyError(error)).toBe(ErrorType.RECOVERABLE);
    });

    it('网络错误应分类为可恢复', () => {
      const errors = [
        new Error('ECONNREFUSED'),
        new Error('ECONNRESET'),
        new Error('Network error'),
        new Error('socket hang up'),
      ];

      for (const error of errors) {
        expect(errorHandler.classifyError(error)).toBe(ErrorType.RECOVERABLE);
      }
    });

    it('限流错误应分类为可恢复', () => {
      const errors = [
        new Error('Rate limit exceeded'),
        new Error('429 Too Many Requests'),
        new Error('too many requests'),
      ];

      for (const error of errors) {
        expect(errorHandler.classifyError(error)).toBe(ErrorType.RECOVERABLE);
      }
    });

    it('Token 预算错误应分类为致命', () => {
      const errors = [
        new Error('Token budget exceeded'),
        new Error('Context length exceeded'),
        new Error('Max tokens reached'),
      ];

      for (const error of errors) {
        expect(errorHandler.classifyError(error)).toBe(ErrorType.FATAL);
      }
    });

    it('其他错误应分类为部分失败', () => {
      const error = new Error('Unknown error');
      expect(errorHandler.classifyError(error)).toBe(ErrorType.PARTIAL_FAILURE);
    });
  });

  // =========================================================================
  // calculateBackoff 退避计算测试
  // =========================================================================

  describe('calculateBackoff', () => {
    it('指数退避应正确计算', () => {
      // 默认策略: exponential, initialDelay=1000, maxDelay=30000
      expect(errorHandler.calculateBackoff(0)).toBe(1000); // 1000 * 2^0 = 1000
      expect(errorHandler.calculateBackoff(1)).toBe(2000); // 1000 * 2^1 = 2000
      expect(errorHandler.calculateBackoff(2)).toBe(4000); // 1000 * 2^2 = 4000
    });

    it('退避时间不应超过最大延迟', () => {
      // 当 attempt 很大时，延迟会被限制在 maxDelay
      const largeAttempt = 100;
      const backoff = errorHandler.calculateBackoff(largeAttempt);
      expect(backoff).toBe(30000); // maxDelay
    });

    it('应该使用配置的策略', () => {
      const customStrategy: ErrorHandlingStrategy = {
        retryPolicy: {
          maxRetries: 3,
          backoffStrategy: 'linear',
          initialDelay: 500,
          maxDelay: 5000,
        },
        fallbackStrategy: { enabled: false },
        circuitBreaker: { failureThreshold: 5, recoveryTimeout: 60000, halfOpenAttempts: 1 },
      };

      const customHandler = new ErrorHandler(customStrategy);
      
      expect(customHandler.calculateBackoff(0)).toBe(500);  // 500 * 1 = 500
      expect(customHandler.calculateBackoff(1)).toBe(1000); // 500 * 2 = 1000
      expect(customHandler.calculateBackoff(2)).toBe(1500); // 500 * 3 = 1500
    });
  });

  // =========================================================================
  // handleError 错误处理测试
  // =========================================================================

  describe('handleError', () => {
    it('可恢复错误应返回重试建议', async () => {
      const error = new Error('Connection timeout');
      const context = createContext({ retryCount: 0 });
      const result = await errorHandler.handleError(error, context);

      expect(result.type).toBe(ErrorType.RECOVERABLE);
      expect(result.shouldRetry).toBe(true);
      expect(result.retryDelay).toBeDefined();
      expect(result.handled).toBe(true);
    });

    it('超过最大重试次数应不再重试', async () => {
      const error = new Error('Connection timeout');
      const context = createContext({ retryCount: 3 }); // 默认 maxRetries = 3
      const result = await errorHandler.handleError(error, context);

      expect(result.shouldRetry).toBe(false);
    });

    it('致命错误应立即返回', async () => {
      const error = new Error('Token budget exceeded');
      const context = createContext();
      const result = await errorHandler.handleError(error, context);

      expect(result.type).toBe(ErrorType.FATAL);
      expect(result.shouldRetry).toBe(false);
      expect(result.handled).toBe(false);
    });

    it('部分失败应返回正确结果', async () => {
      const error = new Error('Some partial error');
      const context = createContext();
      const result = await errorHandler.handleError(error, context);

      expect(result.type).toBe(ErrorType.PARTIAL_FAILURE);
      expect(result.shouldRetry).toBe(false);
    });
  });

  // =========================================================================
  // 熔断器测试
  // =========================================================================

  describe('熔断器功能', () => {
    it('初始状态应为 closed', () => {
      expect(errorHandler.getCircuitBreakerState()).toBe('closed');
    });

    it('记录成功应保持 closed 状态', () => {
      errorHandler.recordSuccess();
      expect(errorHandler.getCircuitBreakerState()).toBe('closed');
    });

    it('重置熔断器应恢复到 closed 状态', () => {
      // 触发多次失败
      const error = new Error('Token budget exceeded');
      const context = createContext();
      
      for (let i = 0; i < 5; i++) {
        errorHandler.handleError(error, context);
      }

      errorHandler.resetCircuitBreaker();
      expect(errorHandler.getCircuitBreakerState()).toBe('closed');
    });
  });
});

// ============================================================================
// RecoveryManager 测试
// ============================================================================

describe('RecoveryManager', () => {
  let manager: RecoveryManager;

  // 使用类型断言避免 AgentState 类型检查问题
  const createMockState = (value: number) => ({
    iterations: value,
    messages: [],
    metadata: { test: value },
  }) as unknown as import('../runtime/kernel/state').AgentState;

  beforeEach(() => {
    manager = new RecoveryManager(3); // 最多保留 3 个检查点
  });

  // =========================================================================
  // createCheckpoint 检查点创建测试
  // =========================================================================

  describe('createCheckpoint', () => {
    it('应该成功创建检查点', () => {
      const state = createMockState(1);
      const id = manager.createCheckpoint('session-1', state, { step: 'test' });

      expect(id).toBeDefined();
      expect(id.startsWith('session-1')).toBe(true);
      expect(manager.getCheckpointCount()).toBe(1);
    });

    it('检查点应包含状态快照', () => {
      const state = createMockState(1);
      const id = manager.createCheckpoint('session-1', state);

      const recovered = manager.recoverFromCheckpoint(id);
      expect(recovered).toEqual(state);
    });

    it('状态快照应为深拷贝', () => {
      const state = createMockState(1);
      const id = manager.createCheckpoint('session-1', state);

      // 修改原状态
      state.iterations = 999;

      const recovered = manager.recoverFromCheckpoint(id);
      expect(recovered?.iterations).toBe(1); // 应保持原值
    });
  });

  // =========================================================================
  // recoverFromCheckpoint 恢复测试
  // =========================================================================

  describe('recoverFromCheckpoint', () => {
    it('应该正确恢复状态', () => {
      const state = createMockState(42);
      const id = manager.createCheckpoint('session-1', state);

      const recovered = manager.recoverFromCheckpoint(id);
      expect(recovered?.iterations).toBe(42);
    });

    it('不存在的检查点应返回 null', () => {
      const recovered = manager.recoverFromCheckpoint('non-existent');
      expect(recovered).toBeNull();
    });
  });

  // =========================================================================
  // getLatestCheckpoint 最新检查点测试
  // =========================================================================

  describe('getLatestCheckpoint', () => {
    it('应该返回最新的检查点', async () => {
      const state1 = createMockState(1);
      const state2 = createMockState(2);

      manager.createCheckpoint('session-1', state1);
      // 稍微延迟确保时间戳不同
      await new Promise(resolve => setTimeout(resolve, 10));
      manager.createCheckpoint('session-1', state2);

      const latest = manager.getLatestCheckpoint('session-1');
      expect(latest?.stateSnapshot.iterations).toBe(2);
    });

    it('不存在的会话应返回 null', () => {
      const latest = manager.getLatestCheckpoint('non-existent');
      expect(latest).toBeNull();
    });
  });

  // =========================================================================
  // cleanupOldCheckpoints 清理旧检查点测试
  // =========================================================================

  describe('cleanupOldCheckpoints', () => {
    it('应该保留最新的 N 个检查点', async () => {
      const state = createMockState(1);

      manager.createCheckpoint('session-1', state);
      await new Promise(resolve => setTimeout(resolve, 10));
      manager.createCheckpoint('session-1', state);
      await new Promise(resolve => setTimeout(resolve, 10));
      manager.createCheckpoint('session-1', state);
      await new Promise(resolve => setTimeout(resolve, 10));
      manager.createCheckpoint('session-1', state); // 第 4 个

      // 应该只保留最新的 3 个
      expect(manager.getCheckpointCount()).toBe(3);
    });

    it('不同会话的检查点应独立管理', () => {
      const state = createMockState(1);

      manager.createCheckpoint('session-1', state);
      manager.createCheckpoint('session-2', state);
      manager.createCheckpoint('session-3', state);

      // 每个会话一个检查点，总共 3 个
      expect(manager.getCheckpointCount()).toBe(3);
    });
  });

  // =========================================================================
  // deleteCheckpoint 删除检查点测试
  // =========================================================================

  describe('deleteCheckpoint', () => {
    it('应该成功删除检查点', () => {
      const state = createMockState(1);
      const id = manager.createCheckpoint('session-1', state);

      expect(manager.deleteCheckpoint(id)).toBe(true);
      expect(manager.getCheckpointCount()).toBe(0);
    });

    it('删除不存在的检查点应返回 false', () => {
      expect(manager.deleteCheckpoint('non-existent')).toBe(false);
    });
  });

  // =========================================================================
  // clearAllCheckpoints 清空所有检查点测试
  // =========================================================================

  describe('clearAllCheckpoints', () => {
    it('应该清空所有检查点', () => {
      const state = createMockState(1);
      manager.createCheckpoint('session-1', state);
      manager.createCheckpoint('session-2', state);

      manager.clearAllCheckpoints();
      expect(manager.getCheckpointCount()).toBe(0);
    });
  });
});
