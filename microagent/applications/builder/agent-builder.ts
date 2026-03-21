/**
 * Agent 构建器
 *
 * 负责协调组装 Agent 运行所需的全部组件
 * 通过组合专职模块完成构建工作
 */

import {
  AgentLoop,
  SessionManager,
  setRuntimeLogSink,
  type LogSink,
  type IProviderExtended,
  type AgentConfig,
  type AgentEventHandler,
  type ToolRegistry,
  type SkillRegistry,
} from "../../runtime/index.js";
import {
  MICRO_AGENT_DIR,
  WORKSPACE_DIR,
  SESSIONS_DIR,
  LOGS_DIR,
  HISTORY_DIR,
  SKILLS_DIR,
  DEFAULT_MAX_ITERATIONS,
  DEFAULT_TIMEOUT_MS,
} from "../shared/constants.js";
import { builderLogger, createTimer, sanitize, logMethodCall, logMethodReturn, logMethodError } from "../shared/logger.js";

import { ConfigManager } from "./config-manager.js";
import { RuntimeInitializer } from "./runtime-initializer.js";
import { ProviderFactory } from "./provider-factory.js";
import { ToolManager } from "./tool-manager.js";
import { SkillManager } from "./skill-manager.js";

const MODULE_NAME = "AgentBuilder";

// ============================================================================
// 构建结果类型
// ============================================================================

/**
 * Agent 构建结果
 */
export interface AgentBuildResult {
  /** Agent 循环实例 */
  agent: AgentLoop;
  /** 会话管理器 */
  sessionManager: SessionManager;
  /** 工具注册表 */
  tools: ToolRegistry;
  /** 技能注册表 */
  skills: SkillRegistry;
  /** 加载的配置 */
  settings: unknown;
  /** 运行时目录路径 */
  paths: {
    root: string;
    workspace: string;
    sessions: string;
    logs: string;
    history: string;
    skills: string;
  };
}

// ============================================================================
// AgentBuilder 类
// ============================================================================

/**
 * Agent 构建器
 *
 * 提供流式 API 组装 Agent 组件
 * 通过组合专职模块完成构建工作
 */
export class AgentBuilder {
  /** 配置管理器 */
  private readonly configManager = new ConfigManager();

  /** 运行时初始化器 */
  private readonly runtimeInitializer = new RuntimeInitializer();

  /** Provider 工厂 */
  private readonly providerFactory = new ProviderFactory();

  /** 工具管理器 */
  private readonly toolManager = new ToolManager();

  /** 技能管理器 */
  private readonly skillManager = new SkillManager();

  /** Agent 配置 */
  private agentConfig: Partial<AgentConfig> = {};

  /** 事件处理器 */
  private eventHandlers: AgentEventHandler[] = [];

  // ============================================================================
  // 配置方法
  // ============================================================================

  /**
   * 指定配置文件路径
   * @param path - 配置文件路径
   * @returns 构建器实例
   */
  withConfigPath(path: string): this {
    this.configManager.withConfigPath(path);
    return this;
  }

  /**
   * 直接设置配置对象
   * @param settings - 配置对象
   * @returns 构建器实例
   */
  withSettings(settings: unknown): this {
    this.configManager.withSettings(settings);
    return this;
  }

  /**
   * 设置自定义 Provider
   * @param provider - Provider 实例
   * @returns 构建器实例
   */
  withProvider(provider: IProviderExtended): this {
    this.providerFactory.withCustomProvider(provider);
    return this;
  }

  /**
   * 添加工具
   * @param names - 工具名称列表
   * @returns 构建器实例
   */
  withTools(names: string[]): this {
    this.toolManager.withCustomToolNames(names);
    return this;
  }

  /**
   * 设置 Agent 配置
   * @param config - Agent 配置
   * @returns 构建器实例
   */
  withAgentConfig(config: Partial<AgentConfig>): this {
    this.agentConfig = { ...this.agentConfig, ...config };
    return this;
  }

  /**
   * 添加事件处理器
   * @param handler - 事件处理器
   * @returns 构建器实例
   */
  withEventHandler(handler: AgentEventHandler): this {
    this.eventHandlers.push(handler);
    return this;
  }

  /**
   * 设置 MCP 管理器
   * @param manager - MCP 管理器
   * @returns 构建器实例
   */
  withMCPManager(manager: unknown): this {
    this.toolManager.withMCPManager(manager);
    return this;
  }

  // ============================================================================
  // 构建方法
  // ============================================================================

