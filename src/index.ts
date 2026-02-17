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
import { LLMGateway, OpenAICompatibleProvider } from './providers';
import { AgentLoop } from './agent/loop';
import { ChannelManager } from './channels/manager';
import { ChannelHelper } from './channels/helper';
import { FeishuChannel, QQChannel, DingTalkChannel, WeComChannel } from './channels';
import type { App, CronJobSummary } from './types/interfaces';
import type { Config, ProviderEntry } from './config/schema';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getLogger } from '@logtape/logtape';

const log = getLogger(['app']);

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
    // 第一个 provider 作为默认
    const firstProvider = Object.keys(config.providers)[0] || 'ollama';
    this.gateway = new LLMGateway({ defaultProvider: firstProvider, fallbackEnabled: true });
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
          channel: (job.channel as 'feishu' | 'qq' | 'dingtalk' | 'wecom') || 'system',
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

    // 12. 启动出站消息消费者
    this.startOutboundConsumer(messageBus);

    // 13. 启动 Agent 循环（在后台运行）
    this.agentLoop.run().catch(console.error);
  }

  /** 启动出站消息消费者 */
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
    })().catch(console.error);
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
    const providers = this.config.providers as Record<string, ProviderEntry | undefined>;
    const defaultModel = this.config.agents.defaults.model;
    let hasProvider = false;

    // 遍历所有 provider 配置（支持自定义名称）
    for (const [name, config] of Object.entries(providers)) {
      if (!config) continue;

      const provider = new OpenAICompatibleProvider({
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        defaultModel: config.models?.[0] ?? defaultModel,
      });

      this.gateway.registerProvider(name, provider, config.models || ['*'], hasProvider ? 100 : 1);
      hasProvider = true;
    }

    // 默认 Provider：如果没有配置任何 provider，自动注册 Ollama
    if (!hasProvider) {
      const provider = new OpenAICompatibleProvider({
        baseUrl: 'http://localhost:11434/v1',
        defaultModel,
      });
      this.gateway.registerProvider('ollama', provider, [defaultModel], 1);
    }
  }

  /** 初始化通道 */
  private initChannels(bus: MessageBus): void {
    const channels = this.config.channels;

    // 飞书
    if (channels.feishu?.enabled && channels.feishu.appId && channels.feishu.appSecret) {
      const helper = new ChannelHelper(bus, channels.feishu.allowFrom);
      const channel = new FeishuChannel(bus, {
        appId: channels.feishu.appId,
        appSecret: channels.feishu.appSecret,
        allowFrom: channels.feishu.allowFrom,
      }, helper);
      this.channelManager.register(channel);
    }

    // QQ
    if (channels.qq?.enabled && channels.qq.appId && channels.qq.secret) {
      const helper = new ChannelHelper(bus, channels.qq.allowFrom || []);
      const channel = new QQChannel(bus, {
        appId: channels.qq.appId,
        secret: channels.qq.secret,
        allowFrom: [],
      }, helper);
      this.channelManager.register(channel);
    }

    // 钉钉
    if (channels.dingtalk?.enabled && channels.dingtalk.clientId && channels.dingtalk.clientSecret) {
      const helper = new ChannelHelper(bus, channels.dingtalk.allowFrom || []);
      const channel = new DingTalkChannel(bus, {
        clientId: channels.dingtalk.clientId,
        clientSecret: channels.dingtalk.clientSecret,
        allowFrom: [],
      }, helper);
      this.channelManager.register(channel);
    }

    // 企业微信
    if (channels.wecom?.enabled && channels.wecom.corpId && channels.wecom.agentId && channels.wecom.secret) {
      const helper = new ChannelHelper(bus, channels.wecom.allowFrom || []);
      const channel = new WeComChannel(bus, {
        corpId: channels.wecom.corpId,
        agentId: channels.wecom.agentId,
        secret: channels.wecom.secret,
        allowFrom: [],
      }, helper);
      this.channelManager.register(channel);
    }
  }
}

/**
 * 创建应用实例
 * @param configPath - 配置文件路径（可选）
 */
export async function createApp(configPath?: string): Promise<App> {
  // 1. 先加载基础配置（系统级 + 用户级）获取 workspace
  const baseConfig = loadConfig(configPath ? { configPath } : {});
  const workspace = expandPath(baseConfig.agents.defaults.workspace);

  // 2. 加载完整配置（包含项目级和目录级）
  const config = loadConfig({ workspace });

  return new AppImpl(config, workspace);
}

// 导出类型
export type { App, CronJobSummary } from './types/interfaces';