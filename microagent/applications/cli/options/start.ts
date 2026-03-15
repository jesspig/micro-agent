/**
 * start 命令实现
 *
 * 启动 Agent 服务
 * - 初始化运行时目录
 * - 加载配置
 * - 初始化 Provider
 * - 注册工具
 * - 加载技能
 * - 初始化并启动 Channel
 * - 将 Channel 消息转发给 AgentLoop
 */

import { mkdirSync } from "node:fs";
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
import { HistoryLogger } from "../../shared/history-logger.js";
import { loadSettings, type Settings } from "../../config/loader.js";
import { getLogger, Logger, type LogLevel } from "../../shared/logger.js";
import {
  createOpenAIProvider,
  createAnthropicProvider,
} from "../../providers/index.js";
import { getAllTools, mcpManager } from "../../tools/index.js";
import { FilesystemSkillLoader } from "../../skills/index.js";
import { ToolRegistry } from "../../../runtime/tool/registry.js";
import { AgentLoop } from "../../../runtime/kernel/agent-loop.js";
import { SessionManager } from "../../../runtime/session/manager.js";
import { ChannelManager } from "../../../runtime/channel/manager.js";
import {
  createQQChannel,
  createFeishuChannel,
  createWechatWorkChannel,
  createDingTalkChannel,
} from "../../channels/index.js";
import type { IProviderExtended } from "../../../runtime/provider/contract.js";
import type { AgentConfig } from "../../../runtime/kernel/types.js";
import type { SingleProviderConfig } from "../../config/schema.js";
import type { IChannelExtended } from "../../../runtime/channel/contract.js";
import type { InboundMessage } from "../../../runtime/channel/types.js";

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

  // settings.yaml 特殊处理
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
 */