  /**
   * 构建 Agent
   * @returns 构建结果
   */
  async build(): Promise<AgentBuildResult> {
    const timer = createTimer();
    const logger = builderLogger();
    logMethodCall(logger, { method: "build", module: MODULE_NAME });

    try {
      // 设置 Runtime 日志 Sink，统一通过 LogTape 输出
      const runtimeSink: LogSink = (level, message, context) => {
        const log = logger as any;
        const levelMap: Record<string, "debug" | "info" | "warn" | "error"> = {
          debug: "debug",
          info: "info",
          warning: "warn",
          error: "error",
        };
        const mappedLevel = levelMap[level] ?? "info";
        if (context) {
          log[mappedLevel]?.(`[runtime] ${message}`, context);
        } else {
          log[mappedLevel]?.(`[runtime] ${message}`);
        }
      };
      setRuntimeLogSink(runtimeSink);

      // 1. 初始化运行时目录
      // 1. 初始化运行时目录
      logger.info("Agent构建", { step: "ensureDirectories" });
      await this.runtimeInitializer.ensureDirectories();

      // 2. 加载配置
      logger.info("Agent构建", { step: "loadSettings" });
      const settings = await this.configManager.load();

      // 3. 创建 Provider
      logger.info("Agent构建", { step: "createProvider" });
      const provider = await this.providerFactory.create(settings);

      // 4. 注册工具
      logger.info("Agent构建", { step: "registerTools" });
      await this.toolManager.register(settings);

      // 5. 加载技能
      logger.info("Agent构建", { step: "loadSkills" });
      await this.skillManager.load();

      // 6. 创建 Agent 配置
      const agentConfig = this.createAgentConfig(settings);

      // 7. 创建 Agent 实例
      logger.info("Agent构建", { step: "createAgentInstance", model: agentConfig.model });
      const tools = this.toolManager.getRegistry();
      const agent = new AgentLoop(provider, tools, agentConfig);

      // 8. 注册事件处理器
      for (const handler of this.eventHandlers) {
        agent.on(handler);
      }

      // 9. 创建会话管理器
      const sessionManager = new SessionManager();

      const result = {
        agent,
        sessionManager,
        tools,
        skills: this.skillManager.getRegistry(),
        settings,
        paths: {
          root: MICRO_AGENT_DIR,
          workspace: WORKSPACE_DIR,
          sessions: SESSIONS_DIR,
          logs: LOGS_DIR,
          history: HISTORY_DIR,
          skills: SKILLS_DIR,
        },
      };

      logMethodReturn(logger, {
        method: "build",
        module: MODULE_NAME,
        result: { toolsCount: tools.list().length, skillsCount: this.skillManager.getRegistry().list().length },
        duration: timer(),
      });

      return result;
    } catch (err) {
      const error = err as Error;
      logMethodError(logger, {
        method: "build",
        module: MODULE_NAME,
        error: { name: error.name, message: error.message, ...(error.stack ? { stack: error.stack } : {}) },
        duration: timer(),
      });
      throw error;
    }
  }

  // ============================================================================
  // 私有方法
  // ============================================================================

  /**
   * 创建 Agent 配置
   * @param settings - 配置对象
   * @returns Agent 配置
   */
  private createAgentConfig(settings: unknown): AgentConfig {
    const timer = createTimer();
    const logger = builderLogger();
    logMethodCall(logger, { method: "createAgentConfig", module: MODULE_NAME });

    const agentDefaults = (settings as { agents?: { defaults?: { model?: string; maxToolIterations?: number } } }).agents?.defaults;

    // 处理模型名：剥离 provider 前缀
    let model = this.agentConfig.model ?? agentDefaults?.model ?? "default";
    const slashIndex = model.indexOf("/");
    if (slashIndex >= 0) {
      model = model.substring(slashIndex + 1);
      logger.debug("剥离模型 provider 前缀", {
        originalModel: this.agentConfig.model ?? agentDefaults?.model,
        strippedModel: model,
      });
    }

    const config: AgentConfig = {
      model,
      maxIterations: this.agentConfig.maxIterations ?? agentDefaults?.maxToolIterations ?? DEFAULT_MAX_ITERATIONS,
      defaultTimeout: this.agentConfig.defaultTimeout ?? DEFAULT_TIMEOUT_MS,
      enableLogging: this.agentConfig.enableLogging ?? false,
    };

    logMethodReturn(logger, {
      method: "createAgentConfig",
      module: MODULE_NAME,
      result: sanitize(config),
      duration: timer(),
    });

    return config;
  }
}

// ============================================================================
// 便捷函数
// ============================================================================

/**
 * 创建默认 Agent
 * @param configPath - 可选的配置文件路径
 * @returns 构建结果
 */
export async function createAgent(configPath?: string): Promise<AgentBuildResult> {
  const timer = createTimer();
  const logger = builderLogger();
  logMethodCall(logger, { method: "createAgent", module: MODULE_NAME, params: { configPath } });

  try {
    const builder = new AgentBuilder();
    if (configPath) {
      builder.withConfigPath(configPath);
    }
    const result = await builder.build();

    logMethodReturn(logger, {
      method: "createAgent",
      module: MODULE_NAME,
      result: { toolsCount: result.tools.list().length, skillsCount: result.skills.list().length },
      duration: timer(),
    });

    return result;
  } catch (err) {
    const error = err as Error;
    logMethodError(logger, {
      method: "createAgent",
      module: MODULE_NAME,
      error: { name: error.name, message: error.message, ...(error.stack ? { stack: error.stack } : {}) },
      params: { configPath },
      duration: timer(),
    });
    throw error;
  }
}

/**
 * 初始化运行时目录
 * 仅创建目录结构，不构建 Agent
 */
export async function initRuntimeDirectories(): Promise<void> {
  const timer = createTimer();
  const logger = builderLogger();
  logMethodCall(logger, { method: "initRuntimeDirectories", module: MODULE_NAME });

  try {
    const initializer = new RuntimeInitializer();
    await initializer.ensureDirectories();

    logMethodReturn(logger, {
      method: "initRuntimeDirectories",
      module: MODULE_NAME,
      result: { success: true },
      duration: timer(),
    });
  } catch (err) {
    const error = err as Error;
    logMethodError(logger, {
      method: "initRuntimeDirectories",
      module: MODULE_NAME,
      error: { name: error.name, message: error.message, ...(error.stack ? { stack: error.stack } : {}) },
      duration: timer(),
    });
    throw error;
  }
}
