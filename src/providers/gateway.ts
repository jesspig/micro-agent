import type { ILLMProvider, LLMMessage, LLMResponse, LLMToolDefinition } from './base';

/** Provider 配置 */
interface ProviderEntry {
  provider: ILLMProvider;
  models: string[];
  priority: number;
}

/** Gateway 配置 */
export interface GatewayConfig {
  defaultProvider: string;
  fallbackEnabled: boolean;
}

const DEFAULT_CONFIG: GatewayConfig = {
  defaultProvider: 'ollama',
  fallbackEnabled: true,
};

/**
 * LLM Gateway
 * 
 * 聚合多个 Provider，支持自动路由和故障转移。
 */
export class LLMGateway implements ILLMProvider {
  readonly name = 'gateway';
  
  private providers = new Map<string, ProviderEntry>();

  constructor(private config: GatewayConfig = DEFAULT_CONFIG) {}

  /**
   * 注册 Provider
   * @param name - Provider 名称
   * @param provider - Provider 实例
   * @param models - 支持的模型列表
   * @param priority - 优先级（越小越优先）
   */
  registerProvider(
    name: string,
    provider: ILLMProvider,
    models: string[],
    priority: number = 100
  ): void {
    this.providers.set(name, { provider, models, priority });
  }

  /**
   * 获取已注册的 Provider 名称列表
   */
  getProviderNames(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * 聊天（自动路由到合适的 Provider）
   */
  async chat(
    messages: LLMMessage[],
    tools?: LLMToolDefinition[],
    model?: string
  ): Promise<LLMResponse> {
    const providerName = this.findProvider(model);
    const entry = this.providers.get(providerName);

    if (!entry) {
      throw new Error(`未找到 Provider: ${providerName}`);
    }

    try {
      return await entry.provider.chat(messages, tools, model);
    } catch (error) {
      if (this.config.fallbackEnabled) {
        return this.fallback(messages, tools, model, providerName);
      }
      throw error;
    }
  }

  /**
   * 故障转移
   */
  private async fallback(
    messages: LLMMessage[],
    tools: LLMToolDefinition[] | undefined,
    model: string | undefined,
    failedProvider: string
  ): Promise<LLMResponse> {
    const sorted = Array.from(this.providers.entries())
      .filter(([name]) => name !== failedProvider)
      .sort((a, b) => a[1].priority - b[1].priority);

    for (const [name, entry] of sorted) {
      if (await entry.provider.isAvailable()) {
        try {
          return await entry.provider.chat(messages, tools, model);
        } catch {
          // 继续尝试下一个
          continue;
        }
      }
    }

    throw new Error('所有 Provider 不可用');
  }

  /**
   * 查找支持指定模型的 Provider
   */
  private findProvider(model?: string): string {
    if (!model) return this.config.defaultProvider;

    for (const [name, entry] of this.providers) {
      if (entry.models.includes(model) || entry.models.includes('*')) {
        return name;
      }
    }

    return this.config.defaultProvider;
  }

  getDefaultModel(): string {
    const entry = this.providers.get(this.config.defaultProvider);
    return entry?.provider.getDefaultModel() ?? 'qwen3';
  }

  async isAvailable(): Promise<boolean> {
    for (const entry of this.providers.values()) {
      if (await entry.provider.isAvailable()) return true;
    }
    return false;
  }
}
