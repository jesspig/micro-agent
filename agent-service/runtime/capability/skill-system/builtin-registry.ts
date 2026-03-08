/**
 * 内置技能注册接口
 *
 * 提供依赖注入机制，允许上层应用（如 CLI）注册技能到 Agent Service。
 * 这解决了反向依赖问题：agent-service 不再直接导入 applications 中的技能。
 */

import type { BuiltinSkillProvider } from '../../../types';

// 重新导出类型供外部使用
export type { BuiltinSkillProvider } from '../../../types';

/** 全局技能提供者实例 */
let globalSkillProvider: BuiltinSkillProvider | null = null;

/**
 * 注册内置技能提供者
 *
 * 由上层应用（如 CLI）在启动时调用，注入技能路径。
 */
export function registerBuiltinSkillProvider(provider: BuiltinSkillProvider): void {
  globalSkillProvider = provider;
}

/**
 * 获取已注册的技能提供者
 */
export function getBuiltinSkillProvider(): BuiltinSkillProvider | null {
  return globalSkillProvider;
}

/**
 * 检查是否已注册技能提供者
 */
export function hasBuiltinSkillProvider(): boolean {
  return globalSkillProvider !== null;
}

/**
 * 清除技能提供者（用于测试）
 */
export function clearBuiltinSkillProvider(): void {
  globalSkillProvider = null;
}
