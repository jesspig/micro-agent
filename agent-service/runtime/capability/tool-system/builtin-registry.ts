/**
 * 内置工具注册接口
 *
 * 提供依赖注入机制，允许上层应用（如 CLI）注册工具到 Agent Service。
 * 这解决了反向依赖问题：agent-service 不再直接导入 applications 中的工具。
 */

import type { BuiltinToolProvider } from '../../../types';

// 重新导出类型供外部使用
export type { BuiltinToolProvider } from '../../../types';

/** 全局工具提供者实例 */
let globalToolProvider: BuiltinToolProvider | null = null;

/**
 * 注册内置工具提供者
 *
 * 由上层应用（如 CLI）在启动时调用，注入工具实现。
 */
export function registerBuiltinToolProvider(provider: BuiltinToolProvider): void {
  globalToolProvider = provider;
}

/**
 * 获取已注册的工具提供者
 */
export function getBuiltinToolProvider(): BuiltinToolProvider | null {
  return globalToolProvider;
}

/**
 * 检查是否已注册工具提供者
 */
export function hasBuiltinToolProvider(): boolean {
  return globalToolProvider !== null;
}

/**
 * 清除工具提供者（用于测试）
 */
export function clearBuiltinToolProvider(): void {
  globalToolProvider = null;
}
