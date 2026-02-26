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
// Memory System
export {
  MemoryStore,
  ConversationSummarizer,
  OpenAIEmbedding,
  NoEmbedding,
  createEmbeddingService,
} from '@microbot/runtime';
export type {
  MemoryEntry,
  MemoryMetadata,
  Summary,
  MemoryStats,
  SearchOptions,
  MemoryFilter,
  EmbeddingService,
  SummarizerConfig,
} from '@microbot/runtime';

// ============ Storage - 存储层 ============
export { SessionStore } from '@microbot/storage';
export type { SessionStoreConfig } from '@microbot/storage';

// ============ Config - 配置层 ============
export {
  loadConfig,
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
  parseModelConfigs,
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
  hasImageMedia,
  parseOpenAIResponse,
  toOpenAIMessages,
} from '@microbot/providers';

export type {
  GenerationConfig,
  OpenAICompatibleConfig,
  GatewayConfig,
  ModelRouterConfig,
  RouteResult,
  TaskTypeResult,
  TaskType,
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
export { SkillsLoader, SKILL_NAME_REGEX } from './skill';
export type { Skill, SkillSummary, SkillFrontmatter } from './skill';

// ============ Define - 定义函数 ============
export { defineTool, defineChannel, defineSkill } from './define';
export type { DefineToolOptions, DefineChannelOptions, DefineSkillOptions } from './define';