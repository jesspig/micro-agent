/**
 * 配置 API
 * 
 * 运行时配置通过 SDK API 传入，不持久化。
 */

import type { RuntimeConfig } from '../client/types';

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
}
