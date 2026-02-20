/**
 * MicroBot 应用入口
 * 
 * 提供 createApp() 工厂函数，组装所有模块。
 */

import {
  expandPath,
  loadConfig,
  MessageBus,
  SessionStore,
  SkillsLoader,
  ToolRegistry,
  LLMGateway,
  OpenAICompatibleProvider,
  AgentLoop,
  ChannelManager,
  ChannelHelper,
  parseModelConfigs,
} from '@microbot/core';
import type {
  App,
  Config,
  ProviderEntry,
  ModelConfig,
} from '@microbot/core';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getLogger } from '@logtape/logtape';
import { homedir } from 'os';

// 扩展组件导入
import { ReadFileTool, WriteFileTool, ListDirTool } from '../extensions/tool/filesystem';
import { ExecTool } from '../extensions/tool/shell';
import { WebFetchTool } from '../extensions/tool/web';
import { MessageTool } from '../extensions/tool/message';
import { FeishuChannel } from '../extensions/channel/feishu';

const log = getLogger(['app']);

/** 获取内置技能路径 */
function getBuiltinSkillsPath(): string {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  return resolve(currentDir, '../skills');
}

/**
 * 应用实现
 */
class AppImpl implements App {
  private running = false;
  private agentLoop: AgentLoop | null = null;
  private channelManager: ChannelManager;
  private gateway: LLMGateway;
  /** 可用模型列表（用于自动路由） */
  private availableModels = new Map<string, ModelConfig[]>();

  constructor(
    private config: Config,
    private workspace: string
  ) {
    this.channelManager = new ChannelManager();
    // 从模型配置解析 provider：格式为 "provider/model"
    const chatModel = config.agents.models?.chat || '';
    const slashIndex = chatModel.indexOf('/');
    const defaultProvider = slashIndex > 0
      ? chatModel.slice(0, slashIndex)
      : Object.keys(config.providers)[0] || '';
    this.gateway = new LLMGateway({ defaultProvider, fallbackEnabled: true });
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    // 1. 初始化会话存储
    const sessionStore = new SessionStore({
      sessionsDir: `${homedir()}/.microbot/sessions`,
      sessionTimeout: 30 * 60 * 1000, // 30 分钟超时
    });

    // 2. 初始化消息总线
    const messageBus = new MessageBus();

    // 3. 初始化工具注册表
    const toolRegistry = new ToolRegistry();
    toolRegistry.register(new ReadFileTool());
    toolRegistry.register(new WriteFileTool());
    toolRegistry.register(new ListDirTool());
    toolRegistry.register(new ExecTool(this.workspace));
    toolRegistry.register(new WebFetchTool());
    toolRegistry.register(new MessageTool());

    // 4. 初始化 Provider Gateway
    this.initProviders();

    // 5. 初始化技能加载器
    const skillsLoader = new SkillsLoader(this.workspace, getBuiltinSkillsPath());
    skillsLoader.load();

    // 6. 初始化 Agent
    const agentConfig = this.config.agents;
    this.agentLoop = new AgentLoop(
      messageBus,
      this.gateway,
      sessionStore,
      toolRegistry,
      skillsLoader,
      {
        workspace: this.workspace,
        models: agentConfig.models,
        maxIterations: agentConfig.maxToolIterations,
        generation: {
          maxTokens: agentConfig.maxTokens,
          temperature: agentConfig.temperature,
          topK: agentConfig.topK,
          topP: agentConfig.topP,
          frequencyPenalty: agentConfig.frequencyPenalty,
        },
        auto: agentConfig.auto,
        max: agentConfig.max,
        availableModels: this.availableModels,
        routing: this.config.routing,
      }
    );

    // 7. 初始化通道
    this.initChannels(messageBus);

    // 8. 启动通道
    await this.channelManager.startAll();

    // 9. 启动出站消息消费者
    this.startOutboundConsumer(messageBus);

    // 10. 启动 Agent 循环
    this.agentLoop.run().catch(error => {
      log.error('Agent 循环异常: {error}', { error: error instanceof Error ? error.message : String(error) });
    });
  }

