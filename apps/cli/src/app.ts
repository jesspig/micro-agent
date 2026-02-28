/**
 * MicroAgent 应用入口
 *
 * 提供 createApp() 工厂函数，组装所有模块。
 */

import {
  loadConfig,
  expandPath,
  parseModelConfigs,
} from '@micro-agent/config';
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
import { buildIntentSystemPrompt, buildIntentUserPrompt } from '../../prompts';
import type {
  App,
  Config,
  ProviderEntry,
  InboundMessage,
  ChannelType,
} from '@micro-agent/types';
import type { ModelConfig } from '@micro-agent/config';
import { getLogger } from '@logtape/logtape';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';
import { readFileSync, existsSync, mkdirSync, writeFileSync, copyFileSync } from 'fs';

const log = getLogger(['app']);

/** 用户级配置目录 */
const USER_CONFIG_DIR = resolve(homedir(), '.micro-agent');

/** 启动状态信息收集器 */
interface StartupInfo {
  tools: string[];
  skills: string[];
  models: {
    chat?: string;
    vision?: string;
    embed?: string;
    coder?: string;
    intent?: string;
  };
  memory: {
    mode: 'vector' | 'fulltext' | 'hybrid';
    embedModel?: string;
    storagePath?: string;
    autoSummarize?: boolean;
    summarizeThreshold?: number;
  };
  channels: string[];
  warnings: string[];
}

