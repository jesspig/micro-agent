/**
 * 配置模块导出
 *
 * 导出配置加载器、Schema 和环境变量解析器
 */

// ============================================================================
// 配置加载器
// ============================================================================

export {
  loadSettings,
  getDefaultSettings,
  mergeSettings,
  ConfigLoadError,
  ConfigValidationError,
  type Settings,
} from "./loader.js";

// ============================================================================
// Zod Schema
// ============================================================================

export {
  AgentDefaultsConfigSchema,
  AgentsConfigSchema,
  SingleProviderConfigSchema,
  ProvidersConfigSchema,
  ShellToolConfigSchema,
  ToolsSpecificConfigSchema,
  ToolsConfigSchema,
  FeishuChannelConfigSchema,
  DingtalkChannelConfigSchema,
  QQChannelConfigSchema,
  WechatWorkChannelConfigSchema,
  ChannelsConfigSchema,
  SettingsSchema,
  validateAgentsConfig,
  validateProvidersConfig,
  validateToolsConfig,
  validateChannelsConfig,
  validateSettings,
  safeValidateSettings,
  type AgentsConfig,
  type AgentDefaultsConfig,
  type ProvidersConfig,
  type SingleProviderConfig,
  type ToolsConfig,
  type ShellToolConfig,
  type ToolsSpecificConfig,
  type ChannelsConfig,
  type FeishuChannelConfig,
  type DingtalkChannelConfig,
  type QQChannelConfig,
  type WechatWorkChannelConfig,
} from "./schema.js";

// ============================================================================
// 环境变量解析器
// ============================================================================

export {
  resolveEnvVars,
  resolveEnvVarsDeep,
  hasEnvVarRef,
} from "./env-resolver.js";