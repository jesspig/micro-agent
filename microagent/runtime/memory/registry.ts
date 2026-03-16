/**
 * Memory 注册表
 *
 * 提供全局 Memory 实例的注册和访问能力
 */

import type { IMemoryExtended } from "./contract.js";
import {
  memoryLogger,
  createTimer,
  logMethodCall,
  logMethodReturn,
} from "../../applications/shared/logger.js";

const logger = memoryLogger();

// ============================================================================
// 常量定义
// ============================================================================

/** 模块名称 */
const MODULE_NAME = "MemoryRegistry";

// ============================================================================
// MemoryRegistry 类
// ============================================================================

/**
 * Memory 注册表（单例模式）
 *
 * 管理全局 Memory 实例，提供统一的访问入口。
 * 遵循单例模式，确保整个应用使用同一个 Memory 实例。
 */
export class MemoryRegistry {
  /** 单例实例 */
  private static instance: MemoryRegistry | null = null;

  /** Memory 实例 */
  private memory: IMemoryExtended | null = null;

  /** 私有构造函数，防止外部实例化 */
  private constructor() {}

  /**
   * 获取单例实例
   * @returns MemoryRegistry 实例
   */
  static getInstance(): MemoryRegistry {
    const timer = createTimer();
    logMethodCall(logger, {
      method: "getInstance",
      module: MODULE_NAME,
      params: {},
    });

    const isNewInstance = !MemoryRegistry.instance;

    if (!MemoryRegistry.instance) {
      MemoryRegistry.instance = new MemoryRegistry();
      logger.info("记忆操作", { action: "registry_created" });
    }

    logMethodReturn(logger, {
      method: "getInstance",
      module: MODULE_NAME,
      result: { isNewInstance },
      duration: timer(),
    });

    return MemoryRegistry.instance;
  }

  /**
   * 设置 Memory 实例
   * @param memory - Memory 实例
   */
  set(memory: IMemoryExtended): void {
    const timer = createTimer();
    logMethodCall(logger, {
      method: "set",
      module: MODULE_NAME,
      params: { hasMemory: !!memory },
    });

    this.memory = memory;

    logger.info("记忆操作", { action: "memory_set" });

    logMethodReturn(logger, {
      method: "set",
      module: MODULE_NAME,
      result: {},
      duration: timer(),
    });
  }

  /**
   * 获取 Memory 实例
   * @returns Memory 实例，未设置时返回 undefined
   */
  get(): IMemoryExtended | undefined {
    const timer = createTimer();
    logMethodCall(logger, {
      method: "get",
      module: MODULE_NAME,
      params: {},
    });

    const result = this.memory ?? undefined;

    logMethodReturn(logger, {
      method: "get",
      module: MODULE_NAME,
      result: { hasMemory: !!result },
      duration: timer(),
    });

    return result;
  }

  /**
   * 检查是否已设置 Memory 实例
   * @returns 是否已设置
   */
  has(): boolean {
    const timer = createTimer();
    logMethodCall(logger, {
      method: "has",
      module: MODULE_NAME,
      params: {},
    });

    const result = this.memory !== null;

    logMethodReturn(logger, {
      method: "has",
      module: MODULE_NAME,
      result: { hasMemory: result },
      duration: timer(),
    });

    return result;
  }

  /**
   * 清除 Memory 实例
   * 用于测试或重置场景
   */
  clear(): void {
    const timer = createTimer();
    logMethodCall(logger, {
      method: "clear",
      module: MODULE_NAME,
      params: {},
    });

    this.memory = null;

    logger.info("记忆操作", { action: "memory_cleared" });

    logMethodReturn(logger, {
      method: "clear",
      module: MODULE_NAME,
      result: {},
      duration: timer(),
    });
  }
}