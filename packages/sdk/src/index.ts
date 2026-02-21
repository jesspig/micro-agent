/**
 * MicroBot SDK 入口
 * 
 * 聚合所有子模块，提供统一的开发接口
 */

// ============ Types - 核心类型定义 ============
// 从 @microbot/types 导出所有类型
export * from '@microbot/types';

// ============ Runtime - 运行时引擎 ============
export { ContainerImpl, container } from '@microbot/runtime';
export { EventBus, eventBus } from '@microbot/runtime';
export { HookSystem, hookSystem, type Hook } from '@microbot/runtime';
export { Pipeline, type Middleware } from '@microbot/runtime';
export { MessageBus } from '@microbot/runtime';
export { AgentExecutor, type AgentExecutorConfig } from '@microbot/runtime';

// ============ Storage - 存储层 ============
export { SessionStore } from '@microbot/storage';
export { MemoryStore } from '@microbot/storage';
export type { SessionStoreConfig, MemoryStoreConfig } from '@microbot/storage';

// ============ Config - 配置层 ============
export {
  loadConfig,
  getSystemDefaultsPath,
  getConfigStatus,
  deepMerge,
  resolveEnvVars,
  findConfigFile,
  loadConfigFile,
  expandPath,
  validateWorkspaceAccess,
  canAccessWorkspace,
  getUserConfigPath,
  createDefaultUserConfig,
  TEMPLATE_FILE_NAMES,
  findTemplateFile,
  loadTemplateFile,
  loadAllTemplateFiles,
  ConfigSchema,
  DEFAULT_ROUTING_RULES,
  DEFAULT_ROUTING_CONFIG,
  parseModelConfigs,
  getModelCapabilities,
} from '@microbot/config';

// 注意：ModelConfig 从 @microbot/config 导出（有必填字段）
// 而 @microbot/types 中的 ModelConfig 有可选字段
// SDK 优先使用 @microbot/config 的版本
export type { ModelConfig } from '@microbot/config';

// ============ Providers - LLM 提供商层 ============
export {
  OpenAICompatibleProvider,
  LLMGateway,
  ModelRouter,
  calculateComplexity,
  complexityToLevel,
  hasImageMedia,
  matchRule,
  parseOpenAIResponse,
  toOpenAIMessages,
} from '@microbot/providers';

export type {
  GenerationConfig,
  OpenAICompatibleConfig,
  GatewayConfig,
  ModelRouterConfig,
  RouteResult,
  ComplexityScore,
  IntentResult,
  ModelInfo,
  IntentPromptBuilder,
  UserPromptBuilder,
} from '@microbot/providers';

// ============ Extension System - 扩展系统 ============
export { ExtensionRegistry, ExtensionDiscovery, ExtensionLoader, HotReloadManager } from '@microbot/extension-system';
export type { RegistryConfig, LoaderConfig, LoaderState, HotReloadConfig } from '@microbot/extension-system';

// ============ Tool - 工具模块 ============
export { ToolRegistry } from './tool/registry';
export { ToolBuilder, createToolBuilder } from './tool/builder';
export type { ToolBuilderOptions } from './tool/builder';

// ============ Channel - 通道模块 ============
export { ChannelManager, ChannelHelper } from './channel';
export type { InboundMessageParams } from './channel';

// ============ Skill - 技能模块 ============
export { SkillsLoader, getUserSkillsPath, SKILL_NAME_REGEX } from './skill';
export type { Skill, SkillSummary, SkillFrontmatter } from './skill';
export { SkillTool, createSkillTool, createSkillTools } from './skill';

// ============ Define - 定义函数 ============
export { defineTool, defineChannel, defineSkill } from './define';
export type { DefineToolOptions, DefineChannelOptions, DefineSkillOptions } from './define';