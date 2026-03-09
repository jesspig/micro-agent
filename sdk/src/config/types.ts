/**
 * 配置类型定义
 * 
 * 从 Agent Service 导出基础类型，SDK 不重复定义
 */

// 从 agent-service schema 导入所有类型和 Schema
// 注意：schema.ts 中定义了完整的配置类型和 Zod Schema
export {
  ConfigSchema,
  AgentConfigSchema,
  ModelsConfigSchema,
  ModelConfigSchema,
  ProviderConfigSchema,
  ChannelConfigSchema,
  WorkspaceConfigSchema,
  MemoryConfigSchema,
  ExecutorConfigSchema,
  LoopDetectionConfigSchema,
  CitationConfigSchema,
  parseModelConfigs,
  parseWorkspaces,
} from '../../../agent-service/runtime/infrastructure/config/schema';

// 从 schema 导出类型（使用 Config 作为主类型）
export type {
  Config,
  AgentConfig,
  ModelsConfig,
  ModelConfig,
  ProviderConfig,
  ProviderEntry,
  WorkspaceConfig,
  MemoryConfig,
  ExecutorConfig,
  LoopDetectionConfig,
  CitationConfig,
} from '../../../agent-service/runtime/infrastructure/config/schema';

// 从 agent-service types 导入额外类型
export type {
  KnowledgeBaseConfig,
  BackgroundBuildConfig,
} from '../../../agent-service/types/config';

// 导出 SchemaConfig 作为 Config 的别名（用于内部区分）
export type { Config as SchemaConfig } from '../../../agent-service/runtime/infrastructure/config/schema';
