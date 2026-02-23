/**
 * MicroBot 应用入口
 *
 * 提供 createApp() 工厂函数，组装所有模块。
 */

import {
  loadConfig,
  expandPath,
  parseModelConfigs,
} from '@microbot/config';
import {
  ToolRegistry,
  ChannelManager,
  SkillsLoader,
  LLMGateway,
  OpenAICompatibleProvider,
  MessageBus,
  SessionStore,
  AgentExecutor,
  MemoryStore,
  ConversationSummarizer,
  OpenAIEmbedding,
  NoEmbedding,
} from '@microbot/sdk';
import { ChannelGatewayImpl } from '@microbot/runtime';
import {
  ReadFileTool,
  WriteFileTool,
  ListDirTool,
  createExecTool,
  WebFetchTool,
  MessageTool,
} from '../../../extensions/tool';
import { FeishuChannel, CliChannel } from '../../../extensions/channel';
import { buildIntentSystemPrompt, buildIntentUserPrompt, buildReActSystemPrompt, buildObservationMessage } from '../../prompts';
import type {
  App,
  Config,
  ProviderEntry,
  InboundMessage,
} from '@microbot/types';
import type { ModelConfig } from '@microbot/config';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';
import { readFileSync, existsSync, mkdirSync, writeFileSync, copyFileSync } from 'fs';

/** 用户级配置目录 */
const USER_CONFIG_DIR = resolve(homedir(), '.microbot');

/** 获取内置技能路径 */
function getBuiltinSkillsPath(): string {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  return resolve(currentDir, '../../../extensions/skills');
}

/** 获取模板路径 */
function getTemplatesPath(): string {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  return resolve(currentDir, '../../../templates/prompts/agent');
}

/**
 * 确保用户级配置文件存在
 *
 * 首次启动时创建默认的 SOUL.md、USER.md、AGENTS.md
 */
function ensureUserConfigFiles(): { created: string[] } {
  const created: string[] = [];

  // 确保用户配置目录存在
  if (!existsSync(USER_CONFIG_DIR)) {
    mkdirSync(USER_CONFIG_DIR, { recursive: true });
  }

  const templatesPath = getTemplatesPath();
  const files = [
    { name: 'SOUL.md', template: 'soul.md' },
    { name: 'USER.md', template: 'user.md' },
    { name: 'AGENTS.md', template: 'agents.md' },
  ];

  for (const file of files) {
    const targetPath = resolve(USER_CONFIG_DIR, file.name);
    const templatePath = resolve(templatesPath, file.template);

    // 文件不存在且模板存在时创建
    if (!existsSync(targetPath) && existsSync(templatePath)) {
      copyFileSync(templatePath, targetPath);
      created.push(file.name);
    }
  }

  return { created };
}

/**
 * 加载系统提示词
 *
 * 优先级：用户级 ~/.microbot/ > workspace/
 */
function loadSystemPromptFromUserConfig(workspace: string): string {
  const parts: string[] = [];

  // 1. 加载 SOUL.md（身份）
  const soulPaths = [
    resolve(USER_CONFIG_DIR, 'SOUL.md'),
    resolve(workspace, 'SOUL.md'),
  ];

  for (const soulPath of soulPaths) {
    if (existsSync(soulPath)) {
      parts.push(readFileSync(soulPath, 'utf-8'));
      break;
    }
  }

  // 2. 加载 USER.md（用户信息）
  const userPaths = [
    resolve(USER_CONFIG_DIR, 'USER.md'),
    resolve(workspace, 'USER.md'),
  ];

  for (const userPath of userPaths) {
    if (existsSync(userPath)) {
      parts.push('\n\n---\n\n' + readFileSync(userPath, 'utf-8'));
      break;
    }
  }

  // 3. 加载 AGENTS.md（行为指南）
  const agentsPaths = [
    resolve(USER_CONFIG_DIR, 'AGENTS.md'),
    resolve(workspace, 'AGENTS.md'),
  ];

  for (const agentsPath of agentsPaths) {
    if (existsSync(agentsPath)) {
      parts.push('\n\n---\n\n' + readFileSync(agentsPath, 'utf-8'));
      break;
    }
  }

  if (parts.length > 0) {
    return parts.join('');
  }

  // 默认提示词
  return '你是一个有帮助的 AI 助手。';
}

/**
 * 应用实现
 */
