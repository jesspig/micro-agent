/**
 * MicroAgent 应用入口
 *
 * 提供 createApp() 工厂函数，组装所有模块。
 */

import {
  loadConfig,
  expandPath,
} from '@micro-agent/config';
import {
  ToolRegistry,
  ChannelManager,
  SkillsLoader,
  LLMGateway,
  MessageBus,
  SessionStore,
  AgentExecutor,
} from '@micro-agent/sdk';
import { ChannelGatewayImpl } from '@micro-agent/runtime';
import {
  ReadFileTool,
  WriteFileTool,
  ListDirTool,
  createExecTool,
  WebFetchTool,
  MessageTool,
} from '../../../extensions/tool';
import { FeishuChannel } from '../../../extensions/channel';
import { buildPreflightPrompt, buildRoutingPrompt } from '../../prompts';
import type {
  App,
  Config,
} from '@micro-agent/types';
import { getLogger } from '@logtape/logtape';
import { resolve, dirname } from 'path';
import { homedir } from 'os';
import { existsSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';

// 导入应用模块
import {
  initMemorySystem,
  type MemorySystemInitResult,
} from './app/modules/memory-init';
import {
  createDefaultStartupInfo,
  printStartupInfo,
  type StartupInfo,
} from './app/modules/startup-info';
import {
  ensureUserConfigFiles,
  loadSystemPrompt,
} from './app/modules/system-prompt';
import {
  initProviders,
} from './app/modules/providers-init';
import {
  initChannels,
} from './app/modules/channels-init';

const log = getLogger(['app']);

/** 启动信息 */
const startupInfo = createDefaultStartupInfo();

/** 获取内置技能路径 */
function getBuiltinSkillsPath(): string {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  return resolve(currentDir, '../../../extensions/skills');
}

/**
 * 应用实现
 */
class AppImpl implements App {
  private running = false;
  private channelManager: ChannelManager;
  private llmGateway: LLMGateway;
  private availableModels = new Map<string, any[]>();
  private config: Config;
  private workspace: string;
  private messageBus: MessageBus;
  private sessionStore: SessionStore;
  private toolRegistry: ToolRegistry;
  private executor: AgentExecutor | null = null;
  private channelGateway: ChannelGatewayImpl | null = null;
  private skillsLoader: SkillsLoader | null = null;
  private memoryStore: any = null;
  private summarizer: any = null;
  private knowledgeBaseManager: any = null;

  constructor(config: Config, workspace: string) {
    this.config = config;
    this.workspace = workspace;
    this.channelManager = new ChannelManager();
    this.messageBus = new MessageBus();
    this.sessionStore = new SessionStore({
      sessionsDir: `${homedir()}/.micro-agent/data`,
      sessionTimeout: 30 * 60 * 1000,
    });
    this.toolRegistry = new ToolRegistry();

    const chatModel = config.agents.models?.chat || '';
    const slashIndex = chatModel.indexOf('/');
    const defaultProvider = slashIndex > 0
      ? chatModel.slice(0, slashIndex)
      : Object.keys(config.providers)[0] || '';
    this.llmGateway = new LLMGateway({ defaultProvider, fallbackEnabled: true });
  }

  async start(): Promise<void> {
    if (this.running) {
      log.warn('应用已在运行中');
      return;
    }

    try {
      this.running = true;
      await this.initializeComponents();
      await this.startServices();
      this.printStartupInfo();
      log.info('应用启动完成');
    } catch (error) {
      this.handleStartupError(error);
      throw error;
    }
  }

  /**
   * 初始化组件
   */
  private async initializeComponents(): Promise<void> {
    await this.ensureUserConfigFiles();
    this.registerBuiltinTools();
    this.initProviders();
    await this.initSkills();
    this.initChannels();
  }

  /**
   * 启动服务
   */
  private async startServices(): Promise<void> {
    await this.initMemorySystem();
    await this.startChannels();
    this.createExecutor();
    this.startGateway();
  }

  /**
   * 处理启动错误
   */
  private handleStartupError(error: unknown): void {
    this.running = false;
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error('应用启动失败', { error: errorMessage });
  }

  /** 确保用户级配置文件存在 */
  private async ensureUserConfigFiles(): Promise<void> {
    const { created } = ensureUserConfigFiles();
    if (created.length > 0) {
      log.info('已创建配置文件', { files: created });
    }
  }

  /** 初始化技能加载器 */
  private async initSkills(): Promise<void> {
    this.skillsLoader = new SkillsLoader(this.workspace, getBuiltinSkillsPath());
    this.skillsLoader.load();
    if (this.skillsLoader.count > 0) {
      startupInfo.skills = this.skillsLoader.getAll().map(s => s.name);
    }
  }

  /** 启动通道 */
  private async startChannels(): Promise<void> {
    await this.channelManager.startAll();
    startupInfo.channels = this.channelManager.getRunningChannels();
  }

  /** 初始化 Provider */
  private initProviders(): void {
    this.availableModels = initProviders(this.config, this.llmGateway);
  }

  /** 初始化通道 */
  private initChannels(): void {
    initChannels(this.config, this.channelManager, this.messageBus, FeishuChannel);
  }

  /** 初始化记忆系统 */
  private async initMemorySystem(): Promise<void> {
    const result = await initMemorySystem(this.config, this.llmGateway, startupInfo);
    this.memoryStore = result.memoryStore;
    this.summarizer = result.summarizer;
    this.knowledgeBaseManager = result.knowledgeBaseManager;
  }

  /** 创建 Agent 执行器 */
  private createExecutor(): void {
    this.executor = new AgentExecutor(
      this.messageBus,
      this.llmGateway,
      this.toolRegistry,
      {
        workspace: this.workspace,
        maxIterations: this.config.agents.executor?.maxIterations ?? 20,
        maxTokens: this.config.agents.maxTokens ?? 8192,
        temperature: this.config.agents.temperature ?? 0.7,
        systemPrompt: this.loadSystemPrompt(),
        chatModel: this.config.agents.models?.chat,
        visionModel: this.config.agents.models?.vision,
        coderModel: this.config.agents.models?.coder,
        intentModel: this.config.agents.models?.intent,
        availableModels: this.availableModels,
        buildPreflightPrompt,
        buildRoutingPrompt,
        memoryEnabled: this.config.agents.memory?.enabled,
        summarizeThreshold: this.config.agents.memory?.summarizeThreshold,
        idleTimeout: this.config.agents.memory?.idleTimeout,
        knowledgeEnabled: true,
        knowledgeLimit: 3,
      },
      {
        memoryStore: this.memoryStore,
        summarizer: this.summarizer,
        knowledgeBaseManager: this.knowledgeBaseManager,
        sessionStore: this.sessionStore,
      }
    );

    this.channelGateway = new ChannelGatewayImpl({
      executor: this.executor,
      getChannels: () => this.channelManager.getChannels(),
    });
  }

  /** 加载系统提示词 */
  private loadSystemPrompt(): string {
    return loadSystemPrompt(this.workspace, this.skillsLoader);
  }

  /** 打印启动信息 */
  private printStartupInfo(): void {
    printStartupInfo(startupInfo, this.config);
  }

  /**
   * 启动 ChannelGateway 消息处理循环
   *
   * 流程：Channel → MessageBus(inbound) → Gateway → LLM → Gateway → 所有 Channel
   */
  private startGateway(): void {
    (async () => {
      while (this.running) {
        try {
          // 从 MessageBus 消费入站消息
          const msg = await this.messageBus.consumeInbound();
          // ChannelGateway 处理：调用 LLM + 广播响应
          await this.channelGateway?.process(msg);
        } catch (error) {
          console.error('Gateway 处理失败:', error instanceof Error ? error.message : String(error));
        }
      }
    })().catch(error => {
      console.error('Gateway 异常:', error instanceof Error ? error.message : String(error));
    });
  }

  /** 注册内置工具 */
  private registerBuiltinTools(): void {
    this.toolRegistry.register(ReadFileTool);
    this.toolRegistry.register(WriteFileTool);
    this.toolRegistry.register(ListDirTool);
    this.toolRegistry.register(createExecTool(this.workspace));
    this.toolRegistry.register(WebFetchTool);
    this.toolRegistry.register(MessageTool);
    startupInfo.tools = this.toolRegistry.getDefinitions().map(t => t.name);
  }

  async stop(): Promise<void> {
    if (!this.running) return;
    this.running = false;

    if (this.executor) {
      this.executor.stop();
    }

    await this.channelManager.stopAll();

    // 关闭记忆存储，刷新 Markdown 批次
    if (this.memoryStore) {
      await this.memoryStore.close();
    }
  }

  getRunningChannels(): string[] {
    return this.channelManager.getRunningChannels();
  }

  getProviderStatus(): string {
    if (!this.config.agents.models?.chat && Object.keys(this.config.providers).length === 0) {
      return '未配置';
    }
    return this.llmGateway.getDefaultModel();
  }

  getRouterStatus(): { chatModel: string; visionModel?: string; coderModel?: string; intentModel?: string } {
    return {
      chatModel: this.config.agents.models?.chat || '未配置',
      visionModel: this.config.agents.models?.vision,
      coderModel: this.config.agents.models?.coder,
      intentModel: this.config.agents.models?.intent,
    };
  }
}

export async function createApp(configPath?: string): Promise<App> {
  const baseConfig = loadConfig(configPath ? { configPath } : {});
  const workspace = expandPath(baseConfig.agents.workspace);

  // 确保 workspace 目录存在
  if (!existsSync(workspace)) {
    mkdirSync(workspace, { recursive: true });
  }

  const config = loadConfig({ workspace });

  return new AppImpl(config, workspace);
}

export type { App } from '@micro-agent/types';