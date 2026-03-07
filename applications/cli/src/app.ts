/**
 * MicroAgent CLI 应用
 *
 * 连接 Agent Service，路由消息到各通道（飞书等）
 */

import { homedir } from 'os';
import { join, resolve, dirname } from 'path';
import { loadConfig, createDefaultUserConfig } from '@micro-agent/config';
import { MessageRouter } from './modules/message-router';
import { FeishuWrapper, type FeishuConfig as FeishuWrapperConfig } from './modules/feishu-wrapper';
import { AgentClientImpl } from './modules/agent-client';
import {
  createDefaultStartupInfo,
  printStartupInfo,
  displayErrorInfo,
  displayShutdownInfo,
  type StartupInfo,
} from './modules/startup-info';
import { getBuiltinToolConfigs } from './modules/tools-init';
import { getBuiltinSkillConfigs, getSkillsBuiltinPath } from './modules/skills-init';
import { getProviderConfigs, parseDefaultModelInfo } from './modules/providers-init';
import { getMemorySystemConfig, getSearchModeDescription, getEmbeddingModelInfo } from './modules/memory-init';
import { ensureUserConfigFiles, loadSystemPrompt } from './modules/system-prompt';
import { getLogger } from '@logtape/logtape';
import { existsSync, watch, type FSWatcher } from 'fs';
import { SkillsLoader } from '@micro-agent/sdk';
import { fileURLToPath } from 'url';

const log = getLogger(['cli', 'app']);

/** 应用配置 */
export interface AppConfig {
  /** 日志级别 */
  logLevel?: 'debug' | 'info' | 'warn';
  /** IPC 路径 */
  ipcPath?: string;
  /** 配置文件路径 */
  configPath?: string;
  /** 详细输出 */
  verbose?: boolean;
}

/** 应用接口 */
export interface App {
  start(): Promise<void>;
  stop(): Promise<void>;
  getStatus(): { running: boolean; channels: string[]; sessions: number };
  getRunningChannels(): string[];
  getProviderStatus(): string;
}

/**
 * CLI 应用实现
 */
class CLIApp implements App {
  private running = false;
  private config: AppConfig;
  private router: MessageRouter | null = null;
  private agentClient: AgentClientImpl | null = null;
  private skillsLoader: SkillsLoader | null = null;
  private startupInfo: StartupInfo;
  private settings: Settings;
  private configWatcher: FSWatcher | null = null;
  private reloadTimer: Timer | null = null;
  private isReloading = false;

  constructor(config: AppConfig) {
    this.config = config;
    this.startupInfo = createDefaultStartupInfo();
    this.settings = this.loadSettings();
  }

  async start(): Promise<void> {
    if (this.running) {
      log.warn('应用已在运行中');
      return;
    }

    try {
      // 1. 确保用户配置文件存在
      this.ensureUserConfigFiles();

      // 2. 初始化技能加载器
      this.initSkillsLoader();

      // 3. 收集启动信息
      this.collectStartupInfo();

      // 4. 创建 Agent 客户端
      this.agentClient = new AgentClientImpl({
        ipcPath: this.config.ipcPath,
        timeout: 60000,
      });

      // 5. 创建消息路由器
      this.router = new MessageRouter(this.agentClient);

      // 6. 注册通道
      await this.registerChannels();

      // 7. 启动路由器（连接到 Agent Service）
      await this.router.start();

      // 8. 向 Agent Service 传递配置
      await this.configureAgentService();

      this.running = true;

      // 9. 打印启动信息
      printStartupInfo(this.startupInfo);

      log.info('应用启动完成');

      // 10. 启动配置热重载监听
      this.startConfigWatcher();

      // 11. 保持运行
      await this.keepAlive();

    } catch (error) {
      displayErrorInfo(error as Error);
      throw error;
    }
  }

  /**
   * 初始化技能加载器
   */
  private initSkillsLoader(): void {
    const workspace = this.settings.agents?.workspace || process.cwd();
    const builtinPath = getSkillsBuiltinPath();
    
    this.skillsLoader = new SkillsLoader(workspace, builtinPath);
    this.skillsLoader.load();
    
    log.info('技能加载器已初始化', { count: this.skillsLoader.count });
  }

