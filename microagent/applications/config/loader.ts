/**
 * 配置加载器
 * 
 * 加载、解析和验证用户配置文件
 */

import { parse } from "yaml";
import {
  type Settings,
  safeValidateSettings,
} from "./schema.js";
import { resolveEnvVarsDeep } from "./env-resolver.js";
import { SETTINGS_FILE } from "../shared/constants.js";
import { getLogger } from "../shared/logger.js";

// ============================================================================
// 默认配置
// ============================================================================

/**
 * 默认 Agent 配置
 */
const DEFAULT_AGENT_CONFIG = {
  defaults: {
    workspace: "~/.micro-agent/workspace",
    model: "",
    maxTokens: 8192,
    temperature: 0.7,
    maxToolIterations: 40,
    heartbeatInterval: 30,
  },
};

// ============================================================================
// 配置加载
// ============================================================================

/**
 * 加载配置文件
 * 
 * 流程：
 * 1. 读取 YAML 文件
 * 2. 解析环境变量引用
 * 3. 使用 Zod Schema 验证
 * 4. 合并默认配置
 * 
 * @param configPath - 配置文件路径（默认为标准路径）
 * @returns 完整配置对象
 */
export async function loadSettings(configPath?: string): Promise<Settings> {
  const logger = getLogger();
  const filePath = configPath ?? SETTINGS_FILE;

  // 读取配置文件
  const rawContent = await readConfigFile(filePath);

  // 配置文件不存在，返回默认配置
  if (rawContent === null) {
    logger.info(`配置文件不存在，使用默认配置: ${filePath}`);
    return getDefaultSettings();
  }

  // 解析 YAML
  let parsedConfig: unknown;
  try {
    parsedConfig = parse(rawContent);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ConfigLoadError(`YAML 解析失败: ${message}`, filePath);
  }

  // 解析环境变量引用
  const resolvedConfig = resolveEnvVarsDeep(parsedConfig);

  // 验证配置结构
  const validationResult = safeValidateSettings(resolvedConfig);
  if (!validationResult.success) {
    const issues = validationResult.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new ConfigValidationError(`配置验证失败: ${issues}`, filePath);
  }

  logger.debug(`配置加载成功: ${filePath}`);
  return validationResult.data;
}

/**
 * 读取配置文件内容
 * 
 * @param filePath - 文件路径
 * @returns 文件内容或 null（文件不存在时）
 */
async function readConfigFile(filePath: string): Promise<string | null> {
  try {
    const file = Bun.file(filePath);
    const exists = await file.exists();

    if (!exists) {
      return null;
    }

    return await file.text();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ConfigLoadError(`读取配置文件失败: ${message}`, filePath);
  }
}

// ============================================================================
// 默认配置生成
// ============================================================================

/**
 * 获取默认配置
 *
 * @returns 默认 Settings 对象
 */
export function getDefaultSettings(): Settings {
  return {
    agents: DEFAULT_AGENT_CONFIG,
    tools: {
      enabled: [],
      disabled: [],
    },
    channels: {},
    providers: {},
  };
}

// ============================================================================
// 配置合并
// ============================================================================

/**
 * 合并两个配置对象
 *
 * @param base - 基础配置
 * @param override - 覆盖配置
 * @returns 合并后的配置
 */
export function mergeSettings(
  base: Settings,
  override: Partial<Settings>
): Settings {
  return {
    agents: override.agents
      ? {
          defaults: {
            ...base.agents.defaults,
            ...override.agents.defaults,
          },
        }
      : base.agents,
    tools: override.tools ? { ...base.tools, ...override.tools } : base.tools,
    channels: override.channels
      ? { ...base.channels, ...override.channels }
      : base.channels,
    providers: override.providers
      ? { ...base.providers, ...override.providers }
      : base.providers,
  };
}

// ============================================================================
// 错误类型
// ============================================================================

/**
 * 配置加载错误
 */
export class ConfigLoadError extends Error {
  constructor(
    message: string,
    public readonly filePath: string
  ) {
    super(message);
    this.name = "ConfigLoadError";
  }

  /**
   * 自定义 JSON 序列化，确保 message 被包含
   */
  toJSON() {
    return {
      message: this.message,
      filePath: this.filePath,
      name: this.name,
    };
  }
}

/**
 * 配置验证错误
 */
export class ConfigValidationError extends Error {
  constructor(
    message: string,
    public readonly filePath: string
  ) {
    super(message);
    this.name = "ConfigValidationError";
  }

  /**
   * 自定义 JSON 序列化，确保 message 被包含
   */
  toJSON() {
    return {
      message: this.message,
      filePath: this.filePath,
      name: this.name,
    };
  }
}

// ============================================================================
// 类型重导出
// ============================================================================

export type {
  Settings,
  AgentsConfig,
  AgentDefaultsConfig,
  ProvidersConfig,
  SingleProviderConfig,
  ToolsConfig,
  ShellToolConfig,
  ToolsSpecificConfig,
  ChannelsConfig,
  FeishuChannelConfig,
  DingtalkChannelConfig,
  QQChannelConfig,
  WechatWorkChannelConfig,
} from "./schema.js";