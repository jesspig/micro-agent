/**
 * microbot 应用入口
 * 
 * 提供 createApp() 工厂函数，组装所有模块。
 */

import { expandPath, loadConfig } from './config/loader';
import { DatabaseManager, DEFAULT_DB_CONFIG } from './db/manager';
import { MessageBus } from './bus/queue';
import { SessionStore } from './session/store';
import { MemoryStore } from './memory/store';
import { CronStore } from './cron/store';
import { CronService } from './cron/service';
import { HeartbeatService } from './heartbeat/service';
import { SkillsLoader } from './skills/loader';
import { ToolRegistry } from './tools/registry';
import { ReadFileTool, WriteFileTool, ListDirTool, ExecTool, WebSearchTool, WebFetchTool, MessageTool } from './tools';
import { LLMGateway, OllamaProvider, LMStudioProvider, VLLMProvider, OpenAICompatibleProvider } from './providers';
import { AgentLoop } from './agent/loop';
import { ChannelManager } from './channels/manager';
import { FeishuChannel, QQChannel, EmailChannel, DingTalkChannel, WeComChannel } from './channels';
import type { App, CronJobSummary } from './types/interfaces';
import type { Config } from './config/schema';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

/** 获取内置技能路径 */
function getBuiltinSkillsPath(): string {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  return resolve(currentDir, 'skills');
}

/**
 * 应用实现
 */
class AppImpl implements App {
  private running = false;
  private dbManager: DatabaseManager | null = null;
  private cronService: CronService | null = null;
  private heartbeatService: HeartbeatService | null = null;
  private agentLoop: AgentLoop | null = null;
  private channelManager: ChannelManager;
  private gateway: LLMGateway;
  private cronStore: CronStore | null = null;

  constructor(
    private config: Config,
    private workspace: string
  ) {
    this.channelManager = new ChannelManager();
    this.gateway = new LLMGateway();
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    // 1. 初始化数据库
    const dataDir = expandPath(DEFAULT_DB_CONFIG.dataDir);
    this.dbManager = new DatabaseManager({
      ...DEFAULT_DB_CONFIG,
      dataDir,
      sessionsDb: `${dataDir}/sessions.db`,
      cronDb: `${dataDir}/cron.db`,
      memoryDb: `${dataDir}/memory.db`,
    });
    this.dbManager.init();

    // 2. 初始化存储
    const sessionStore = new SessionStore(this.dbManager.getSessionsDb());
    const memoryStore = new MemoryStore(this.dbManager.getMemoryDb(), this.workspace);
    this.cronStore = new CronStore(this.dbManager.getCronDb());

    // 3. 初始化消息总线
    const messageBus = new MessageBus();

    // 4. 初始化工具注册表
    const toolRegistry = new ToolRegistry();
    toolRegistry.register(new ReadFileTool());
    toolRegistry.register(new WriteFileTool());
    toolRegistry.register(new ListDirTool());
    toolRegistry.register(new ExecTool(this.workspace));
    toolRegistry.register(new WebSearchTool());
    toolRegistry.register(new WebFetchTool());
    toolRegistry.register(new MessageTool());

    // 5. 初始化 Provider Gateway
    this.initProviders();

    // 6. 初始化技能加载器
    const skillsLoader = new SkillsLoader(this.workspace, getBuiltinSkillsPath());
    skillsLoader.load();

    // 7. 初始化 Agent
    const agentConfig = this.config.agents.defaults;
    this.agentLoop = new AgentLoop(
      messageBus,
      this.gateway,
      sessionStore,
      memoryStore,
      toolRegistry,
      {
        workspace: this.workspace,
        model: agentConfig.model,
        maxIterations: agentConfig.maxToolIterations,
      }
    );

    // 8. 初始化 Cron 服务
    this.cronService = new CronService(
      this.cronStore,
      async (job) => {
        await messageBus.publishInbound({
          channel: (job.channel as 'feishu' | 'qq' | 'email' | 'dingtalk' | 'wecom') || 'system',
          senderId: 'cron',
          chatId: job.toAddress || 'system',
          content: job.message,
          timestamp: new Date(),
          media: [],
          metadata: { cronJobId: job.id },
        });
        return 'ok';
      }
    );
    await this.cronService.start();

    // 9. 初始化 Heartbeat 服务
    this.heartbeatService = new HeartbeatService(
      async (prompt) => {
        await messageBus.publishInbound({
          channel: 'system',
          senderId: 'heartbeat',
          chatId: 'system',
          content: prompt,
          timestamp: new Date(),
          media: [],
          metadata: {},
        });
        return 'HEARTBEAT_OK';
      },
      { intervalMs: 30 * 60 * 1000, workspace: this.workspace }
    );
    this.heartbeatService.start();

    // 10. 初始化通道
    this.initChannels(messageBus);

    // 11. 启动通道
    await this.channelManager.startAll();

    // 12. 启动 Agent 循环（在后台运行）
    this.agentLoop.run().catch(console.error);
  }

