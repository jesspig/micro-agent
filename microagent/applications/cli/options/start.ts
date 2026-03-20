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
import {
  createOpenAIProvider,
  createAnthropicProvider,
} from "../../providers/index.js";
import { getAllTools, MCPManager } from "../../tools/index.js";
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
import type { Message } from "../../../runtime/types.js";
import type { SingleProviderConfig } from "../../config/schema.js";
import type { IChannelExtended } from "../../../runtime/channel/contract.js";
import type { InboundMessage } from "../../../runtime/channel/types.js";
import {
  cliLogger,
  createTimer,
  logMethodCall,
  logMethodReturn,
  logMethodError,
} from "../../shared/logger.js";
import {
  buildSystemPrompt,
  buildRuntimeContext,
  getCurrentDateString,
} from "../../prompts/index.js";
import { readFile } from "node:fs/promises";

const logger = cliLogger();

// 创建 MCP 管理器实例（不使用全局单例，显式依赖注入）
const mcpManager = new MCPManager();

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
  const timer = createTimer();
  logMethodCall(logger, { method: "initializeRuntimeDirectories", module: "CLI", params: {} });

  const dirs = [
    MICRO_AGENT_DIR,
    WORKSPACE_DIR,
    SESSIONS_DIR,
    LOGS_DIR,
    HISTORY_DIR,
    SKILLS_DIR,
  ];

  for (const dir of dirs) {
    mkdirSync(dir, { recursive: true });
  }

  logger.debug("运行时目录初始化完成", { directories: dirs });
  logMethodReturn(logger, { method: "initializeRuntimeDirectories", module: "CLI", result: { success: true, count: dirs.length }, duration: timer() });
}

/**
 * 初始化配置文件（从模板复制）
 */
