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
} from '@microbot/sdk';
import {
  ReadFileTool,
  WriteFileTool,
  ListDirTool,
  createExecTool,
  WebFetchTool,
  MessageTool,
} from '../../../extensions/tool';
import { FeishuChannel } from '../../../extensions/channel';
import { buildIntentSystemPrompt, buildIntentUserPrompt, buildReActSystemPrompt, buildObservationMessage } from '../../prompts';
import type {
  App,
  Config,
  ProviderEntry,
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
  private gateway: LLMGateway;
  private availableModels = new Map<string, ModelConfig[]>();
  private config: Config;
  private workspace: string;
  private messageBus: MessageBus;
  private sessionStore: SessionStore;
  private toolRegistry: ToolRegistry;
  private executor: AgentExecutor | null = null;
  private skillsLoader: SkillsLoader | null = null;

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
    this.gateway = new LLMGateway({ defaultProvider, fallbackEnabled: true });
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

    // 5. 启动通道
    await this.channelManager.startAll();

    // 6. 启动出站消息消费者
    this.startOutboundConsumer();

    // 7. 创建并启动 Agent 执行器
    this.executor = new AgentExecutor(
      this.messageBus,
      this.gateway,
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
      }
    );

    this.executor.run().catch(error => {
      console.error('执行器异常:', error instanceof Error ? error.message : String(error));
    });
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

  private startOutboundConsumer(): void {
    (async () => {
      while (this.running) {
        try {
          const msg = await this.messageBus.consumeOutbound();
          await this.channelManager.send(msg);
        } catch (error) {
          console.error('发送消息失败:', error instanceof Error ? error.message : String(error));
        }
      }
    })().catch(error => {
      console.error('出站消费者异常:', error instanceof Error ? error.message : String(error));
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
    return this.gateway.getDefaultModel();
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
      this.gateway.registerProvider(name, provider, modelIds.length > 0 ? modelIds : ['*'], priority, modelConfigs);
    }
  }

  private initChannels(): void {
    const channels = this.config.channels;

    if (channels.feishu?.enabled && channels.feishu.appId && channels.feishu.appSecret) {
      const channel = new FeishuChannel(this.messageBus, {
        appId: channels.feishu.appId,
        appSecret: channels.feishu.appSecret,
        allowFrom: channels.feishu.allowFrom ?? [],
      });
      this.channelManager.register(channel);
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