  async stop(): Promise<void> {
    if (!this.running) return;
    this.running = false;

    // 停止 Agent
    this.agentLoop?.stop();

    // 停止 Heartbeat
    this.heartbeatService?.stop();

    // 停止 Cron
    this.cronService?.stop();

    // 停止通道
    await this.channelManager.stopAll();

    // 关闭数据库
    this.dbManager?.close();
  }

  getRunningChannels(): string[] {
    return this.channelManager.getRunningChannels();
  }

  getProviderStatus(): string {
    return this.gateway.getDefaultModel();
  }

  getCronCount(): number {
    if (!this.cronStore) return 0;
    return this.cronStore.list(false).length;
  }

  listCronJobs(): CronJobSummary[] {
    if (!this.cronStore) return [];
    return this.cronStore.list(true).map(job => ({
      id: job.id,
      name: job.name,
      scheduleKind: job.scheduleKind,
      scheduleValue: job.scheduleValue,
    }));
  }

  /** 初始化 Provider */
  private initProviders(): void {
    const providers = this.config.providers;
    const defaultModel = this.config.agents.defaults.model;

    // Ollama
    if (providers.ollama) {
      const p = new OllamaProvider({
        baseUrl: providers.ollama.baseUrl,
        defaultModel: providers.ollama.models?.[0] ?? defaultModel,
      });
      this.gateway.registerProvider('ollama', p, providers.ollama.models || ['qwen3'], 1);
    }

    // LM Studio
    if (providers.lmStudio) {
      const p = new LMStudioProvider({
        baseUrl: providers.lmStudio.baseUrl,
        defaultModel: providers.lmStudio.models?.[0] ?? defaultModel,
      });
      this.gateway.registerProvider('lm-studio', p, providers.lmStudio.models || ['*'], 2);
    }

    // vLLM
    if (providers.vllm) {
      const p = new VLLMProvider({
        baseUrl: providers.vllm.baseUrl,
        defaultModel: providers.vllm.models?.[0] ?? defaultModel,
      });
      this.gateway.registerProvider('vllm', p, providers.vllm.models || ['*'], 3);
    }

    // OpenAI Compatible
    if (providers.openaiCompatible) {
      const p = new OpenAICompatibleProvider({
        baseUrl: providers.openaiCompatible.baseUrl,
        apiKey: providers.openaiCompatible.apiKey,
        defaultModel: providers.openaiCompatible.models?.[0] ?? defaultModel,
      });
      this.gateway.registerProvider('openai-compatible', p, providers.openaiCompatible.models || ['*'], 4);
    }
  }

  /** 初始化通道 */
  private initChannels(bus: MessageBus): void {
    const channels = this.config.channels;

    // 飞书
    if (channels.feishu?.enabled && channels.feishu.appId && channels.feishu.appSecret) {
      const channel = new FeishuChannel(bus, {
        appId: channels.feishu.appId,
        appSecret: channels.feishu.appSecret,
        allowFrom: channels.feishu.allowFrom,
      });
      this.channelManager.register(channel);
    }

    // QQ
    if (channels.qq?.enabled && channels.qq.appId && channels.qq.secret) {
      const channel = new QQChannel(bus, {
        appId: channels.qq.appId,
        secret: channels.qq.secret,
        allowFrom: [],
      });
      this.channelManager.register(channel);
    }

    // 邮箱
    if (channels.email?.enabled && channels.email.consentGranted) {
      const channel = new EmailChannel(bus, {
        imapHost: channels.email.imapHost || '',
        imapPort: channels.email.imapPort || 993,
        smtpHost: channels.email.smtpHost || '',
        smtpPort: channels.email.smtpPort || 587,
        user: channels.email.user || '',
        password: channels.email.password || '',
        allowFrom: [],
      });
      this.channelManager.register(channel);
    }

    // 钉钉
    if (channels.dingtalk?.enabled && channels.dingtalk.clientId && channels.dingtalk.clientSecret) {
      const channel = new DingTalkChannel(bus, {
        clientId: channels.dingtalk.clientId,
        clientSecret: channels.dingtalk.clientSecret,
        allowFrom: [],
      });
      this.channelManager.register(channel);
    }

    // 企业微信
    if (channels.wecom?.enabled && channels.wecom.corpId && channels.wecom.agentId && channels.wecom.secret) {
      const channel = new WeComChannel(bus, {
        corpId: channels.wecom.corpId,
        agentId: channels.wecom.agentId,
        secret: channels.wecom.secret,
        allowFrom: [],
      });
      this.channelManager.register(channel);
    }
  }
}

/**
 * 创建应用实例
 * @param configPath - 配置文件路径（可选）
 */
export async function createApp(configPath?: string): Promise<App> {
  const config = loadConfig(configPath);
  const workspace = expandPath(config.agents.defaults.workspace);
  return new AppImpl(config, workspace);
}

// 导出类型
export type { App, CronJobSummary } from './types/interfaces';