async function initializeConfigFiles(): Promise<void> {
  const timer = createTimer();
  logMethodCall(logger, { method: "initializeConfigFiles", module: "CLI", params: {} });

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

  const createdFiles: string[] = [];

  for (const { src, dest } of configFiles) {
    const destFile = Bun.file(dest);
    if (!(await destFile.exists())) {
      const srcFile = Bun.file(`${templateDir}/${src}`);
      if (await srcFile.exists()) {
        const content = await srcFile.text();
        await Bun.write(dest, content);
        createdFiles.push(dest);
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
      createdFiles.push(SETTINGS_FILE);
    }
  }

  if (createdFiles.length > 0) {
    logger.debug("配置文件初始化完成", { createdFiles });
  }
  logMethodReturn(logger, { method: "initializeConfigFiles", module: "CLI", result: { success: true, createdCount: createdFiles.length }, duration: timer() });
}

// ============================================================================
// Provider 创建
// ============================================================================

/**
 * 创建 Provider 实例
 */
function createProvider(settings: Settings): IProviderExtended | null {
  const timer = createTimer();
  logMethodCall(logger, { method: "createProvider", module: "CLI", params: {} });

  const providers = settings.providers ?? {};
  const model = settings.agents?.defaults?.model ?? "";

  // 解析模型名中的 provider 前缀
  const slashIndex = model.indexOf("/");
  let targetProviderName: string | null = null;

  if (slashIndex >= 0) {
    targetProviderName = model.substring(0, slashIndex);
  }

  let selectedProvider: [string, SingleProviderConfig] | null = null;

  if (targetProviderName) {
    // 模型名包含 provider 前缀，直接查找该 provider
    const config = providers[targetProviderName];
    if (!config) {
      logger.error("Provider 未找到", { targetProviderName, model });
      logMethodReturn(logger, { method: "createProvider", module: "CLI", result: null, duration: timer() });
      return null;
    }
    if (!config.enabled) {
      logger.error("Provider 未启用", { targetProviderName, model });
      logMethodReturn(logger, { method: "createProvider", module: "CLI", result: null, duration: timer() });
      return null;
    }
    selectedProvider = [targetProviderName, config];
  } else {
    // 模型名不含 provider 前缀，选择第一个启用的 provider
    const enabledProvider = Object.entries(providers).find(
      ([_, config]) => config?.enabled === true
    );
    if (!enabledProvider) {
      logger.warn("未找到启用的 Provider");
      logMethodReturn(logger, { method: "createProvider", module: "CLI", result: null, duration: timer() });
      return null;
    }
    selectedProvider = enabledProvider;
  }

  const [providerName, providerConfig] = selectedProvider;

  if (!providerConfig) {
    logger.warn("Provider 配置为空", { providerName });
    logMethodReturn(logger, { method: "createProvider", module: "CLI", result: null, duration: timer() });
    return null;
  }

  const validation = validateProviderConfig(providerName, providerConfig);
  if (!validation.valid) {
    logger.warn("Provider 配置验证失败", { providerName, errors: validation.errors });
    logMethodReturn(logger, { method: "createProvider", module: "CLI", result: null, duration: timer() });
    return null;
  }

  try {
    let provider: IProviderExtended;
    switch (providerName) {
      case "openai": {
        provider = createOpenAIProvider({
          name: providerName,
          apiKey: providerConfig.apiKey!,
          baseUrl: providerConfig.baseUrl!,
          models: providerConfig.models!,
        });
        break;
      }

      case "anthropic": {
        provider = createAnthropicProvider({
          name: providerName,
          apiKey: providerConfig.apiKey!,
          baseUrl: providerConfig.baseUrl!,
          models: providerConfig.models!,
        });
        break;
      }

      default: {
        provider = createOpenAIProvider({
          name: providerName,
          apiKey: providerConfig.apiKey!,
          baseUrl: providerConfig.baseUrl!,
          models: providerConfig.models!,
        });
        break;
      }
    }

    logger.info("Provider 创建成功", { providerName, baseUrl: providerConfig.baseUrl });
    logMethodReturn(logger, { method: "createProvider", module: "CLI", result: { providerName }, duration: timer() });
    return provider;
  } catch (err) {
    const error = err as Error;
    logMethodError(logger, {
      method: "createProvider",
      module: "CLI",
      error: { name: error.name, message: error.message },
      params: { providerName },
      duration: timer(),
    });
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
  const timer = createTimer();
  logMethodCall(logger, { method: "validateProviderConfig", module: "CLI", params: {} });

  const errors: string[] = [];

  if (!config.baseUrl) {
    errors.push("baseUrl 未配置");
  }

  if (!config.models || config.models.length === 0) {
    errors.push("models 未配置");
  }

  const result = { valid: errors.length === 0, errors };
  logMethodReturn(logger, { method: "validateProviderConfig", module: "CLI", result: { valid: result.valid, errorCount: errors.length }, duration: timer() });
  return result;
}

// ============================================================================
// Channel 创建
// ============================================================================

/**
 * 创建 Channel 实例
 */
function createChannels(settings: Settings): IChannelExtended[] {
  const timer = createTimer();
  logMethodCall(logger, { method: "createChannels", module: "CLI", params: {} });

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
          sandbox: qqConfig.sandbox,
          allowFrom: qqConfig.allowFrom,
          allowChannels: qqConfig.allowChannels,
        };
        const channel = createQQChannel(config as Parameters<typeof createQQChannel>[0]);
        channels.push(channel);
        logger.info("QQ Channel 创建成功", { sandbox: config.sandbox });
      } catch (err) {
        const error = err as Error;
        logger.error("QQ Channel 创建失败", { error: error.message });
      }
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
        logger.info("飞书 Channel 创建成功");
      } catch (err) {
        const error = err as Error;
        logger.error("飞书 Channel 创建失败", { error: error.message });
      }
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
        logger.info("企业微信 Channel 创建成功");
      } catch (err) {
        const error = err as Error;
        logger.error("企业微信 Channel 创建失败", { error: error.message });
      }
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
        logger.info("钉钉 Channel 创建成功");
      } catch (err) {
        const error = err as Error;
        logger.error("钉钉 Channel 创建失败", { error: error.message });
      }
    }
  }

  logger.debug("Channel 创建完成", { channelCount: channels.length, channelIds: channels.map(c => c.id) });
  logMethodReturn(logger, { method: "createChannels", module: "CLI", result: { channelCount: channels.length }, duration: timer() });
  return channels;
}

// ============================================================================
// Agent 消息处理
// ============================================================================

/**
 * 读取文件内容（如果存在）
 */
async function readFileIfExists(filePath: string): Promise<string> {
  try {
    return await readFile(filePath, "utf-8");
  } catch {
    return "";
  }
}

/**
 * 创建消息处理器（将 Channel 消息转发给 AgentLoop）
 */
