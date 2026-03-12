/**
 * start 命令实现
 *
 * 启动 Agent 服务
 * - 初始化运行时目录
 * - 加载配置
 * - 初始化 Provider
 * - 注册工具
 * - 加载技能
 * - 启动 Agent 循环（前台日志输出模式）
 */

import { mkdirSync } from "node:fs";
import * as readline from "node:readline";
import {
  MICRO_AGENT_DIR,
  WORKSPACE_DIR,
  AGENT_DIR,
  SESSIONS_DIR,
  LOGS_DIR,
  HISTORY_DIR,
  SKILLS_DIR,
  SETTINGS_FILE,
  AGENTS_FILE,
  SOUL_FILE,
  USER_FILE,
  TOOLS_FILE,
  HEARTBEAT_FILE,
  MEMORY_FILE,
  MCP_CONFIG_FILE,
} from "../../shared/constants.js";
import { loadSettings, type Settings } from "../../config/loader.js";
import { getLogger, Logger, type LogLevel } from "../../shared/logger.js";
import {
  createOpenAIProvider,
  createAnthropicProvider,
} from "../../providers/index.js";
import { getAllTools } from "../../tools/index.js";
import { FilesystemSkillLoader } from "../../skills/index.js";
import { ToolRegistry } from "../../../runtime/tool/registry.js";
import { AgentLoop } from "../../../runtime/kernel/agent-loop.js";
import type { IProvider } from "../../../runtime/contracts.js";
import type { AgentConfig } from "../../../runtime/kernel/types.js";
import type { SingleProviderConfig } from "../../config/schema.js";

// ============================================================================
// 类型定义
// ============================================================================

/**
 * start 命令选项
 */
export interface StartOptions {
  /** 配置文件路径 */
  config?: string;
  /** 覆盖配置中的模型 */
  model?: string;
  /** 启用调试模式 */
  debug?: boolean;
  /** 日志级别 */
  logLevel?: LogLevel;
  /** 初始消息 */
  message?: string;
}

/**
 * start 命令结果
 */
export interface StartResult {
  /** 是否成功启动 */
  success: boolean;
  /** 错误信息 */
  error?: string;
}

// ============================================================================
// 运行时目录初始化
// ============================================================================

/**
 * 初始化运行时目录结构
 */
function initializeRuntimeDirectories(): void {
  const dirs = [
    MICRO_AGENT_DIR,
    WORKSPACE_DIR,
    AGENT_DIR,
    SESSIONS_DIR,
    LOGS_DIR,
    HISTORY_DIR,
    SKILLS_DIR,
  ];

  for (const dir of dirs) {
    mkdirSync(dir, { recursive: true });
  }
}

/**
 * 初始化配置文件（从模板复制）
 */
async function initializeConfigFiles(): Promise<void> {
  const templateDir = import.meta.dir + "/../../templates";
  const configFiles = [
    { src: "AGENTS.md", dest: AGENTS_FILE },
    { src: "SOUL.md", dest: SOUL_FILE },
    { src: "USER.md", dest: USER_FILE },
    { src: "TOOLS.md", dest: TOOLS_FILE },
    { src: "HEARTBEAT.md", dest: HEARTBEAT_FILE },
    { src: "MEMORY.md", dest: MEMORY_FILE },
    { src: "mcp.json", dest: MCP_CONFIG_FILE },
  ];

  for (const { src, dest } of configFiles) {
    const destFile = Bun.file(dest);
    if (!(await destFile.exists())) {
      const srcFile = Bun.file(`${templateDir}/${src}`);
      if (await srcFile.exists()) {
        const content = await srcFile.text();
        await Bun.write(dest, content);
      }
    }
  }

  // settings.yaml 特殊处理：使用 settings.example.yaml 作为模板
  const settingsFile = Bun.file(SETTINGS_FILE);
  if (!(await settingsFile.exists())) {
    const exampleFile = Bun.file(`${templateDir}/settings.example.yaml`);
    if (await exampleFile.exists()) {
      const content = await exampleFile.text();
      await Bun.write(SETTINGS_FILE, content);
    }
  }
}

// ============================================================================
// Provider 创建
// ============================================================================

/**
 * 创建 Provider 实例
 *
 * @param settings - 配置对象
 * @returns Provider 实例，如果配置不完整返回 null
 */
function createProvider(settings: Settings): IProvider | null {
  const logger = getLogger();
  const model = settings.agents.defaults.model;

  // 从配置中获取启用的 Provider
  const providers = settings.providers ?? {};
  const enabledProvider = Object.entries(providers).find(
    ([_, config]) => config?.enabled === true
  );

  if (!enabledProvider) {
    return null;
  }

  const [providerName, providerConfig] = enabledProvider;

  if (!providerConfig) {
    logger.warn(`Provider "${providerName}" 配置不存在`);
    return null;
  }

  // 验证必需配置
  const validation = validateProviderConfig(providerName, providerConfig);
  if (!validation.valid) {
    logger.warn(`Provider "${providerName}" 配置不完整: ${validation.errors.join(", ")}`);
    return null;
  }

  try {
    switch (providerName) {
      case "openai": {
        return createOpenAIProvider({
          name: providerName,
          apiKey: providerConfig.apiKey!,
          baseUrl: providerConfig.baseUrl!,
          models: providerConfig.models!,
          defaultModel: model,
        });
      }

      case "anthropic": {
        return createAnthropicProvider({
          name: providerName,
          apiKey: providerConfig.apiKey!,
          models: providerConfig.models!,
          defaultModel: model,
        });
      }

      default: {
        logger.info(`使用 OpenAI 兼容模式创建 Provider: ${providerName}`);
        return createOpenAIProvider({
          name: providerName,
          apiKey: providerConfig.apiKey!,
          baseUrl: providerConfig.baseUrl!,
          models: providerConfig.models!,
          defaultModel: model,
        });
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`创建 Provider "${providerName}" 失败: ${message}`);
    return null;
  }
}

/**
 * 验证 Provider 配置完整性
 */
function validateProviderConfig(
  name: string,
  config: SingleProviderConfig
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!config.baseUrl) {
    errors.push("baseUrl 未配置");
  }

  if (!config.models || config.models.length === 0) {
    errors.push("models 未配置");
  }

  return { valid: errors.length === 0, errors };
}