function createProvider(settings: Settings): IProviderExtended | null {
  const logger = getLogger();

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
        });
      }

      case "anthropic": {
        return createAnthropicProvider({
          name: providerName,
          apiKey: providerConfig.apiKey!,
          baseUrl: providerConfig.baseUrl!,
          models: providerConfig.models!,
        });
      }

      default: {
        logger.info(`使用 OpenAI 兼容模式创建 Provider: ${providerName}`);
        return createOpenAIProvider({
          name: providerName,
          apiKey: providerConfig.apiKey!,
          baseUrl: providerConfig.baseUrl!,
          models: providerConfig.models!,
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
  _name: string,
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
// Channel 创建
// ============================================================================

/**
 * 创建 Channel 实例
 */
function createChannels(settings: Settings): IChannelExtended[] {
  const logger = getLogger();
  const channels: IChannelExtended[] = [];
  const channelConfigs = settings.channels ?? {};

  // QQ Channel
  if (channelConfigs.qq?.enabled) {
    const qqConfig = channelConfigs.qq;
    if (qqConfig.appId && qqConfig.clientSecret) {
      try {
        const config = {
          id: "qq",
          type: "qq" as const,
          enabled: true,
          appId: qqConfig.appId,
          clientSecret: qqConfig.clientSecret,
          allowFrom: qqConfig.allowFrom,
          allowChannels: qqConfig.allowChannels,
        };
        const channel = createQQChannel(config as Parameters<typeof createQQChannel>[0]);
        channels.push(channel);
        logger.info(`创建 QQ Channel: ${qqConfig.appId} (沙箱模式)`);
      } catch (error) {
        logger.error(`创建 QQ Channel 失败: ${error}`);
      }
    } else {
      logger.warn("QQ Channel 已启用但配置不完整（需要 appId 和 clientSecret）");
    }
  }

  // 飞书 Channel
  if (channelConfigs.feishu?.enabled) {
    const feishuConfig = channelConfigs.feishu;
    if (feishuConfig.appId && feishuConfig.appSecret) {
      try {
        const config = {
          id: "feishu",
          type: "feishu" as const,
          enabled: true,
          appId: feishuConfig.appId,
          appSecret: feishuConfig.appSecret,
          allowFrom: feishuConfig.allowFrom,
        };
        const channel = createFeishuChannel(config as Parameters<typeof createFeishuChannel>[0]);
        channels.push(channel);
        logger.info(`创建飞书 Channel: ${feishuConfig.appId}`);
      } catch (error) {
        logger.error(`创建飞书 Channel 失败: ${error}`);
      }
    } else {
      logger.warn("飞书 Channel 已启用但配置不完整");
    }
  }

  // 企业微信 Channel
  if (channelConfigs.wechatWork?.enabled) {
    const wechatConfig = channelConfigs.wechatWork;
    if (wechatConfig.botId || wechatConfig.webhookKey) {
      try {
        const config = {
          id: "wechatWork",
          type: "wechat-work" as const,
          enabled: true,
          botId: wechatConfig.botId,
          secret: wechatConfig.secret,
          webhookKey: wechatConfig.webhookKey,
          corpId: wechatConfig.corpId,
          agentId: wechatConfig.agentId,
          allowFrom: wechatConfig.allowFrom,
        };
        const channel = createWechatWorkChannel(config as Parameters<typeof createWechatWorkChannel>[0]);
        channels.push(channel);
        logger.info(`创建企业微信 Channel`);
      } catch (error) {
        logger.error(`创建企业微信 Channel 失败: ${error}`);
      }
    } else {
      logger.warn("企业微信 Channel 已启用但配置不完整");
    }
  }

  // 钉钉 Channel
  if (channelConfigs.dingtalk?.enabled) {
    const dingtalkConfig = channelConfigs.dingtalk;
    if (dingtalkConfig.clientId && dingtalkConfig.clientSecret) {
      try {
        const config = {
          id: "dingtalk",
          type: "dingtalk" as const,
          enabled: true,
          clientId: dingtalkConfig.clientId,
          clientSecret: dingtalkConfig.clientSecret,
          allowFrom: dingtalkConfig.allowFrom,
        };
        const channel = createDingTalkChannel(config as Parameters<typeof createDingTalkChannel>[0]);
        channels.push(channel);
        logger.info(`创建钉钉 Channel: ${dingtalkConfig.clientId}`);
      } catch (error) {
        logger.error(`创建钉钉 Channel 失败: ${error}`);
      }
    } else {
      logger.warn("钉钉 Channel 已启用但配置不完整");
    }
  }

  return channels;
}

// ============================================================================
// Agent 消息处理
// ============================================================================

/**
 * 创建消息处理器（将 Channel 消息转发给 AgentLoop）
 */
function createMessageHandler(
  agent: AgentLoop,
  sessionManager: SessionManager,
  channels: IChannelExtended[],
  settings: Settings
): (message: InboundMessage) => Promise<void> {
  const logger = getLogger();

  // 单用户模式：使用全局统一的 session key
  const GLOBAL_SESSION_KEY = "global";

  // 获取上下文配置
  const contextWindowTokens = settings.sessions?.contextWindowTokens ?? 65535;
  const compressionTokenThreshold = settings.sessions?.compressionTokenThreshold ?? 0.7;

  // 获取工作目录
  const workspaceDir = settings.agents.defaults.workspace || "~/.micro-agent/workspace";
  const historyLogger = new HistoryLogger(workspaceDir);

  return async (message: InboundMessage) => {
    try {
      logger.info(`收到消息 [${message.channelId}] ${message.from}: ${message.text}`);

      // 使用全局 session（跨平台共享上下文）
      const session = sessionManager.getOrCreate(GLOBAL_SESSION_KEY);

      // 添加用户消息并持久化
      await session.addMessageAndPersist({
        role: "user",
        content: message.text,
      });

      // 获取所有消息
      const allMessages = session.getMessages();

      // 根据 token 限制选择消息
      const {
        estimateMessagesTokens,
        selectMessagesByTokens,
      } = await import("../../shared/token-estimator.js");

      const totalTokens = estimateMessagesTokens(allMessages);
      const compressionThreshold = contextWindowTokens * compressionTokenThreshold;

      let result: Awaited<ReturnType<typeof agent.run>>;

      if (totalTokens > compressionThreshold) {
        // 超过压缩阈值，选择最近的消息
        const selectedMessages = selectMessagesByTokens(allMessages, contextWindowTokens);
        
        // 找出未选择的消息（需要归档的消息）
        const archivedMessages = allMessages.slice(0, allMessages.length - selectedMessages.length);
        
        if (archivedMessages.length > 0) {
          // 归档到历史日志
          const archived = await historyLogger.appendToHistory(archivedMessages);
          if (archived) {
            logger.info(`归档历史: ${archivedMessages.length} 条消息到历史日志`);
          }
        }

        logger.debug(`上下文压缩: ${allMessages.length} 条消息 (${totalTokens} tokens) → ${selectedMessages.length} 条消息`);

        // 运行 Agent
        result = await agent.run(selectedMessages);
      } else {
        // 运行 Agent
        result = await agent.run(allMessages);
      }

      // 日志输出
      logger.debug(`Agent 结果: content=${result.content ? '有内容' : '无内容'}, error=${result.error || '无错误'}`);

      // 更新 session 并持久化新消息
      if (result.messages) {
        const previousCount = session.getState().messageCount;
        session.clear();
        
        let index = 0;
        for (const msg of result.messages) {
          // 只持久化新增的消息（索引 >= previousCount 的消息）
          if (index >= previousCount) {
            await session.addMessageAndPersist(msg);
          } else {
            session.addMessage(msg);
          }
          index++;
        }
      }

      // 发送回复
      if (result.content) {
        const channel = channels.find((c) => c.id === message.channelId);
        if (channel) {
          // 回复目标：群聊回复到群，私聊回复给发送者
          const replyTo = message.to || message.from;
          const sendResult = await channel.send({
            to: replyTo,
            text: result.content,
            format: "markdown", // 使用 Markdown 格式
            metadata: message.metadata, // 传递 Channel 特定元数据
          });
          if (sendResult.success) {
            logger.info(`发送回复 [${message.channelId}] ${replyTo}: ${result.content.substring(0, 100)}...`);
          } else {
            logger.error(`发送回复失败 [${message.channelId}]: ${sendResult.error}`);
          }
        } else {
          logger.error(`找不到 Channel: ${message.channelId}`);
        }
      } else if (result.error) {
        logger.error(`Agent 执行错误: ${result.error}`);
      } else {
        logger.warn(`Agent 返回空内容`);
      }
    } catch (error) {
      logger.error(`处理消息失败: ${error}`);
    }
  };
}

// ============================================================================
// Agent 循环（前台日志输出模式）
// ============================================================================

/**
 * 运行 Agent 服务
 */
async function runAgentService(
  provider: IProviderExtended,
  toolRegistry: ToolRegistry,
  sessionManager: SessionManager,
  channelManager: ChannelManager,
  channels: IChannelExtended[],
  settings: Settings,
  options: StartOptions
): Promise<void> {
  const logger = getLogger();

  // 创建 AgentLoop
  const agentConfig: AgentConfig = {
    model: settings.agents.defaults.model ?? "default",
    maxIterations: settings.agents.defaults.maxToolIterations ?? 50,
    defaultTimeout: 60000,
    enableLogging: options.debug ?? false,
  };
  const agent = new AgentLoop(provider, toolRegistry, agentConfig);

  // 创建消息处理器
  const messageHandler = createMessageHandler(agent, sessionManager, channels, settings);

  // 注册消息处理器到所有 Channel
  for (const channel of channels) {
    channel.onMessage(messageHandler);
  }

  // 启动所有 Channel
  logger.info("启动 Channel...");
  await channelManager.startAll();

  logger.info("Agent 服务已启动，等待消息...");
  logger.info(`已启用 ${channels.length} 个 Channel`);

  // 保持运行
  return new Promise((resolve) => {
    const cleanup = async () => {
      logger.info("正在停止服务...");

      // 关闭 MCP 连接
      try {
        const { mcpManager } = await import("../../tools/mcp/index.js");
        await mcpManager.closeAll();
        logger.info("MCP 连接已关闭");
      } catch (error) {
        logger.warn(`关闭 MCP 连接时出错: ${error}`);
      }

      // 停止 Channel
      await channelManager.stopAll();
      logger.info("Agent 服务已停止");
      resolve();
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

  // 全局错误处理：捕获 Channel SDK 的异步错误
  const handleUncaughtError = (error: Error & { code?: string }) => {
    // 网络连接错误（SDK 内部错误）
    if (error.code === "ECONNREFUSED" || error.code === "ENOTFOUND") {
      logger.error(`网络连接错误: ${error.message}`);
      // 不退出进程，只记录错误
      return;
    }

    // 其他未捕获的错误
    logger.error(`未捕获的错误: ${error.message}`);
    console.error(error);
  };

  process.on("uncaughtException", handleUncaughtError);

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

    // 4. 覆盖模型
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

    // 5.1 异步加载 MCP 工具（不阻塞启动）
    const loadMCPTools = async () => {
      try {
        const mcpConfig = await mcpManager.loadConfig();
        const serverCount = Object.keys(mcpConfig.mcpServers).length;

        if (serverCount === 0) {
          logger.info("未配置 MCP 服务器");
          return;
        }

        logger.info(`正在连接 ${serverCount} 个 MCP 服务器...`);

        const results = await mcpManager.connectAll((tool, serverName) => {
          toolRegistry.register(tool);
          logger.debug(`注册 MCP 工具: ${tool.name} (来自 ${serverName})`);
        });

        const connected = results.filter((r) => r.status === "connected");
        const failed = results.filter((r) => r.status === "error");
        const skipped = results.filter((r) => r.status === "disconnected");

        if (connected.length > 0) {
          const totalTools = connected.reduce((sum, r) => sum + r.toolCount, 0);
          logger.info(`MCP: 已连接 ${connected.length} 个服务器，共 ${totalTools} 个工具`);
        }

        if (skipped.length > 0) {
          logger.info(`MCP: 跳过 ${skipped.length} 个禁用的服务器`);
        }

        if (failed.length > 0) {
          for (const r of failed) {
            logger.warn(`MCP 服务器 "${r.name}" 连接失败: ${r.error}`);
          }
        }
      } catch (error) {
        logger.error(`加载 MCP 工具失败: ${error instanceof Error ? error.message : String(error)}`);
      }
    };

    // 后台异步加载 MCP，不阻塞启动
    loadMCPTools();

    // 6. 加载技能
    logger.info("加载技能...");
    const skillLoader = new FilesystemSkillLoader();
    const skills = await skillLoader.listSkills();
    if (skills.length > 0) {
      for (const skill of skills) {
        logger.info(`加载技能: ${skill.meta.name}`);
      }
    }

    // 7. 创建 Provider
    const provider = createProvider(settings);
    if (!provider) {
      logger.error("未找到可用的 Provider，请检查 settings.yaml 配置");
      return { success: false, error: "未找到可用的 Provider" };
    }
    logger.info(`Provider 已初始化`);

    // 8. 创建 Channel
    const channels = createChannels(settings);
    if (channels.length === 0) {
      logger.warn("未启用任何 Channel，Agent 将无法接收消息");
      logger.info("请在 settings.yaml 中启用至少一个 Channel");
    }

    // 9. 创建 Session 管理器并加载历史会话
    const sessionManager = new SessionManager();
    const GLOBAL_SESSION_KEY = "global";

    // 读取会话配置
    const contextWindowTokens = settings.sessions?.contextWindowTokens ?? 65535;
    const compressionTokenThreshold = settings.sessions?.compressionTokenThreshold ?? 0.7;
    const persistEnabled = settings.sessions?.persist ?? true;

    // 仅在持久化启用时加载历史
    if (persistEnabled) {
      try {
        await sessionManager.loadHistory(GLOBAL_SESSION_KEY);
        const session = sessionManager.get(GLOBAL_SESSION_KEY);
        const messageCount = session?.getState().messageCount ?? 0;
        logger.info(`已加载历史会话（共 ${messageCount} 条消息）`);
      } catch (error) {
        logger.warn(`加载历史会话失败: ${error}`);
      }
    }

    // 10. 创建 Channel 管理器
    const channelManager = new ChannelManager();
    for (const channel of channels) {
      channelManager.register(channel);
    }

    // 11. 启动 Agent 服务
    await runAgentService(
      provider,
      toolRegistry,
      sessionManager,
      channelManager,
      channels,
      settings,
      options
    );

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

Channel 配置:
  在 settings.yaml 中启用 Channel 以接收消息:
  
  channels:
    qq:
      enabled: true
      appId: "your_app_id"
      secret: "your_secret"
      allowFrom: ["*"]  # 允许所有用户
`);
}
