/**
 * MicroAgent SDK 入口
 * 
 * 聚合所有子模块，提供统一的开发接口
 */

// ============ Types - 核心类型定义 ============
// 从 @micro-agent/types 导出所有类型
export * from '@micro-agent/types';

// ============ Runtime - 运行时引擎 ============
export { ContainerImpl, container } from '@micro-agent/runtime';
export { EventBus, eventBus } from '@micro-agent/runtime';
export { HookSystem, hookSystem, type Hook } from '@micro-agent/runtime';
export { Pipeline, type Middleware } from '@micro-agent/runtime';
export { MessageBus } from '@micro-agent/runtime';
export { AgentExecutor, type AgentExecutorConfig } from '@micro-agent/runtime';
// Memory System
export {
  MemoryStore,
  ConversationSummarizer,
  OpenAIEmbedding,
  NoEmbedding,
  createEmbeddingService,
} from '@micro-agent/runtime';
export type {
  MemoryEntry,
  MemoryMetadata,
  Summary,
  MemoryStats,
  SearchOptions,
  MemoryFilter,
  EmbeddingService,
  SummarizerConfig,
} from '@micro-agent/runtime';

// ============ Storage - 存储层 ============
export { SessionStore } from '@micro-agent/storage';
export type { SessionStoreConfig } from '@micro-agent/storage';

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
} from '@micro-agent/config';

// 注意：ModelConfig 从 @micro-agent/config 导出（有必填字段）
// 而 @micro-agent/types 中的 ModelConfig 有可选字段
// SDK 优先使用 @micro-agent/config 的版本
export type { ModelConfig } from '@micro-agent/config';

// ============ Providers - LLM 提供商层 ============
export {
  OpenAICompatibleProvider,
  LLMGateway,
  ModelRouter,
  hasImageMedia,
  parseOpenAIResponse,
  toOpenAIMessages,
} from '@micro-agent/providers';

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
} from '@micro-agent/providers';

// ============ Extension System - 扩展系统 ============
export { ExtensionRegistry, ExtensionDiscovery, ExtensionLoader, HotReloadManager } from '@micro-agent/extension-system';
export type { RegistryConfig, LoaderConfig, LoaderState, HotReloadConfig } from '@micro-agent/extension-system';

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