async function createMessageHandler(
  agent: AgentLoop,
  sessionManager: SessionManager,
  channels: IChannelExtended[],
  settings: Settings,
  provider: IProviderExtended
): Promise<(message: InboundMessage) => Promise<void>> {
  const handlerTimer = createTimer();
  logMethodCall(logger, { method: "createMessageHandler", module: "CLI", params: { channelCount: channels.length } });

  // 单用户模式：使用全局统一的 session key
  const GLOBAL_SESSION_KEY = "global";

  // 构建系统提示词（只构建一次）
  const [agentsContent, soulContent, userContent, toolsContent, memoryContent] = await Promise.all([
    readFileIfExists(AGENTS_FILE),
    readFileIfExists(SOUL_FILE),
    readFileIfExists(USER_FILE),
    readFileIfExists(TOOLS_FILE),
    readFileIfExists(MEMORY_FILE),
  ]);

  // 构建系统提示词
  const systemPromptResult = buildSystemPrompt({
    agentsContent: agentsContent || "You are MicroAgent, a helpful AI assistant.",
    soulContent,
    userContent,
    toolsContent,
    memoryContent,
    currentDate: getCurrentDateString(),
  });
  logger.info("使用标准系统提示词");

  logger.info("系统提示词已构建", { length: systemPromptResult.length });

  // 获取上下文配置
  const contextWindowTokens = settings.sessions?.contextWindowTokens ?? 65535;
  const compressionTokenThreshold = settings.sessions?.compressionTokenThreshold ?? 0.7;
  const compressionConfig = settings.sessions?.compression;

  // 创建 LLM 调用函数（用于摘要生成）
  // 注意：如果 LLM 调用失败，会降级到滑动窗口策略
  const llmCall = async (messages: Message[]): Promise<string> => {
    try {
      const model = settings.agents.defaults.model ?? "gpt-4o-mini";
      const response = await provider.chat({
        messages,
        model,
        maxTokens: 500,
        temperature: 0.3,
      });
      return response.text ?? "";
    } catch (error) {
      logger.error("摘要生成 LLM 调用失败，将降级到滑动窗口策略", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error; // 重新抛出，让 compressor 处理降级
    }
  };

  // 创建压缩器
  const { ContextCompressor } = await import("../../shared/context-compressor.js");
  const compressorOptions = {
    contextWindowTokens,
    compressionTokenThreshold,
    llmCall,
    ...(compressionConfig && { compression: compressionConfig }),
  };
  const compressor = new ContextCompressor(compressorOptions);

  logMethodReturn(logger, { method: "createMessageHandler", module: "CLI", result: { success: true, compressionStrategy: compressionConfig?.strategy ?? "sliding-window" }, duration: handlerTimer() });

  return async (message: InboundMessage) => {
    const messageTimer = createTimer();
    
    // 截断文本用于日志
    const truncateForLog = (text: string, maxLen = 1000): string => {
      if (!text) return "";
      return text.length > maxLen ? text.substring(0, maxLen) + "...(truncated)" : text;
    };
    
    logger.info("收到用户消息", { 
      channelId: message.channelId, 
      from: message.from, 
      to: message.to,
      content: truncateForLog(message.text)
    });

    try {
      // 使用全局 session（跨平台共享上下文）
      const session = sessionManager.getOrCreate(GLOBAL_SESSION_KEY);

      // 添加用户消息并持久化
      await session.addMessageAndPersist({
        role: "user",
        content: message.text,
      });

      // 获取所有消息
      const allMessages = session.getMessages();

      // 使用压缩器处理消息
      const compressionResult = await compressor.compress(allMessages);

      // 构建运行时上下文（包含 workspace 路径）
      const runtimeContext = buildRuntimeContext({
        currentDate: getCurrentDateString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        platform: process.platform,
        workspacePath: WORKSPACE_DIR,
      });

      // 构建最终消息列表：系统提示词 + 压缩后的消息
      const finalMessages: Message[] = [
        { role: "system", content: systemPromptResult.prompt },
      ];

      // 在压缩后的消息中注入运行时上下文
      const compressedMsgs = compressionResult.messages;
      for (let i = 0; i < compressedMsgs.length; i++) {
        const msg = compressedMsgs[i];
        if (!msg) continue;

        if (msg.role === "user" && i === compressedMsgs.length - 1) {
          // 最后一条用户消息前注入运行时上下文
          finalMessages.push({
            role: "user",
            content: `${runtimeContext}\n\n${msg.content}`,
          });
        } else {
          finalMessages.push(msg);
        }
      }

      logger.info("开始运行 Agent", { 
        messageCount: finalMessages.length, 
        originalTokens: compressionResult.originalTokens,
        compressedTokens: compressionResult.compressedTokens,
        hasSummary: compressionResult.hasSummary,
        strategy: compressionResult.strategy,
        systemPromptLength: systemPromptResult.length,
        hasWorkspacePath: true,
      });

      const result = await agent.run(finalMessages);

      // 记录 Agent 运行结果
      logger.info("Agent 运行完成", {
        hasContent: !!result.content,
        contentLength: result.content?.length ?? 0,
        hasError: !!result.error,
        errorMessage: result.error,
        messageCount: result.messages?.length ?? 0
      });

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
          
          logger.info("发送回复给用户", {
            channelId: message.channelId,
            to: replyTo,
            content: truncateForLog(result.content)
          });
          
          await channel.send({
            to: replyTo,
            text: result.content,
            format: "markdown", // 使用 Markdown 格式
            metadata: message.metadata, // 传递 Channel 特定元数据
          });
          logger.info("消息回复发送成功", { channelId: message.channelId, to: replyTo });
        }
      } else if (result.error) {
        logger.error("Agent 返回错误，无回复内容", { error: result.error });
      }

      logger.info("消息处理完成", { duration: messageTimer() });
    } catch (err) {
      const error = err as Error;
      logger.error("消息处理失败", {
        channelId: message.channelId,
        error: { name: error.name, message: error.message, stack: error.stack },
        duration: messageTimer(),
      });
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
  _options: StartOptions
): Promise<void> {
  const timer = createTimer();
  logMethodCall(logger, { method: "runAgentService", module: "CLI", params: { channelCount: channels.length } });

  // 创建 AgentLoop
  // 处理模型名：剥离 provider 前缀
  let model = settings.agents.defaults.model ?? "default";
  const slashIndex = model.indexOf("/");
  if (slashIndex >= 0) {
    const originalModel = model;
    model = model.substring(slashIndex + 1);
    logger.debug("剥离模型 provider 前缀", { originalModel, strippedModel: model });
  }

  const agentConfig: AgentConfig = {
    model,
    maxIterations: settings.agents.defaults.maxToolIterations ?? 50,
    defaultTimeout: 60000,
    enableLogging: false,
  };
  const agent = new AgentLoop(provider, toolRegistry, agentConfig);
  logger.info("AgentLoop 创建完成", { model: agentConfig.model, maxIterations: agentConfig.maxIterations });

  // 创建消息处理器（传入 provider 用于摘要生成）
  const messageHandler = await createMessageHandler(agent, sessionManager, channels, settings, provider);

  // 注册消息处理器到所有 Channel
  for (const channel of channels) {
    channel.onMessage(messageHandler);
  }

  // 启动所有 Channel
  await channelManager.startAll();
  logger.info("Agent 服务启动完成", { channels: channels.map(c => c.id) });

  logMethodReturn(logger, { method: "runAgentService", module: "CLI", result: { success: true }, duration: timer() });

  // 保持运行
  return new Promise((resolve) => {
    const cleanup = async () => {
      logger.info("Agent 服务正在关闭...");
      // 关闭 MCP 连接
      try {
        await mcpManager.closeAll();
        logger.debug("MCP 连接已关闭");
      } catch (err) {
        const error = err as Error;
        logger.error("关闭 MCP 连接失败", { error: error.message });
      }

      // 停止 Channel
      await channelManager.stopAll();
      logger.info("Agent 服务已关闭");
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
  const timer = createTimer();
  logMethodCall(logger, { method: "startCommand", module: "CLI", params: { config: options.config, model: options.model, debug: options.debug } });

  // 全局错误处理：捕获 Channel SDK 的异步错误
  const handleUncaughtError = (error: Error & { code?: string }) => {
    // 网络连接错误（SDK 内部错误）
    if (error.code === "ECONNREFUSED" || error.code === "ENOTFOUND") {
      logger.debug("网络错误已静默处理", { code: error.code });
      return;
    }

    // 其他未捕获的错误
    logger.error("未捕获的错误", { name: error.name, message: error.message, code: error.code });
  };

  process.on("uncaughtException", handleUncaughtError);

  try {
    // 1. 初始化运行时目录
    logger.debug("步骤 1: 初始化运行时目录");
    initializeRuntimeDirectories();
    await initializeConfigFiles();

    // 2. 加载配置
    logger.debug("步骤 2: 加载配置");
    const configPath = options.config ?? SETTINGS_FILE;

    let settings: Settings;
    try {
      settings = await loadSettings(configPath);
      logger.info("配置加载成功", { configPath });
    } catch (err) {
      const error = err as Error;
      logMethodError(logger, {
        method: "startCommand",
        module: "CLI",
        error: { name: error.name, message: error.message },
        params: { configPath },
        duration: timer(),
      });
      return { success: false, error: error.message };
    }

    // 3. 覆盖模型
    if (options.model) {
      logger.debug("覆盖模型", { model: options.model });
      settings.agents.defaults.model = options.model;
    }

    // 4. 注册工具
    logger.debug("步骤 4: 注册工具");
    const toolRegistry = new ToolRegistry();
    const tools = getAllTools();
    for (const tool of tools) {
      toolRegistry.register(tool);
    }
    logger.info("内置工具注册完成", { toolCount: tools.length });

    // 4.1 异步加载 MCP 工具（不阻塞启动）
    const loadMCPTools = async () => {
      try {
        const mcpConfig = await mcpManager.loadConfig();
        const serverCount = Object.keys(mcpConfig.mcpServers).length;

        if (serverCount === 0) {
          return;
        }

        logger.debug("开始加载 MCP 工具", { serverCount });
        const results = await mcpManager.connectAll((tool, _serverName) => {
          toolRegistry.register(tool);
        });

        const connectedCount = results.filter((r) => r.status === "connected").length;
        logger.info("MCP 工具加载完成", { serverCount, connectedCount });
      } catch (err) {
        const error = err as Error;
        logger.error("加载 MCP 工具失败", { error: error.message });
      }
    };

    // 后台异步加载 MCP，不阻塞启动
    loadMCPTools();

    // 5. 加载技能
    logger.debug("步骤 5: 加载技能");
    const skillLoader = new FilesystemSkillLoader();
    const skills = await skillLoader.listSkills();
    logger.info("技能加载完成", { skillCount: skills.length });

    // 6. 创建 Provider
    logger.debug("步骤 6: 创建 Provider");
    const provider = createProvider(settings);
    if (!provider) {
      logMethodError(logger, {
        method: "startCommand",
        module: "CLI",
        error: { name: "ProviderError", message: "未找到可用的 Provider" },
        params: {},
        duration: timer(),
      });
      return { success: false, error: "未找到可用的 Provider" };
    }

    // 7. 创建 Channel
    logger.debug("步骤 7: 创建 Channel");
    const channels = createChannels(settings);

    // 8. 创建 Session 管理器并加载历史会话
    logger.debug("步骤 8: 创建 Session 管理器");
    const sessionManager = new SessionManager();
    const GLOBAL_SESSION_KEY = "global";

    // 读取会话配置
    const persistEnabled = settings.sessions?.persist ?? true;
    const contextWindowTokens = settings.sessions?.contextWindowTokens ?? 65535;

    // 仅在持久化启用时加载历史
    if (persistEnabled) {
      try {
        await sessionManager.loadHistory(GLOBAL_SESSION_KEY, contextWindowTokens);
        logger.debug("历史会话加载成功");
      } catch (err) {
        const error = err as Error;
        logger.debug("历史会话加载跳过", { reason: error.message });
      }
    }

    // 9. 创建 Channel 管理器
    logger.debug("步骤 9: 创建 Channel 管理器");
    const channelManager = new ChannelManager();
    for (const channel of channels) {
      channelManager.register(channel);
    }

    // 10. 启动 Agent 服务
    logger.info("启动 Agent 服务");
    await runAgentService(
      provider,
      toolRegistry,
      sessionManager,
      channelManager,
      channels,
      settings,
      options
    );

    logMethodReturn(logger, { method: "startCommand", module: "CLI", result: { success: true }, duration: timer() });
    return { success: true };
  } catch (err) {
    const error = err as Error;
    logMethodError(logger, {
      method: "startCommand",
      module: "CLI",
      error: { name: error.name, message: error.message, ...(error.stack ? { stack: error.stack } : {}) },
      params: { config: options.config, model: options.model, debug: options.debug },
      duration: timer(),
    });
    return { success: false, error: error.message };
  }
}

/**
 * 显示 start 命令帮助信息（保留接口，但不做任何输出）
 */
export function showStartHelp(): void {
  // 已移除所有 console.log 调用
}
