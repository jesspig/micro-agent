/**
 * Config 模块入口
 */

// Schema
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
  parseModelConfigs,
  parseWorkspaces,
} from './schema';

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
} from './schema';

// Loader
export {
  loadConfig,
  getSystemDefaultsPath,
  getConfigStatus,
  ConfigLevel,
} from './loader';

export type { LoadConfigOptions, ConfigStatus } from './loader';

// Merger
export { mergeConfigs, getConfigDiff } from './merger';
export type { ConfigScope, ConfigSource, MergedConfigResult } from './merger';

// Utils
export {
  deepMerge,
  resolveEnvVars,
  findConfigFile,
  loadConfigFile,
  buildPathChain,
  getBuiltinDefaults,
  CONFIG_FILE_NAMES,
} from './utils';

// Workspace
export {
  validateWorkspaceAccess,
  canAccessWorkspace,
  getUserConfigPath,
  createDefaultUserConfig,
  expandPath,
} from './workspace';

// Template
export {
  TEMPLATE_FILE_NAMES,
  findTemplateFile,
  loadTemplateFile,
  loadAllTemplateFiles,
} from './template';

// Logger
export { initLogger, getLogDir } from './logger';
export type { LogConfig } from './logger';
