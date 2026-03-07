/**
 * 配置 API
 * 
 * 运行时配置通过 SDK API 传入，不持久化。
 */

import type { RuntimeConfig, ToolConfig, SkillConfig, MemoryConfig, KnowledgeConfig } from '../client/types';

interface Transport {
  send(method: string, params: unknown): Promise<unknown>;
}

/**
 * 配置 API
 */
export class ConfigAPI {
  private currentConfig: RuntimeConfig;

  constructor(private transport: Transport) {
    // 默认配置
    this.currentConfig = {
      workspace: '',
      maxTokens: 4096,
      temperature: 0.7,
      maxIterations: 10,
    };
  }

  /**
   * 更新配置
   */
  async update(config: Partial<RuntimeConfig>): Promise<void> {
    this.currentConfig = { ...this.currentConfig, ...config };
    await this.transport.send('config.update', { config });
  }

  /**
   * 获取完整配置
   */
  async get(): Promise<RuntimeConfig> {
    return this.currentConfig;
  }

  /**
   * 获取特定配置项
   */
  async getOne<K extends keyof RuntimeConfig>(key: K): Promise<RuntimeConfig[K]> {
    return this.currentConfig[key];
  }

  /**
   * 设置系统提示词
   */
  async setSystemPrompt(prompt: string): Promise<void> {
    this.currentConfig.systemPrompt = prompt;
    await this.transport.send('config.setSystemPrompt', { prompt });
  }

  /**
   * 注册工具
   */
  async registerTools(tools: ToolConfig[]): Promise<void> {
    if (!this.currentConfig.tools) {
      this.currentConfig.tools = [];
    }
    this.currentConfig.tools.push(...tools);
    await this.transport.send('config.registerTools', { tools });
  }

  /**
   * 加载技能
   */
  async loadSkills(skills: SkillConfig[]): Promise<void> {
    if (!this.currentConfig.skills) {
      this.currentConfig.skills = [];
    }
    this.currentConfig.skills.push(...skills);
    await this.transport.send('config.loadSkills', { skills });
  }

  /**
   * 配置记忆系统
   */
  async configureMemory(config: MemoryConfig): Promise<void> {
    this.currentConfig.memory = config;
    await this.transport.send('config.configureMemory', { config });
  }

  /**
   * 配置知识库
   */
  async configureKnowledge(config: KnowledgeConfig): Promise<void> {
    this.currentConfig.knowledge = config;
    await this.transport.send('config.configureKnowledge', { config });
  }

  /**
   * 重新加载配置
   * 
   * 通知 Agent Service 重新加载配置文件并重新初始化 LLM Provider
   */
  async reloadConfig(): Promise<{ success: boolean; hasProvider: boolean; defaultModel: string }> {
    const result = await this.transport.send('config.reload', {}) as {
      success: boolean;
      hasProvider: boolean;
      defaultModel: string;
    };
    return result;
  }
}
