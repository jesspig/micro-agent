import type { LLMProvider, LLMMessage, LLMResponse, LLMToolDefinition } from './base';
import { getLogger } from '@logtape/logtape';

const log = getLogger(['gateway']);

/** Provider 配置 */
interface ProviderEntry {
  provider: LLMProvider;
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
 * 
 * 模型名称格式：`provider/model`（如 `ollama/qwen3`）
 * - 如果指定了 provider 前缀，直接路由到对应 provider
 * - 如果没有前缀，自动查找支持该模型的 provider
 */
export class LLMGateway implements LLMProvider {
  readonly name = 'gateway';
  
  private providers = new Map<string, ProviderEntry>();

  constructor(private config: GatewayConfig = DEFAULT_CONFIG) {}

  /**
   * 注册 Provider
   * @param name - Provider 名称
   * @param provider - Provider 实例
   * @param models - 支持的模型列表（不带 provider 前缀）
   * @param priority - 优先级（越小越优先）
   */
  registerProvider(
    name: string,
    provider: LLMProvider,
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
    const { providerName, modelName } = this.parseModel(model);
    const entry = this.providers.get(providerName);

    if (!entry) {
      throw new Error(`未找到 Provider: ${providerName}`);
    }

    try {
      return await entry.provider.chat(messages, tools, modelName);
    } catch (error) {
      log.error('Provider {name} 失败: {error}', { name: providerName, error: error instanceof Error ? error.message : String(error) });
      if (this.config.fallbackEnabled) {
        return this.fallback(messages, tools, modelName, providerName);
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

    // 没有其他 provider 可用
    if (sorted.length === 0) {
      throw new Error(`Provider "${failedProvider}" 请求失败，且没有其他可用 Provider`);
    }

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
   * 解析模型名称
   * @param model - 模型名称，格式为 `provider/model` 或 `model`
   * @returns provider 名称和模型名称
   */
  private parseModel(model?: string): { providerName: string; modelName: string | undefined } {
    if (!model) {
      return { providerName: this.config.defaultProvider, modelName: undefined };
    }

    // 检查是否包含 provider 前缀
    const slashIndex = model.indexOf('/');
    if (slashIndex > 0) {
      const providerName = model.slice(0, slashIndex);
      const modelName = model.slice(slashIndex + 1);
      return { providerName, modelName: modelName || undefined };
    }

    // 没有 provider 前缀，自动查找
    for (const [name, entry] of this.providers) {
      if (entry.models.includes(model) || entry.models.includes('*')) {
        return { providerName: name, modelName: model };
      }
    }

    return { providerName: this.config.defaultProvider, modelName: model };
  }

  /**
   * 查找支持指定模型的 Provider（向后兼容）
   */
  private findProvider(model?: string): string {
    const { providerName } = this.parseModel(model);
    return providerName;
  }

  getDefaultModel(): string {
    const entry = this.providers.get(this.config.defaultProvider);
    const model = entry?.provider.getDefaultModel() ?? 'qwen3';
    return `${this.config.defaultProvider}/${model}`;
  }

  async isAvailable(): Promise<boolean> {
    for (const entry of this.providers.values()) {
      if (await entry.provider.isAvailable()) return true;
    }
    return false;
  }
}