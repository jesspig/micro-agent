/**
 * Memory 注册表
 *
 * 提供全局 Memory 实例的注册和访问能力
 */

import type { IMemoryExtended } from "./contract.js";

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
    if (!MemoryRegistry.instance) {
      MemoryRegistry.instance = new MemoryRegistry();
    }
    return MemoryRegistry.instance;
  }

  /**
   * 设置 Memory 实例
   * @param memory - Memory 实例
   */
  set(memory: IMemoryExtended): void {
    this.memory = memory;
  }

  /**
   * 获取 Memory 实例
   * @returns Memory 实例，未设置时返回 undefined
   */
  get(): IMemoryExtended | undefined {
    return this.memory ?? undefined;
  }

  /**
   * 检查是否已设置 Memory 实例
   * @returns 是否已设置
   */
  has(): boolean {
    return this.memory !== null;
  }

  /**
   * 清除 Memory 实例
   * 用于测试或重置场景
   */
  clear(): void {
    this.memory = null;
  }
}