class AppImpl implements App {
  private running = false;
  private channelManager: ChannelManager;
  private llmGateway: LLMGateway;
  private availableModels = new Map<string, ModelConfig[]>();
  private config: Config;
  private workspace: string;
  private messageBus: MessageBus;
  private sessionStore: SessionStore;
  private toolRegistry: ToolRegistry;
  private executor: AgentExecutor | null = null;
  private channelGateway: ChannelGatewayImpl | null = null;
  private skillsLoader: SkillsLoader | null = null;
  private memoryStore: MemoryStore | null = null;
  private summarizer: ConversationSummarizer | null = null;
  private cliChannel: CliChannel | null = null;

  constructor(config: Config, workspace: string) {
    this.config = config;
    this.workspace = workspace;
    this.channelManager = new ChannelManager();
    this.messageBus = new MessageBus();
    this.sessionStore = new SessionStore({
      sessionsDir: `${homedir()}/.microbot/sessions`,
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
    if (this.running) return;
    this.running = true;

    // 0. 确保用户级配置文件存在
    const { created } = ensureUserConfigFiles();
    if (created.length > 0) {
      console.log(`  已创建配置文件: ${created.join(', ')}`);
    }

    // 1. 注册内置工具（基础工具）
    this.registerBuiltinTools();

    // 2. 初始化 Provider Gateway
    this.initProviders();

    // 3. 初始化技能加载器
    this.skillsLoader = new SkillsLoader(this.workspace, getBuiltinSkillsPath());
    this.skillsLoader.load();
    if (this.skillsLoader.count > 0) {
      const skillNames = this.skillsLoader.getAll().map(s => s.name).join(', ');
      console.log(`  已加载 ${this.skillsLoader.count} 个技能: ${skillNames}`);
    } else {
      console.log('  未找到任何技能');
    }

    // 4. 初始化通道
    this.initChannels();

    // 5. 初始化记忆系统
    await this.initMemorySystem();

    // 6. 启动通道
    await this.channelManager.startAll();

    // 7. 创建 Agent 执行器
    this.executor = new AgentExecutor(
      this.messageBus,
      this.llmGateway,
      this.toolRegistry,
      {
        workspace: this.workspace,
        maxIterations: this.config.agents.maxToolIterations ?? 20,
        maxTokens: this.config.agents.maxTokens ?? 8192,
        temperature: this.config.agents.temperature ?? 0.7,
        systemPrompt: this.loadSystemPrompt(),
        chatModel: this.config.agents.models?.chat,
        visionModel: this.config.agents.models?.vision,
        coderModel: this.config.agents.models?.coder,
        intentModel: this.config.agents.models?.intent,
        availableModels: this.availableModels,
        buildIntentPrompt: buildIntentSystemPrompt,
        buildUserPrompt: buildIntentUserPrompt,
        buildReActPrompt: (tools) => buildReActSystemPrompt(tools, this.buildSkillsPrompt()),
        buildObservation: buildObservationMessage,
        memoryEnabled: this.config.agents.memory?.enabled,
        summarizeThreshold: this.config.agents.memory?.summarizeThreshold,
        idleTimeout: this.config.agents.memory?.idleTimeout,
      },
      this.memoryStore ?? undefined,
      this.summarizer ?? undefined
    );

    // 8. 创建并启动 ChannelGateway（消息处理中心）
    this.channelGateway = new ChannelGatewayImpl({
      executor: this.executor,
      getChannels: () => this.channelManager.getChannels(),
    });

    this.startGateway();
  }

  private loadSystemPrompt(): string {
    // 加载基础提示词（SOUL.md + USER.md + AGENTS.md）
    const basePrompt = loadSystemPromptFromUserConfig(this.workspace);

    const parts: string[] = [];

    // 1. Always 技能（Level 2 直接注入）
    if (this.skillsLoader && this.skillsLoader.count > 0) {
      const alwaysContent = this.skillsLoader.buildAlwaysSkillsContent();
      if (alwaysContent) {
        parts.push(alwaysContent);
      }
    }

    // 2. 可用技能摘要（Level 1 渐进式加载）
    if (this.skillsLoader && this.skillsLoader.count > 0) {
      const skillsSummary = this.skillsLoader.buildSkillsSummary();
      if (skillsSummary) {
        parts.push(`# 技能

以下技能可以扩展你的能力。

**使用规则：**
1. 当用户请求与某个技能的 description 关键词匹配时（如"创建XX技能"、"获取天气"等），必须先使用 \`read_file\` 读取该技能的完整内容
2. 读取 location 路径下的 SKILL.md 文件
3. 按照 SKILL.md 中的指导执行操作，而不是直接写代码

${skillsSummary}`);
      }
    }

    if (parts.length > 0) {
      return basePrompt + '\n\n---\n\n' + parts.join('\n\n---\n\n');
    }

    return basePrompt;
  }

  /**
   * 构建 ReAct 循环中使用的 Skills Prompt
   */
  private buildSkillsPrompt(): string {
    if (!this.skillsLoader || this.skillsLoader.count === 0) {
      return '';
    }

    const parts: string[] = [];

    // Always 技能（Level 2 直接注入）
    const alwaysContent = this.skillsLoader.buildAlwaysSkillsContent();
    if (alwaysContent) {
      parts.push(alwaysContent);
    }

    // 可用技能摘要（Level 1 渐进式加载）
    const skillsSummary = this.skillsLoader.buildSkillsSummary();
    if (skillsSummary) {
      parts.push(`# 技能

以下技能可以扩展你的能力。

**使用规则：**
1. 当用户请求与某个技能的 description 关键词匹配时（如"创建XX技能"、"获取天气"等），必须先使用 \`read_file\` 读取该技能的完整内容
2. 读取 location 路径下的 SKILL.md 文件
3. 按照 SKILL.md 中的指导执行操作，而不是直接写代码

${skillsSummary}`);
    }

    if (parts.length === 0) {
      return '';
    }

    return parts.join('\n\n---\n\n');
  }

  private registerBuiltinTools(): void {
    this.toolRegistry.register(ReadFileTool);
    this.toolRegistry.register(WriteFileTool);
    this.toolRegistry.register(ListDirTool);
    this.toolRegistry.register(createExecTool(this.workspace));
    this.toolRegistry.register(WebFetchTool);
    this.toolRegistry.register(MessageTool);
    console.log(`  已注册 ${this.toolRegistry.getDefinitions().length} 个基础工具: ${this.toolRegistry.getDefinitions().map(t => t.name).join(', ')}`);
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

  async stop(): Promise<void> {
    if (!this.running) return;
    this.running = false;

    if (this.executor) {
      this.executor.stop();
    }

    await this.channelManager.stopAll();
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

  /**
   * 交互式对话
   *
   * CLI 输入 → ChannelGateway → LLM → 广播到所有 Channel
   */
  async chat(input: string): Promise<string> {
    if (!this.channelGateway) {
      throw new Error('ChannelGateway 未初始化');
    }

    // 设置输入状态，禁用广播输出
    if (this.cliChannel) {
      this.cliChannel.setInputting(true);
    }

    const msg: InboundMessage = {
      channel: 'cli',
      chatId: 'default',
      senderId: 'user',
      content: input,
      media: [],
      metadata: {},
      timestamp: new Date(),
    };

    // 通过 gateway 处理（会调用 LLM 并广播）
    await this.channelGateway.process(msg);

    // 恢复输入状态，显示缓存的广播消息
    if (this.cliChannel) {
      this.cliChannel.setInputting(false);
      this.cliChannel.flushBroadcasts();
    }

    return '处理完成';
  }

  private initProviders(): void {
    const providers = this.config.providers as Record<string, ProviderEntry | undefined>;
    const chatModel = this.config.agents.models?.chat || '';

    const slashIndex = chatModel.indexOf('/');
    const defaultProviderName = slashIndex > 0 ? chatModel.slice(0, slashIndex) : null;
    const defaultModelId = slashIndex > 0 ? chatModel.slice(slashIndex + 1) : chatModel;

    for (const [name, config] of Object.entries(providers)) {
      if (!config) continue;

      const modelIds = config.models ?? [];
      const modelConfigs = parseModelConfigs(modelIds);

      if (modelConfigs.length > 0) {
        this.availableModels.set(name, modelConfigs);
      }

      const provider = new OpenAICompatibleProvider({
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        defaultModel: modelConfigs[0]?.id ?? defaultModelId,
        modelConfigs,
      });

      const priority = name === defaultProviderName ? 1 : 100;
      this.llmGateway.registerProvider(name, provider, modelIds.length > 0 ? modelIds : ['*'], priority, modelConfigs);
    }
  }

  private initChannels(): void {
    const channels = this.config.channels;

    // 飞书通道
    if (channels.feishu?.enabled && channels.feishu.appId && channels.feishu.appSecret) {
      const channel = new FeishuChannel(this.messageBus, {
        appId: channels.feishu.appId,
        appSecret: channels.feishu.appSecret,
        allowFrom: channels.feishu.allowFrom ?? [],
      });
      this.channelManager.register(channel);
    }

    // CLI 通道（始终注册）
    this.cliChannel = new CliChannel(this.messageBus);
    this.channelManager.register(this.cliChannel);
  }

  /**
   * 初始化记忆系统
   */
  private async initMemorySystem(): Promise<void> {
    const memoryConfig = this.config.agents.memory;
    
    // 检查是否启用记忆系统
    if (memoryConfig?.enabled === false) {
      console.log('  记忆系统已禁用');
      return;
    }

    try {
      // 初始化嵌入服务
      let embeddingService;
      const embedModel = this.config.agents.models?.embed;
      
      if (embedModel) {
        // 使用配置的嵌入模型，从 providers 配置中获取 API 信息
        const slashIndex = embedModel.indexOf('/');
        const providerName = slashIndex > 0 ? embedModel.slice(0, slashIndex) : Object.keys(this.config.providers)[0];
        const providerConfig = this.config.providers[providerName || ''];
        
        // 详细诊断日志
        console.log(`  嵌入模型配置: ${embedModel}`);
        console.log(`  提取的 provider: ${providerName || '(未指定)'}`);
        console.log(`  provider 配置存在: ${!!providerConfig}`);
        if (providerConfig) {
          console.log(`  provider.baseUrl: ${providerConfig.baseUrl ? '✓ 已配置' : '✗ 未配置'}`);
          console.log(`  provider.apiKey: ${providerConfig.apiKey ? '✓ 已配置' : '✗ 未配置'}`);
        }
        
        if (providerConfig?.baseUrl) {
          // 本地服务（如 ollama）不需要 apiKey
          embeddingService = new OpenAIEmbedding(
            embedModel,
            providerConfig.baseUrl,
            providerConfig.apiKey || '' // 本地服务 apiKey 可为空
          );
          console.log(`  记忆系统: 使用嵌入模型 ${embedModel}`);
          if (!providerConfig.apiKey) {
            console.log('  提示: 本地服务未配置 apiKey，使用无认证模式');
          }
        } else {
          embeddingService = new NoEmbedding();
          console.log('  记忆系统: 嵌入模型配置缺失 baseUrl，使用全文检索');
          console.log('  提示: 请确保 providers 中对应的 provider 配置了 baseUrl');
        }
      } else {
        // 无嵌入模型，使用 NoEmbedding
        embeddingService = new NoEmbedding();
        console.log('  记忆系统: 无嵌入模型配置，使用全文检索');
        console.log('  提示: 在 agents.models.embed 中配置嵌入模型以启用向量检索');
      }

      // 初始化 MemoryStore
      const storagePath = memoryConfig?.storagePath 
        ? expandPath(memoryConfig.storagePath)
        : resolve(homedir(), '.microbot/memory');

      this.memoryStore = new MemoryStore({
        storagePath,
        embeddingService,
        defaultSearchLimit: memoryConfig?.searchLimit ?? 10,
        shortTermRetentionDays: memoryConfig?.shortTermRetentionDays ?? 7,
      });

      await this.memoryStore.initialize();
      console.log(`  记忆存储路径: ${storagePath}`);

      // 初始化 Summarizer
      if (memoryConfig?.autoSummarize !== false && this.memoryStore) {
        this.summarizer = new ConversationSummarizer(
          this.llmGateway,
          this.memoryStore,
          {
            minMessages: memoryConfig?.summarizeThreshold ?? 20,
            maxLength: 2000,
            idleTimeout: memoryConfig?.idleTimeout ?? 300000,
          }
        );
        console.log(`  自动摘要: 启用 (阈值: ${memoryConfig?.summarizeThreshold ?? 20} 条消息)`);
      } else {
        console.log('  自动摘要: 禁用');
      }

    } catch (error) {
      console.error('记忆系统初始化失败:', error instanceof Error ? error.message : String(error));
      // 继续运行，但不使用记忆系统
      this.memoryStore = null;
      this.summarizer = null;
    }
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

export type { App } from '@microbot/types';