const startupInfo: StartupInfo = {
  tools: [],
  skills: [],
  models: {},
  memory: { mode: 'fulltext' },
  channels: [],
  warnings: [],
};

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
 * 优先级：用户级 ~/.micro-agent/ > workspace/
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

  constructor(config: Config, workspace: string) {
    this.config = config;
    this.workspace = workspace;
    this.channelManager = new ChannelManager();
    this.messageBus = new MessageBus();
    this.sessionStore = new SessionStore({
      sessionsDir: `${homedir()}/.micro-agent/sessions`,
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
      log.info('已创建配置文件', { files: created });
    }

    // 1. 注册内置工具（基础工具）
    this.registerBuiltinTools();

    // 2. 初始化 Provider Gateway
    this.initProviders();

    // 3. 初始化技能加载器
    this.skillsLoader = new SkillsLoader(this.workspace, getBuiltinSkillsPath());
    this.skillsLoader.load();
    if (this.skillsLoader.count > 0) {
      startupInfo.skills = this.skillsLoader.getAll().map(s => s.name);
    }

    // 4. 初始化通道
    this.initChannels();

    // 5. 初始化记忆系统
    await this.initMemorySystem();

    // 6. 启动通道
    await this.channelManager.startAll();
    startupInfo.channels = this.channelManager.getRunningChannels();

    // 7. 创建 Agent 执行器
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
        buildIntentPrompt: buildIntentSystemPrompt,
        buildUserPrompt: buildIntentUserPrompt,
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

    // 9. 打印启动信息
    this.printStartupInfo();
  }

  /** 打印启动信息 */
  private printStartupInfo(): void {
    const chatModel = this.config.agents.models?.chat;
    
    console.log('─'.repeat(50));
    
    // 工具
    if (startupInfo.tools.length > 0) {
      console.log(`  \x1b[90m工具:\x1b[0m ${startupInfo.tools.join(', ')}`);
    }
    
    // 技能
    if (startupInfo.skills.length > 0) {
      console.log(`  \x1b[90m技能:\x1b[0m ${startupInfo.skills.join(', ')}`);
    }
    
    // 模型
    const models = startupInfo.models;
    
    // 对话模型
    if (chatModel) {
      console.log(`  \x1b[90m对话模型:\x1b[0m ${chatModel}`);
    }
    
    // 视觉模型
    if (models.vision && models.vision !== chatModel) {
      console.log(`  \x1b[90m视觉模型:\x1b[0m ${models.vision}`);
    } else if (chatModel) {
      console.log(`  \x1b[90m视觉模型:\x1b[0m ${chatModel} (继承对话模型)`);
    }
    
    // 嵌入模型
    if (models.embed) {
      console.log(`  \x1b[90m嵌入模型:\x1b[0m ${models.embed}`);
    }
    
    // 代码模型
    if (models.coder && models.coder !== chatModel) {
      console.log(`  \x1b[90m编程模型:\x1b[0m ${models.coder}`);
    } else if (chatModel) {
      console.log(`  \x1b[90m编程模型:\x1b[0m ${chatModel} (继承对话模型)`);
    }
    
    // 意图模型
    if (models.intent && models.intent !== chatModel) {
      console.log(`  \x1b[90m意图模型:\x1b[0m ${models.intent}`);
    } else if (chatModel) {
      console.log(`  \x1b[90m意图模型:\x1b[0m ${chatModel} (继承对话模型)`);
    }
    
    // 记忆模式
    const modeLabel = startupInfo.memory.mode === 'vector' 
      ? '向量检索' 
      : startupInfo.memory.mode === 'hybrid' 
        ? '混合检索' 
        : '全文检索';
    const embedModelInfo = startupInfo.memory.embedModel 
      ? ` (${startupInfo.memory.embedModel})` 
      : '';
    console.log(`  \x1b[90m记忆:\x1b[0m ${modeLabel}${embedModelInfo}`);
    
    // 自动摘要
    if (startupInfo.memory.autoSummarize && startupInfo.memory.summarizeThreshold) {
      console.log(`  \x1b[90m自动摘要:\x1b[0m ${startupInfo.memory.summarizeThreshold} 条消息`);
    }
    
    // 渠道
    if (startupInfo.channels.length > 0) {
      console.log(`  \x1b[90m渠道:\x1b[0m ${startupInfo.channels.join(', ')}`);
    }
    
    // 警告
    if (startupInfo.warnings.length > 0) {
      console.log();
      for (const w of startupInfo.warnings) {
        console.log(`  \x1b[33m⚠ ${w}\x1b[0m`);
      }
    }
    
    console.log('─'.repeat(50));
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

  private registerBuiltinTools(): void {
    this.toolRegistry.register(ReadFileTool);
    this.toolRegistry.register(WriteFileTool);
    this.toolRegistry.register(ListDirTool);
    this.toolRegistry.register(createExecTool(this.workspace));
    this.toolRegistry.register(WebFetchTool);
    this.toolRegistry.register(MessageTool);
    startupInfo.tools = this.toolRegistry.getDefinitions().map(t => t.name);
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
  }

  /**
   * 初始化记忆系统
   */
  private async initMemorySystem(): Promise<void> {
    const memoryConfig = this.config.agents.memory;
    
    // 检查是否启用记忆系统
    if (memoryConfig?.enabled === false) {
      startupInfo.warnings.push('记忆系统已禁用');
      return;
    }

    try {
      // 初始化嵌入服务
      let embeddingService;
      const embedModel = this.config.agents.models?.embed;
      
      // 收集模型信息
      startupInfo.models.chat = this.config.agents.models?.chat;
      startupInfo.models.vision = this.config.agents.models?.vision;
      startupInfo.models.embed = embedModel;
      startupInfo.models.coder = this.config.agents.models?.coder;
      startupInfo.models.intent = this.config.agents.models?.intent;
      
      if (embedModel) {
        const slashIndex = embedModel.indexOf('/');
        const providerName = slashIndex > 0 ? embedModel.slice(0, slashIndex) : Object.keys(this.config.providers)[0];
        const modelName = slashIndex > 0 ? embedModel.slice(slashIndex + 1) : embedModel;
        const providerConfig = this.config.providers[providerName || ''];
        
        if (providerConfig?.baseUrl) {
          embeddingService = new OpenAIEmbedding(
            modelName,
            providerConfig.baseUrl,
            providerConfig.apiKey || ''
          );
          startupInfo.memory.mode = 'vector';
          startupInfo.memory.embedModel = embedModel;
        } else {
          embeddingService = new NoEmbedding();
          startupInfo.memory.mode = 'fulltext';
          startupInfo.warnings.push('嵌入模型配置缺少 baseUrl，使用全文检索');
        }
      } else {
        embeddingService = new NoEmbedding();
        startupInfo.memory.mode = 'fulltext';
      }

      // 初始化 MemoryStore
      const storagePath = memoryConfig?.storagePath 
        ? expandPath(memoryConfig.storagePath)
        : resolve(homedir(), '.micro-agent/memory');

      this.memoryStore = new MemoryStore({
        storagePath,
        embeddingService,
        embedModel, // 传入当前嵌入模型 ID
        defaultSearchLimit: memoryConfig?.searchLimit ?? 10,
        shortTermRetentionDays: memoryConfig?.shortTermRetentionDays ?? 7,
      });

      await this.memoryStore.initialize();
      
      // 检测模型变更并自动启动迁移
      const modelChange = await this.memoryStore.detectModelChange();
      if (modelChange.needMigration && modelChange.hasOldModelVectors) {
        log.info('🔄 检测到嵌入模型变更，启动后台迁移', { 
          oldModel: modelChange.oldModel, 
          newModel: modelChange.newModel,
        });
        
        // 自动启动后台迁移
        try {
          const result = await this.memoryStore.migrateToModel(modelChange.newModel, { autoStart: true });
          if (result.success) {
            startupInfo.warnings.push(`嵌入模型迁移已启动：${modelChange.oldModel || '未知'} → ${modelChange.newModel}`);
          } else {
            startupInfo.warnings.push(`嵌入模型迁移启动失败：${result.error}`);
          }
        } catch (error) {
          log.error('嵌入模型迁移启动异常', { error: String(error) });
          startupInfo.warnings.push(`嵌入模型已从 ${modelChange.oldModel || '未知'} 变更为 ${modelChange.newModel}，迁移启动失败`);
        }
      } else if (modelChange.needMigration) {
        // 模型变更但无旧向量，无需迁移
        log.info('嵌入模型已变更，无旧向量需要迁移', { 
          oldModel: modelChange.oldModel, 
          newModel: modelChange.newModel,
        });
      }
      
      log.debug('记忆存储已初始化', { path: storagePath, embedModel });

      // 初始化 Summarizer
      if (memoryConfig?.autoSummarize !== false && this.memoryStore) {
        const threshold = memoryConfig?.summarizeThreshold ?? 20;
        this.summarizer = new ConversationSummarizer(
          this.llmGateway,
          this.memoryStore,
          {
            minMessages: threshold,
            maxLength: 2000,
            idleTimeout: memoryConfig?.idleTimeout ?? 300000,
          }
        );
        startupInfo.memory.autoSummarize = true;
        startupInfo.memory.summarizeThreshold = threshold;
      }

    } catch (error) {
      log.error('记忆系统初始化失败', { error: error instanceof Error ? error.message : String(error) });
      startupInfo.warnings.push('记忆系统初始化失败');
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

export type { App } from '@micro-agent/types';