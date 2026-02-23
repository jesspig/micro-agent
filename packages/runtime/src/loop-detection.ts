/**
 * 循环检测器
 * 检测 Agent 执行循环中的重复工具调用和异常模式
 */

import type { LoopDetectionResult, LoopDetectorConfig } from './types';

/** 工具调用记录 */
interface ToolCallRecord {
  /** 工具名称 */
  toolName: string;
  /** 调用参数 */
  params: Record<string, unknown>;
  /** 调用时间戳 */
  timestamp: number;
}

/** 默认配置 */
const DEFAULT_CONFIG: LoopDetectorConfig = {
  enabled: true,
  warningThreshold: 3,
  criticalThreshold: 5,
  globalCircuitBreaker: 30,
};

/**
 * 循环检测器
 * 
 * 检测三种循环模式：
 * 1. 相同工具+参数重复调用
 * 2. 两个工具交替调用（ping-pong）
 * 3. 全局调用次数熔断
 */
export class LoopDetector {
  /** 检测配置 */
  private config: LoopDetectorConfig;
  /** 调用历史记录 */
  private callHistory: ToolCallRecord[] = [];
  /** 调用计数器（按工具+参数签名） */
  private callCounts: Map<string, number> = new Map();

  /**
   * 创建循环检测器实例
   * @param config 检测配置
   */
  constructor(config: Partial<LoopDetectorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 记录工具调用
   * @param toolName 工具名称
   * @param params 调用参数
   * @returns 调用签名（用于调试）
   */
  recordCall(toolName: string, params: Record<string, unknown>): string {
    if (!this.config.enabled) return '';

    const key = this.createCallKey(toolName, params);
    const count = (this.callCounts.get(key) || 0) + 1;
    this.callCounts.set(key, count);

    this.callHistory.push({
      toolName,
      params,
      timestamp: Date.now(),
    });

    return key;
  }

  /**
   * 检测循环
   * @returns 检测结果，无循环时返回 null
   */
  detectLoop(): LoopDetectionResult | null {
    if (!this.config.enabled) return null;

    // 检测相同工具+参数重复
    const repetitionResult = this.detectRepetition();
    if (repetitionResult) return repetitionResult;

    // 检测 ping-pong 模式
    const pingPongResult = this.detectPingPong();
    if (pingPongResult) return pingPongResult;

    // 全局熔断
    const circuitResult = this.detectCircuitBreaker();
    if (circuitResult) return circuitResult;

    return null;
  }

  /**
   * 重置检测状态
   */
  reset(): void {
    this.callHistory = [];
    this.callCounts.clear();
  }

  /**
   * 获取总调用次数
   */
  getTotalCallCount(): number {
    return this.callHistory.length;
  }

  /**
   * 获取调用历史
   */
  getCallHistory(): ReadonlyArray<ToolCallRecord> {
    return [...this.callHistory];
  }

  // ========== 私有方法 ==========

  /**
   * 创建调用签名
   */
  private createCallKey(toolName: string, params: Record<string, unknown>): string {
    try {
      // 对参数进行排序后序列化，确保相同参数生成相同签名
      const sortedParams = this.sortObject(params);
      return `${toolName}:${JSON.stringify(sortedParams)}`;
    } catch {
      // 序列化失败时使用工具名
      return toolName;
    }
  }

  /**
   * 递归排序对象键
   */
  private sortObject(obj: unknown): unknown {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }
    if (Array.isArray(obj)) {
      return obj.map(item => this.sortObject(item));
    }
    const sorted: Record<string, unknown> = {};
    const keys = Object.keys(obj).sort();
    for (const key of keys) {
      sorted[key] = this.sortObject((obj as Record<string, unknown>)[key]);
    }
    return sorted;
  }

  /**
   * 检测重复调用
   */
  private detectRepetition(): LoopDetectionResult | null {
    for (const [key, count] of this.callCounts) {
      if (count >= this.config.criticalThreshold) {
        return {
          detected: true,
          reason: `工具调用重复 ${count} 次: ${key}`,
          severity: 'critical',
        };
      }
      if (count >= this.config.warningThreshold) {
        return {
          detected: true,
          reason: `工具调用重复 ${count} 次: ${key}`,
          severity: 'warning',
        };
      }
    }
    return null;
  }

  /**
   * 检测 ping-pong 模式
   * 示例: A -> B -> A -> B
   */
  private detectPingPong(): LoopDetectionResult | null {
    const calls = this.callHistory.slice(-4);
    if (calls.length < 4) return null;

    const tools = calls.map(c => c.toolName);
    // 检测 ABAB 模式
    if (tools[0] === tools[2] && tools[1] === tools[3] && tools[0] !== tools[1]) {
      return {
        detected: true,
        reason: `检测到两个工具交替调用: ${tools[0]} <-> ${tools[1]}`,
        severity: 'warning',
      };
    }

    return null;
  }

  /**
   * 检测全局熔断
   */
  private detectCircuitBreaker(): LoopDetectionResult | null {
    if (this.callHistory.length >= this.config.globalCircuitBreaker) {
      return {
        detected: true,
        reason: `总调用次数达到 ${this.config.globalCircuitBreaker}，触发熔断`,
        severity: 'critical',
      };
    }
    return null;
  }
}