  /**
   * 配置 Agent Service
   * 
   * 将 CLI 收集的配置传递给 Agent Service
   */
  private async configureAgentService(): Promise<void> {
    if (!this.agentClient || !this.agentClient.connected) {
      log.warn('Agent Service 未连接，跳过配置传递');
      return;
    }

    log.info('开始配置 Agent Service...');

    try {
      const workspace = this.settings.agents?.workspace || process.cwd();

      // 1. 设置系统提示词（使用 SkillsLoader 构建完整提示词）
      const systemPrompt = loadSystemPrompt(workspace, this.skillsLoader);
      await this.agentClient.setSystemPrompt(systemPrompt);
      log.info('系统提示词已传递', { length: systemPrompt.length });

      // 2. 注册工具
      const tools = getBuiltinToolConfigs();
      const enabledTools = tools.filter(t => t.enabled !== false);
      if (enabledTools.length > 0) {
        await this.agentClient.registerTools(enabledTools);
        log.info('工具已注册', { count: enabledTools.length });
      }

      // 3. 加载技能（传递完整技能信息，包含路径）
      if (this.skillsLoader && this.skillsLoader.count > 0) {
        const skills = this.skillsLoader.getAll().map(s => ({
          name: s.name,
          description: s.description,
          enabled: true,
          path: s.skillPath,
          always: s.always,
          allowedTools: s.allowedTools,
        }));
        await this.agentClient.loadSkills(skills);
        log.info('技能已加载', { count: skills.length });
      }

      // 4. 配置记忆系统
      const memoryConfig = getMemorySystemConfig(this.settings as any);
      if (memoryConfig.enabled) {
        // 获取嵌入模型信息
        const embedModelInfo = getEmbeddingModelInfo(this.settings as any);
        
        await this.agentClient.configureMemory({
          enabled: true,
          mode: memoryConfig.mode,
          embedModel: memoryConfig.embedModel,
          embedBaseUrl: embedModelInfo?.baseUrl,
          embedApiKey: embedModelInfo?.apiKey,
          storagePath: memoryConfig.storagePath,
          searchLimit: memoryConfig.searchLimit,
          autoSummarize: memoryConfig.autoSummarize,
          summarizeThreshold: memoryConfig.summarizeThreshold,
        });
        log.info('记忆系统已配置', { mode: memoryConfig.mode, hasEmbedding: !!embedModelInfo?.baseUrl });
      }

      // 5. 配置知识库
      if (this.settings.agents?.workspace) {
        // 获取嵌入模型信息
        const embedModelInfo = getEmbeddingModelInfo(this.settings as any);
        
        await this.agentClient.configureKnowledge({
          enabled: true,
          basePath: resolve(this.settings.agents.workspace, '.knowledge'),
          embedModel: this.settings.agents.models?.embed,
          embedBaseUrl: embedModelInfo?.baseUrl,
          embedApiKey: embedModelInfo?.apiKey,
        });
        log.info('知识库已配置', { hasEmbedding: !!embedModelInfo?.baseUrl });
      }

      log.info('Agent Service 配置完成');
    } catch (error) {
      log.error('配置 Agent Service 失败', { error: error instanceof Error ? error.message : String(error) });
      // 配置失败不阻止启动，但记录警告
      this.startupInfo.warningMessages.push(`Agent Service 配置传递失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async stop(): Promise<void> {
    if (!this.running) return;

    displayShutdownInfo();
    this.running = false;

    // 关闭配置监听器
    this.stopConfigWatcher();

    if (this.router) {
      await this.router.stop();
    }

    log.info('服务已停止');
  }

  getStatus(): { running: boolean; channels: string[]; sessions: number } {
    return {
      running: this.running,
      channels: this.getConnectedChannels(),
      sessions: this.router?.activeSessionCount ?? 0,
    };
  }

  getRunningChannels(): string[] {
    return this.startupInfo.channels;
  }

  getProviderStatus(): string {
    const providers = getProviderConfigs(this.settings as any);
    if (providers.length === 0) {
      return '未配置';
    }
    const { defaultProviderName } = parseDefaultModelInfo(this.settings as any);
    return defaultProviderName || providers[0].name;
  }

  /**
   * 确保用户配置文件存在
   */
  private ensureUserConfigFiles(): void {
    const { created } = ensureUserConfigFiles();
    if (created.length > 0) {
      log.info('已创建提示词文件', { files: created });
    }

    // 创建默认 settings.yaml（如果不存在）
    const templatesPath = this.getTemplatesPath();
    createDefaultUserConfig(templatesPath);
  }

  /**
   * 获取模板路径
   */
  private getTemplatesPath(): string {
    // 模板目录包含 settings.example.yaml
    // 路径：applications/templates/configs/ 或 templates/configs/
    const possiblePaths = [
      resolve(import.meta.dir, '../../templates/configs'), // applications/templates/configs
      resolve(import.meta.dir, '../../../templates/configs'), // 项目根目录 templates/configs
    ];

    for (const path of possiblePaths) {
      const settingsExample = join(path, 'settings.example.yaml');
      if (existsSync(settingsExample)) {
        return path;
      }
    }

    // 回退到 applications/templates/configs
    return possiblePaths[0];
  }

  /**
   * 收集启动信息
   */
  private collectStartupInfo(): void {
    // 收集工具信息
    log.info('初始化工具...');
    const tools = getBuiltinToolConfigs();
    this.startupInfo.tools = tools.filter(t => t.enabled).map(t => t.name);
    log.info('工具已加载', { count: this.startupInfo.tools.length, tools: this.startupInfo.tools });

    // 收集技能信息（使用 SkillsLoader）
    log.info('加载技能...');
    if (this.skillsLoader && this.skillsLoader.count > 0) {
      this.startupInfo.skills = this.skillsLoader.getAll().map(s => s.name);
      log.info('技能已加载', { count: this.startupInfo.skills.length, skills: this.startupInfo.skills.slice(0, 5) });
    }

    // 收集模型信息
    log.info('解析模型配置...');
    if (this.settings.agents?.models) {
      this.startupInfo.models = {
        chat: this.settings.agents.models.chat,
        vision: this.settings.agents.models.vision,
        embed: this.settings.agents.models.embed,
        coder: this.settings.agents.models.coder,
        intent: this.settings.agents.models.intent,
      };
      if (this.settings.agents.models.chat) {
        log.info('对话模型', { model: this.settings.agents.models.chat });
      }
    }

    // 收集 Provider 信息
    log.info('初始化 Provider...');
    const providers = getProviderConfigs(this.settings as any);
    if (providers.length > 0) {
      log.info('Provider �����置', { count: providers.length, providers: providers.map(p => p.name) });
    }

    // 收集记忆系统信息
    log.info('初始化记忆系统...');
    const memoryConfig = getMemorySystemConfig(this.settings as any);
    this.startupInfo.memory = {
      mode: memoryConfig.mode,
      embedModel: memoryConfig.embedModel,
      storagePath: memoryConfig.storagePath,
      autoSummarize: memoryConfig.autoSummarize,
      summarizeThreshold: memoryConfig.summarizeThreshold,
    };
    if (memoryConfig.enabled) {
      log.info('记忆系统已启用', { mode: memoryConfig.mode, embedModel: memoryConfig.embedModel });
    }

    // 收集通道信息
    log.info('初始化消息通道...');
    this.startupInfo.channels = this.getEnabledChannels();
    if (this.startupInfo.channels.length > 0) {
      log.info('通道已启用', { channels: this.startupInfo.channels });
    }

    // 添加提示信息
    if (memoryConfig.enabled) {
      this.startupInfo.infoMessages.push(`记忆系统已启用 (${getSearchModeDescription(this.settings as any)})`);
    }

    // 检查配置警告
    this.checkConfigWarnings();
  }

  /**
   * 检查配置警告
   */
  private checkConfigWarnings(): void {
    const providers = getProviderConfigs(this.settings as any);
    
    if (!this.settings.agents?.models?.chat && providers.length === 0) {
      this.startupInfo.warningMessages.push('未配置对话模型');
    }

    if (providers.length === 0) {
      this.startupInfo.warningMessages.push('未配置 Provider');
    }

    if (this.startupInfo.channels.length === 0) {
      this.startupInfo.warningMessages.push('未启用消息通道');
    }
  }

  /**
   * 加载用户设置
   */
  private loadSettings(): Settings {
    try {
      const config = loadConfig({});
      return {
        agents: config.agents,
        providers: config.providers,
        channels: config.channels,
      };
    } catch (error) {
      log.warn('配置加载失败', { error: error instanceof Error ? error.message : String(error) });
      return { channels: {} };
    }
  }

  /**
   * 启动配置文件热重载监听
   */
  private startConfigWatcher(): void {
    const configPath = this.getUserConfigPath();
    if (!configPath) {
      log.debug('未找到用户配置文件，跳过热重载监听');
      return;
    }

    try {
      this.configWatcher = watch(configPath, (eventType) => {
        if (eventType === 'change') {
          this.scheduleConfigReload();
        }
      });
      console.log(`\x1b[36m[热重载]\x1b[0m 已启用，监听 ${configPath.replace(homedir(), '~')}`);
      log.info('配置热重载已启用', { path: configPath });
    } catch (error) {
      log.warn('配置监听启动失败', { error: error instanceof Error ? error.message : String(error) });
    }
  }

  /**
   * 停止配置文件监听
   */
  private stopConfigWatcher(): void {
    if (this.reloadTimer) {
      clearTimeout(this.reloadTimer);
      this.reloadTimer = null;
    }
    if (this.configWatcher) {
      this.configWatcher.close();
      this.configWatcher = null;
      log.debug('配置监听已关闭');
    }
  }

  /**
   * 调度配置重载（防抖处理）
   */
  private scheduleConfigReload(): void {
    if (this.reloadTimer) {
      clearTimeout(this.reloadTimer);
    }
    // 1 秒防抖，避免编辑器多次保存事件
    this.reloadTimer = setTimeout(() => {
      this.reloadConfig();
    }, 1000);
  }

  /**
   * 重载配置并更新组件
   */
  private async reloadConfig(): Promise<void> {
    // 防止并发重载
    if (this.isReloading) {
      log.debug('配置正在重载中，跳过');
      return;
    }

    this.isReloading = true;

    try {
      const oldSettings = this.settings;
      const newSettings = this.loadSettings();

      // 检测是否有实际变化
      if (JSON.stringify(oldSettings) === JSON.stringify(newSettings)) {
        log.debug('配置未发生变化');
        return;
      }

      // 检查配置是否有效（防止文件写入中途触发）
      if (!this.isValidConfig(newSettings)) {
        log.warn('配置文件���能不完整，跳过此次重载');
        return;
      }

      console.log(`\x1b[36m[热重载]\x1b[0m 检测到配置变化，正在更新...`);
      this.settings = newSettings;

      // 通知 Agent Service 重新加载配置（包括 providers）
      if (this.agentClient && this.agentClient.connected) {
        try {
          const reloadResult = await this.agentClient.reloadConfig();
          if (reloadResult.hasProvider) {
            console.log(`\x1b[32m[热重载]\x1b[0m LLM Provider 已更新 (${reloadResult.defaultModel})`);
          } else {
            console.log(`\x1b[33m[热重载]\x1b[0m 未配置 LLM Provider`);
          }

          // 重新配置其他组件
          await this.configureAgentService();
          console.log(`\x1b[32m[热重载]\x1b[0m Agent Service 配置已更新`);
        } catch (error) {
          console.log(`\x1b[31m[热重载]\x1b[0m Agent Service 配置更新失败: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      // 热更新通道配置
      if (JSON.stringify(oldSettings.channels) !== JSON.stringify(newSettings.channels)) {
        await this.updateChannels(oldSettings.channels, newSettings.channels);
      }
    } finally {
      this.isReloading = false;
    }
  }

  /**
   * 检查配置是否有效
   */
  private isValidConfig(settings: Settings): boolean {
    // 至少要有 channels 或 providers 中的一个
    if (!settings.channels && !settings.providers) {
      return false;
    }
    // 如果有 channels，检查结构是否完整
    if (settings.channels) {
      for (const key of Object.keys(settings.channels)) {
        const channel = settings.channels[key as keyof typeof settings.channels];
        // 如果通道标记为启用但没有必要配置，可能是文件写入中途
        if (channel?.enabled && !channel.appId && !channel.appSecret) {
          return false;
        }
      }
    }
    return true;
  }

  /**
   * 热更新通道配置
   */
  private async updateChannels(
    oldChannels: Settings['channels'],
    newChannels: Settings['channels']
  ): Promise<void> {
    if (!this.router) return;

    const oldEnabledTypes = new Set(
      Object.keys(oldChannels || {}).filter(t => oldChannels?.[t as keyof typeof oldChannels]?.enabled)
    );
    const newEnabledTypes = new Set(
      Object.keys(newChannels || {}).filter(t => newChannels?.[t as keyof typeof newChannels]?.enabled)
    );

    // 停止被禁用的通道（只处理真正禁用的）
    for (const type of oldEnabledTypes) {
      if (!newEnabledTypes.has(type)) {
        console.log(`\x1b[33m[热重载]\x1b[0m 通道 ${type} 已禁用，正在停止...`);
        await this.router.unregisterChannel(type);
        console.log(`\x1b[32m[热重载]\x1b[0m 通道 ${type} 已停止`);
      }
    }

    // 启动新启用的通道或重启配置变化的通道
    for (const type of newEnabledTypes) {
      const oldConfig = oldChannels?.[type as keyof typeof oldChannels];
      const newConfig = newChannels?.[type as keyof typeof newChannels];

      if (!oldEnabledTypes.has(type)) {
        // 新启用的通道
        console.log(`\x1b[33m[热重载]\x1b[0m 通道 ${type} 已启用，正在启动...`);
        await this.registerChannel(type);
      } else if (JSON.stringify(oldConfig) !== JSON.stringify(newConfig)) {
        // 配置变化，重启通道
        console.log(`\x1b[33m[热重载]\x1b[0m 通道 ${type} 配置已变化，正在重启...`);
        await this.router.unregisterChannel(type);
        await this.registerChannel(type);
      }
    }
  }

  /**
   * 注册单个通道
   */
  private async registerChannel(type: string): Promise<void> {
    if (!this.router) return;

    if (type === 'feishu' && this.settings.channels?.feishu?.enabled) {
      const feishuConfig = this.settings.channels.feishu;

      if (!feishuConfig.appId || !feishuConfig.appSecret) {
        console.log(`\x1b[31m[热重载]\x1b[0m 飞书配置不完整，跳过启动`);
        return;
      }

      try {
        const feishu = new FeishuWrapper({
          appId: feishuConfig.appId,
          appSecret: feishuConfig.appSecret,
          encryptKey: feishuConfig.encryptKey,
          verificationToken: feishuConfig.verificationToken,
        });

        this.router.registerChannel(feishu);
        await feishu.start();
        console.log(`\x1b[32m[热重载]\x1b[0m 飞书通道已启动`);
      } catch (error) {
        console.log(`\x1b[31m[热重载]\x1b[0m 飞书通道启动失败: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  /**
   * 获取用户配置文件路径
   */
  private getUserConfigPath(): string | null {
    const configDir = join(homedir(), '.micro-agent');
    const configFiles = ['settings.yaml', 'settings.yml', 'settings.json'];

    for (const file of configFiles) {
      const path = join(configDir, file);
      if (existsSync(path)) {
        return path;
      }
    }
    return null;
  }

  /**
   * 注册通道
   */
  private async registerChannels(): Promise<void> {
    // 飞书通道
    if (this.settings.channels?.feishu?.enabled) {
      const feishuConfig = this.settings.channels.feishu;
      
      if (!feishuConfig.appId || !feishuConfig.appSecret) {
        this.startupInfo.warningMessages.push('飞书配置不完整');
        return;
      }

      try {
        const feishu = new FeishuWrapper({
          appId: feishuConfig.appId,
          appSecret: feishuConfig.appSecret,
          encryptKey: feishuConfig.encryptKey,
          verificationToken: feishuConfig.verificationToken,
        });

        this.router!.registerChannel(feishu);
        log.info('飞书通道已注册');
      } catch (error) {
        this.startupInfo.warningMessages.push(`飞书通道注册失败: ${(error as Error).message}`);
      }
    }
  }

  /**
   * 获取已启用的通道列表
   */
  private getEnabledChannels(): string[] {
    const channels: string[] = [];

    if (this.settings.channels?.feishu?.enabled) {
      channels.push('feishu');
    }

    return channels;
  }

  /**
   * 获取已连接的通道列表
   */
  private getConnectedChannels(): string[] {
    if (!this.router) return [];
    
    const channels: string[] = [];
    const status = this.getChannelStatus();
    
    for (const ch of status) {
      if (ch.connected) {
        channels.push(ch.type);
      }
    }
    
    return channels;
  }

  /**
   * 获取通道状态
   */
  private getChannelStatus(): { type: string; connected: boolean }[] {
    const status: { type: string; connected: boolean }[] = [];

    if (this.settings.channels?.feishu?.enabled) {
      status.push({ type: 'feishu', connected: this.running });
    }

    return status;
  }

  /**
   * 保持运行
   */
  private keepAlive(): Promise<void> {
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (!this.running) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 1000);
    });
  }
}

/** 用户设置接口 */
interface Settings {
  agents?: {
    models?: {
      chat?: string;
      tool?: string;
      embed?: string;
      vision?: string;
      coder?: string;
      intent?: string;
    };
    workspace?: string;
    memory?: {
      enabled?: boolean;
      storagePath?: string;
      searchLimit?: number;
      autoSummarize?: boolean;
      summarizeThreshold?: number;
    };
  };
  providers?: Record<string, {
    baseUrl?: string;
    apiKey?: string;
    models?: string[];
  }>;
  channels?: {
    feishu?: FeishuChannelConfig;
  };
}

/** 飞书通道配置 */
interface FeishuChannelConfig {
  enabled?: boolean;
  appId?: string;
  appSecret?: string;
  encryptKey?: string;
  verificationToken?: string;
}

/**
 * 创建应用
 */
export async function createApp(config: AppConfig): Promise<App> {
  return new CLIApp(config);
}