// ============================================================================
// Agent 循环（前台日志输出模式）
// ============================================================================

/**
 * 运行 Agent 循环（前台日志输出模式）
 */
async function runAgentLoop(
  provider: IProvider | null,
  toolRegistry: ToolRegistry,
  settings: Settings,
  options: StartOptions
): Promise<void> {
  const logger = getLogger();

  logger.info("Agent 服务已启动，等待消息...");

  // 显示配置提示
  if (!provider) {
    logger.warn("未找到已启用的 Provider，请在 settings.yaml 中启用一个 Provider");
    logger.info("修改配置后请重启服务");
  }

  // 使用 stdin 保持进程运行，按 Ctrl+C 或 Ctrl+D 退出
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.on("close", () => {
      logger.info("Agent 服务已停止");
      resolve();
    });

    // 保持进程运行的备用方案
    const keepAlive = setInterval(() => {}, 24 * 60 * 60 * 1000);

    // 清理函数
    const cleanup = () => {
      clearInterval(keepAlive);
      rl.close();
    };

    process.on("SIGINT", cleanup);
    process.on("SIGTERM", cleanup);
  });
}

// ============================================================================
// start 命令实现
// ============================================================================

/**
 * 执行 start 命令
 */
export async function startCommand(
  options: StartOptions = {}
): Promise<StartResult> {
  const logger = getLogger();

  try {
    // 1. 设置日志级别
    if (options.debug || options.logLevel) {
      const level = options.logLevel ?? "debug";
      new Logger({ level });
    }

    logger.info("启动 MicroAgent...");

    // 2. 初始化运行时目录
    logger.info("初始化运行时目录...");
    initializeRuntimeDirectories();
    await initializeConfigFiles();

    // 3. 加载配置
    const configPath = options.config ?? SETTINGS_FILE;
    logger.info(`加载配置: ${configPath}`);

    let settings: Settings;
    try {
      settings = await loadSettings(configPath);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`配置加载失败: ${message}`);
      logger.error("运行 'micro-agent config' 初始化配置");
      return { success: false, error: message };
    }

    // 4. 覆盖模型（如果指定）
    if (options.model) {
      settings.agents.defaults.model = options.model;
      logger.info(`覆盖模型: ${options.model}`);
    }

    // 5. 注册工具
    logger.info("注册工具...");
    const toolRegistry = new ToolRegistry();
    const tools = getAllTools();
    for (const tool of tools) {
      toolRegistry.register(tool);
      logger.debug(`注册工具: ${tool.name}`);
    }

    // 6. 加载技能
    logger.info("加载技能...");
    const skillLoader = new FilesystemSkillLoader();
    const skills = await skillLoader.listSkills();

    if (skills.length > 0) {
      for (const skill of skills) {
        logger.info(`加载技能: ${skill.meta.name}`);
      }
    } else {
      logger.info("暂无技能");
    }

    // 7. 创建 Provider（可能为空）
    const providers = settings.providers ?? {};
    const enabledProviderName = Object.entries(providers).find(
      ([_, config]) => config?.enabled === true
    )?.[0] ?? "unknown";

    logger.info(`初始化 Provider: ${enabledProviderName}`);
    const provider = createProvider(settings);

    // 8. 创建 Agent（如果 Provider 可用）
    if (provider) {
      const agentConfig: AgentConfig = {
        model: settings.agents.defaults.model ?? "default",
        maxIterations: settings.agents.defaults.maxToolIterations ?? 50,
        defaultTimeout: 60000,
        enableLogging: options.debug ?? false,
      };
      const agent = new AgentLoop(provider, toolRegistry, agentConfig);
      logger.info("初始化完成");
    } else {
      logger.warn("Provider 配置不完整，请修改 settings.yaml 后重启服务");
      logger.info("初始化完成（等待有效配置）");
    }

    // 9. 运行 Agent 循环
    await runAgentLoop(provider, toolRegistry, settings, options);

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("启动失败", error);
    return { success: false, error: message };
  }
}

/**
 * 显示 start 命令帮助信息
 */
export function showStartHelp(): void {
  console.log(`
micro-agent start - 启动 Agent 服务

用法:
  micro-agent start [选项]

选项:
  --config, -c <path>   配置文件路径
  --model, -m <model>   覆盖配置中的模型
  --debug, -d           启用调试模式
  --log-level <level>   日志级别 (debug, info, warn, error)
  --help, -h            显示帮助信息

示例:
  micro-agent start                    # 使用默认配置启动
  micro-agent start --debug            # 启用调试模式
  micro-agent start -m gpt-4o          # 使用指定模型
  micro-agent start -c ./my-config.yaml # 使用自定义配置
`);
}