  private startOutboundConsumer(messageBus: MessageBus): void {
    (async () => {
      while (true) {
        try {
          const msg = await messageBus.consumeOutbound();
          await this.channelManager.send(msg);
        } catch (error) {
          log.error('发送消息失败: {error}', { error: error instanceof Error ? error.message : String(error) });
        }
      }
    })().catch(error => {
      log.error('出站消费者异常: {error}', { error: error instanceof Error ? error.message : String(error) });
    });
  }

  async stop(): Promise<void> {
    if (!this.running) return;
    this.running = false;

    this.agentLoop?.stop();
    await this.channelManager.stopAll();
  }

  getRunningChannels(): string[] {
    return this.channelManager.getRunningChannels();
  }

  getProviderStatus(): string {
    // 没有配置 provider 时返回未配置
    if (!this.config.agents.models?.chat && Object.keys(this.config.providers).length === 0) {
      return '未配置';
    }
    return this.gateway.getDefaultModel();
  }

  getRouterStatus(): { auto: boolean; max: boolean; chatModel: string; checkModel?: string } {
    return {
      auto: this.config.agents.auto,
      max: this.config.agents.max,
      chatModel: this.config.agents.models?.chat || '未配置',
      checkModel: this.config.agents.models?.check,
    };
  }

  private initProviders(): void {
    const providers = this.config.providers as Record<string, ProviderEntry | undefined>;
    const chatModel = this.config.agents.models?.chat || '';
    
    // 从模型配置解析默认 provider
    const slashIndex = chatModel.indexOf('/');
    const defaultProviderName = slashIndex > 0 ? chatModel.slice(0, slashIndex) : null;
    const defaultModelId = slashIndex > 0 ? chatModel.slice(slashIndex + 1) : chatModel;

    for (const [name, config] of Object.entries(providers)) {
      if (!config) continue;

      // 解析模型配置（支持字符串简写和完整对象）
      const modelConfigs = config.models ? parseModelConfigs(config.models) : [];
      const modelIds = modelConfigs.map(m => m.id);
      
      // 存储模型配置用于自动路由
      if (modelConfigs.length > 0) {
        this.availableModels.set(name, modelConfigs);
      }
      
      const provider = new OpenAICompatibleProvider({
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        defaultModel: modelConfigs[0]?.id ?? defaultModelId,
        modelConfigs,
      });

      // 默认 provider 优先级为 1，其他为 100
      const priority = name === defaultProviderName ? 1 : 100;
      this.gateway.registerProvider(name, provider, modelIds.length > 0 ? modelIds : ['*'], priority, modelConfigs);
    }
  }

  private initChannels(bus: MessageBus): void {
    const channels = this.config.channels;

    if (channels.feishu?.enabled && channels.feishu.appId && channels.feishu.appSecret) {
      const helper = new ChannelHelper(bus, channels.feishu.allowFrom);
      const channel = new FeishuChannel(bus, {
        appId: channels.feishu.appId,
        appSecret: channels.feishu.appSecret,
        allowFrom: channels.feishu.allowFrom,
      }, helper);
      this.channelManager.register(channel);
    }
  }
}

export async function createApp(configPath?: string): Promise<App> {
  const baseConfig = loadConfig(configPath ? { configPath } : {});
  const workspace = expandPath(baseConfig.agents.workspace);
  
  // 确保 workspace 目录存在
  const { mkdirSync, existsSync } = await import('fs');
  if (!existsSync(workspace)) {
    mkdirSync(workspace, { recursive: true });
  }
  
  const config = loadConfig({ workspace });

  return new AppImpl(config, workspace);
}

// 导出类型
export type { App } from '@microbot/core';

// SDK 子路径导出
export * as core from '@microbot/core';