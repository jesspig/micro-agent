/**
 * status 命令实现
 *
 * 显示当前配置和运行信息
 * - 显示当前配置
 * - 显示 Provider 状态
 * - 显示已注册的工具
 * - 显示已加载的技能
 */

import {
  MICRO_AGENT_DIR,
  WORKSPACE_DIR,
  AGENT_DIR,
  SESSIONS_DIR,
  LOGS_DIR,
  SETTINGS_FILE,
  AGENTS_FILE,
  SOUL_FILE,
  USER_FILE,
  MEMORY_FILE,
} from "../../shared/constants.js";
import { loadSettings } from "../../config/loader.js";
import { getAllToolDefinitions } from "../../tools/index.js";
import { FilesystemSkillLoader } from "../../skills/index.js";
import {
  cliLogger,
  createTimer,
  logMethodCall,
  logMethodReturn,
  logMethodError,
} from "../../shared/logger.js";

const logger = cliLogger();

// ============================================================================
// 类型定义
// ============================================================================

/**
 * status 命令选项
 */
export interface StatusOptions {
  /** 显示详细配置 */
  verbose?: boolean;
  /** JSON 格式输出 */
  json?: boolean;
}

/**
 * status 命令结果
 */
export interface StatusResult {
  /** 配置状态 */
  config: {
    /** 是否已初始化 */
    initialized: boolean;
    /** 配置文件路径 */
    configPath: string;
    /** 当前 Provider */
    provider?: string;
    /** 当前模型 */
    model?: string;
    /** 最大迭代次数 */
    maxIterations?: number;
  };
  /** 目录状态 */
  directories: {
    name: string;
    path: string;
    exists: boolean;
  }[];
  /** 文件状态 */
  files: {
    name: string;
    path: string;
    exists: boolean;
    size?: number;
  }[];
  /** Provider 状态 */
  providers: {
    name: string;
    available: boolean;
    hasApiKey: boolean;
  }[];
  /** 工具列表 */
  tools: {
    name: string;
    description: string;
    enabled: boolean;
  }[];
  /** 技能列表 */
  skills: {
    name: string;
    description: string;
    loaded: boolean;
  }[];
}

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 检查路径是否存在
 */
async function pathExists(path: string): Promise<boolean> {
  const timer = createTimer();
  logMethodCall(logger, { method: "pathExists", module: "CLI", params: { path } });

  const file = Bun.file(path);
  const exists = await file.exists();

  logMethodReturn(logger, { method: "pathExists", module: "CLI", result: { exists }, duration: timer() });
  return exists;
}

/**
 * 获取文件大小
 */
async function getFileSize(path: string): Promise<number | undefined> {
  const timer = createTimer();
  logMethodCall(logger, { method: "getFileSize", module: "CLI", params: { path } });

  const file = Bun.file(path);
  const exists = await file.exists();
  if (!exists) {
    logMethodReturn(logger, { method: "getFileSize", module: "CLI", result: undefined, duration: timer() });
    return undefined;
  }
  const stat = await file.arrayBuffer();
  const size = stat.byteLength;

  logMethodReturn(logger, { method: "getFileSize", module: "CLI", result: { size }, duration: timer() });
  return size;
}

/**
 * 检查 API Key 是否已配置
 */
function hasApiKey(envVar: string): boolean {
  const timer = createTimer();
  logMethodCall(logger, { method: "hasApiKey", module: "CLI", params: { envVar } });

  const result = !!process.env[envVar];

  logMethodReturn(logger, { method: "hasApiKey", module: "CLI", result: { hasKey: result }, duration: timer() });
  return result;
}

// ============================================================================
// status 命令实现
// ============================================================================

/**
 * 执行 status 命令
 *
 * @param options - 命令选项
 * @returns 执行结果
 */
