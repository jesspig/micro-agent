/**
 * 配置加载器
 * 
 * 加载、解析和验证用户配置文件
 */

import { parse } from "yaml";

const MODULE_NAME = "ConfigLoader";
import {
  type Settings,
  safeValidateSettings,
} from "./schema.js";
import { resolveEnvVarsDeep } from "./env-resolver.js";
import { SETTINGS_FILE } from "../shared/constants.js";
import { configLogger, createTimer, sanitize, logMethodCall, logMethodReturn, logMethodError } from "../shared/logger.js";

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
  const timer = createTimer();
  const logger = configLogger();
  const filePath = configPath ?? SETTINGS_FILE;
  
  logMethodCall(logger, { method: "loadSettings", module: MODULE_NAME, params: { configPath: filePath } });

  try {
    // 读取配置文件
    const rawContent = await readConfigFile(filePath);

    // 配置文件不存在，返回默认配置
    if (rawContent === null) {
      logger.info("配置文件不存在，使用默认配置", { configPath: filePath });
      const result = getDefaultSettings();
      logMethodReturn(logger, { method: "loadSettings", module: MODULE_NAME, result: sanitize(result), duration: timer() });
      return result;
    }

    logger.debug("配置文件读取成功", { configPath: filePath, contentLength: rawContent.length });

    // 解析 YAML
    let parsedConfig: unknown;
    try {
      parsedConfig = parse(rawContent);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logMethodError(logger, { 
        method: "loadSettings", 
        module: MODULE_NAME, 
        error: { name: err.name, message: err.message, ...(err.stack ? { stack: err.stack } : {}) },
        params: { configPath: filePath },
        duration: timer() 
      });
      throw new ConfigLoadError(`YAML 解析失败: ${err.message}`, filePath);
    }

    // 解析环境变量引用
    const resolvedConfig = resolveEnvVarsDeep(parsedConfig);
    logger.debug("环境变量解析完成", { configPath: filePath });

    // 验证配置结构
    const validationResult = safeValidateSettings(resolvedConfig);
    if (!validationResult.success) {
      const issues = validationResult.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ");
      const err = new ConfigValidationError(`配置验证失败: ${issues}`, filePath);
      logMethodError(logger, { 
        method: "loadSettings", 
        module: MODULE_NAME, 
        error: { name: err.name, message: err.message },
        params: { configPath: filePath, issues },
        duration: timer() 
      });
      throw err;
    }

    const data = validationResult.data;
    const providersCount = data.providers ? Object.keys(data.providers).length : 0;
    const hasChannels = data.channels ? Object.keys(data.channels).length > 0 : false;
    logger.info("配置加载成功", { configPath: filePath, providersCount, hasChannels });
    logMethodReturn(logger, { method: "loadSettings", module: MODULE_NAME, result: sanitize(data), duration: timer() });
    return data;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logMethodError(logger, { 
      method: "loadSettings", 
      module: MODULE_NAME, 
      error: { name: err.name, message: err.message, ...(err.stack ? { stack: err.stack } : {}) },
      params: { configPath: filePath },
      duration: timer() 
    });
    throw error;
  }
}

/**
 * 读取配置文件内容
 * 
 * @param filePath - 文件路径
 * @returns 文件内容或 null（文件不存在时）
 */
async function readConfigFile(filePath: string): Promise<string | null> {
  const timer = createTimer();
  const logger = configLogger();
  
  logMethodCall(logger, { method: "readConfigFile", module: MODULE_NAME, params: { filePath } });

  try {
    const file = Bun.file(filePath);
    const exists = await file.exists();

    if (!exists) {
      logger.debug("配置文件不存在", { filePath });
      logMethodReturn(logger, { method: "readConfigFile", module: MODULE_NAME, result: null, duration: timer() });
      return null;
    }

    const content = await file.text();
    logger.debug("配置文件读取成功", { filePath, size: content.length });
    logMethodReturn(logger, { method: "readConfigFile", module: MODULE_NAME, result: `content[${content.length} chars]`, duration: timer() });
    return content;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logMethodError(logger, { 
      method: "readConfigFile", 
      module: MODULE_NAME, 
      error: { name: err.name, message: err.message, ...(err.stack ? { stack: err.stack } : {}) },
      params: { filePath },
      duration: timer() 
    });
    throw new ConfigLoadError(`读取配置文件失败: ${err.message}`, filePath);
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
  const timer = createTimer();
  const logger = configLogger();
  
  logMethodCall(logger, { method: "getDefaultSettings", module: MODULE_NAME, params: {} });
  
  const result: Settings = {
    agents: DEFAULT_AGENT_CONFIG,
    tools: {
      enabled: [],
      disabled: [],
    },
    channels: {},
    providers: {},
  };
  
  logMethodReturn(logger, { method: "getDefaultSettings", module: MODULE_NAME, result: sanitize(result), duration: timer() });
  return result;
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
  const timer = createTimer();
  const logger = configLogger();
  
  logMethodCall(logger, { method: "mergeSettings", module: MODULE_NAME, params: { hasOverride: !!override } });
  
  const result: Settings = {
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
  
  logger.debug("配置合并完成", { hasAgents: !!override.agents, hasTools: !!override.tools, hasChannels: !!override.channels, hasProviders: !!override.providers });
  logMethodReturn(logger, { method: "mergeSettings", module: MODULE_NAME, result: sanitize(result), duration: timer() });
  return result;
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