export async function statusCommand(
  _options: StatusOptions = {}
): Promise<StatusResult> {
  const timer = createTimer();
  logMethodCall(logger, { method: "statusCommand", module: "CLI", params: { verbose: _options.verbose, json: _options.json } });

  const result: StatusResult = {
    config: {
      initialized: false,
      configPath: SETTINGS_FILE,
    },
    directories: [],
    files: [],
    providers: [],
    tools: [],
    skills: [],
  };

  try {
    // 1. 检查目录状态
    logger.debug("检查目录状态");
    const directories = [
      { name: "根目录", path: MICRO_AGENT_DIR },
      { name: "工作目录", path: WORKSPACE_DIR },
      { name: "Agent 配置", path: AGENT_DIR },
      { name: "会话存储", path: SESSIONS_DIR },
      { name: "日志目录", path: LOGS_DIR },
    ];

    for (const dir of directories) {
      result.directories.push({
        name: dir.name,
        path: dir.path,
        exists: await pathExists(dir.path),
      });
    }

    // 2. 检查文件状态
    logger.debug("检查文件状态");
    const files = [
      { name: "配置文件", path: SETTINGS_FILE },
      { name: "Agent 角色", path: AGENTS_FILE },
      { name: "个性设置", path: SOUL_FILE },
      { name: "用户偏好", path: USER_FILE },
      { name: "长期记忆", path: MEMORY_FILE },
    ];

    for (const file of files) {
      const exists = await pathExists(file.path);
      const size = exists ? await getFileSize(file.path) : undefined;

      // 构建文件状态对象
      const fileStatus: { name: string; path: string; exists: boolean; size?: number } = {
        name: file.name,
        path: file.path,
        exists,
      };
      if (size !== undefined) {
        fileStatus.size = size;
      }
      result.files.push(fileStatus);
    }

    // 3. 检查配置状态
    logger.debug("检查配置状态");
    let settings: Awaited<ReturnType<typeof loadSettings>> | null = null;
    try {
      settings = await loadSettings();
      result.config.initialized = true;

      // 获取启用的 Provider 名称
      const providers = settings.providers ?? {};
      const enabledProviderName = Object.entries(providers).find(
        ([_, config]) => config?.enabled === true
      )?.[0];
      if (enabledProviderName) {
        result.config.provider = enabledProviderName;
      }

      if (settings.agents.defaults.model) {
        result.config.model = settings.agents.defaults.model;
      }
      if (settings.agents.defaults.maxToolIterations) {
        result.config.maxIterations = settings.agents.defaults.maxToolIterations;
      }
    } catch (err) {
      const error = err as Error;
      logger.debug("配置加载失败", { error: error.message });
      result.config.initialized = false;
    }

    // 4. 检查 Provider 状态
    logger.debug("检查 Provider 状态");
    // Provider 环境变量映射
    const providerEnvVars: Record<string, string> = {
      openai: "OPENAI_API_KEY",
      anthropic: "ANTHROPIC_API_KEY",
      openrouter: "OPENROUTER_API_KEY",
      bigmodel: "BIGMODEL_API_KEY",
      dashscope: "DASHSCOPE_API_KEY",
      deepseek: "DEEPSEEK_API_KEY",
      iflow: "IFLOW_API_KEY",
      kimi: "KIMI_API_KEY",
      lmstudio: "LMSTUDIO_BASE_URL",
      minimax: "MINIMAX_API_KEY",
      modelscope: "MODELSCOPE_API_KEY",
      ollama: "OLLAMA_BASE_URL",
      siliconflow: "SILICONFLOW_API_KEY",
    };

    // 收集所有配置的 provider 名称
    const configuredProviders = settings?.providers
      ? Object.keys(settings.providers)
      : [];

    // 遍历所有可能的环境变量
    for (const [name, envVar] of Object.entries(providerEnvVars)) {
      const hasKey = hasApiKey(envVar);
      const isConfigured = configuredProviders.includes(name);
      const isEnabled = settings?.providers?.[name as keyof typeof settings.providers]?.enabled === true;

      result.providers.push({
        name,
        available: hasKey && isConfigured && isEnabled,
        hasApiKey: hasKey,
      });
    }

    // 5. 检查工具状态
    logger.debug("检查工具状态");
    const toolDefinitions = getAllToolDefinitions();
    for (const tool of toolDefinitions) {
      result.tools.push({
        name: tool.name,
        description: tool.description,
        enabled: true,
      });
    }

    // 6. 检查技能状态
    logger.debug("检查技能状态");
    try {
      const skillLoader = new FilesystemSkillLoader();
      const skills = await skillLoader.listSkills();
      for (const skill of skills) {
        result.skills.push({
          name: skill.meta.name,
          description: skill.meta.description,
          loaded: true,
        });
      }
    } catch (err) {
      const error = err as Error;
      logger.debug("技能加载失败", { error: error.message });
    }

    // 7. 输出结果 - 直接返回结果，不输出到控制台
    logger.info("状态查询完成", {
      configInitialized: result.config.initialized,
      directoryCount: result.directories.length,
      fileCount: result.files.length,
      providerCount: result.providers.length,
      toolCount: result.tools.length,
      skillCount: result.skills.length,
    });
    logMethodReturn(logger, { method: "statusCommand", module: "CLI", result: { configInitialized: result.config.initialized, directoryCount: result.directories.length, fileCount: result.files.length }, duration: timer() });
    return result;
  } catch (err) {
    const error = err as Error;
    logMethodError(logger, {
      method: "statusCommand",
      module: "CLI",
      error: { name: error.name, message: error.message, ...(error.stack ? { stack: error.stack } : {}) },
      params: {},
      duration: timer(),
    });
    throw error;
  }
}

/**
 * 打印状态信息（保留接口，但不做任何输出）
 */
/**
 * 显示 status 命令帮助信息（保留接口，但不做任何输出）
 */
export function showStatusHelp(): void {
  // 已移除所有 console.log 调用
}
