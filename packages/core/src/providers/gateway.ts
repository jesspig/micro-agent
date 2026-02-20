/**
 * LLM Gateway - 聚合多个 Provider，支持自动路由和故障转移
 */

import type { LLMProvider, LLMMessage, LLMResponse, LLMToolDefinition, GenerationConfig } from './base';
import type { ModelConfig } from '../config/schema';
import { getLogger } from '@logtape/logtape';

const log = getLogger(['gateway']);

/** Provider 配置 */
interface ProviderEntry {
  provider: LLMProvider;
  models: string[];
  modelConfigs: ModelConfig[];
  priority: number;
}

/** Gateway 配置 */
export interface GatewayConfig {
  defaultProvider: string;
  fallbackEnabled: boolean;
}

/** 故障转移参数 */
interface FallbackParams {
  messages: LLMMessage[];
  tools?: LLMToolDefinition[];
  failedModel?: string;
  failedProvider: string;
  config?: GenerationConfig;
}

/** 同一 Provider 尝试参数 */
interface SameProviderParams {
  entry: ProviderEntry;
  providerName: string;
  failedModel?: string;
  availableModels: string[];
  messages: LLMMessage[];
  tools?: LLMToolDefinition[];
  config?: GenerationConfig;
}

/** 模型尝试参数 */
interface TryModelParams {
  entry: ProviderEntry;
  providerName: string;
  modelId: string;
  messages: LLMMessage[];
  tools?: LLMToolDefinition[];
  config?: GenerationConfig;
}

const DEFAULT_CONFIG: GatewayConfig = {
  defaultProvider: 'ollama',
  fallbackEnabled: true,
};

/**
 * LLM Gateway
 */
export class LLMGateway implements LLMProvider {
  readonly name = 'gateway';
  private providers = new Map<string, ProviderEntry>();

  constructor(private config: GatewayConfig = DEFAULT_CONFIG) {}

  registerProvider(
    name: string,
    provider: LLMProvider,
    models: string[],
    priority: number = 100,
    modelConfigs: ModelConfig[] = []
  ): void {
    this.providers.set(name, { provider, models, modelConfigs, priority });
  }

  getProviderNames(): string[] {
    return Array.from(this.providers.keys());
  }

  async chat(
    messages: LLMMessage[],
    tools?: LLMToolDefinition[],
    model?: string,
    config?: GenerationConfig
  ): Promise<LLMResponse> {
    const { providerName, modelName } = this.parseModel(model);
    const entry = this.providers.get(providerName);

    if (!entry) {
      throw new Error(`未找到 Provider: ${providerName}`);
    }

    const actualModel = modelName ?? entry.provider.getDefaultModel();

    try {
      const response = await entry.provider.chat(messages, tools, actualModel, config);
      return this.withMeta(response, providerName, actualModel);
    } catch (error) {
      log.error('Provider {name} 失败: {error}', { name: providerName, error: this.errorMsg(error) });

      if (this.config.fallbackEnabled) {
        log.info('尝试故障转移到其他 Provider...');
        return this.fallback({
          messages, tools, failedModel: actualModel, failedProvider: providerName, config
        });
      }
      throw error;
    }
  }

  private async fallback(params: FallbackParams): Promise<LLMResponse> {
    const { messages, tools, failedModel, failedProvider, config } = params;
    const entry = this.providers.get(failedProvider);

    if (entry) {
      const availableModels = await entry.provider.listModels();

      if (availableModels !== null) {
        const result = await this.trySameProvider({
          entry, providerName: failedProvider, failedModel, availableModels, messages, tools, config
        });
        if (result) return result;
      }
    }

    return this.tryOtherProviders(messages, tools, failedProvider, config);
  }

  private async trySameProvider(params: SameProviderParams): Promise<LLMResponse | null> {
    const { entry, providerName, failedModel, availableModels, messages, tools, config } = params;

    log.info('[Fallback] 提供商 {provider} 可用，尝试切换模型', { provider: providerName });

    // 尝试配置的其他模型
    const otherModels = entry.models.filter(m => m !== failedModel && m !== '*');
    for (const modelId of otherModels) {
      if (availableModels.length > 0 && !availableModels.includes(modelId)) continue;

      const result = await this.tryModel({ entry, providerName, modelId, messages, tools, config });
      if (result) return result;
    }

    // 尝试默认模型
    const defaultModel = entry.provider.getDefaultModel();
    if (defaultModel !== failedModel) {
      const result = await this.tryModel({ entry, providerName, modelId: defaultModel, messages, tools, config });
      if (result) return result;
    }

    log.warn('[Fallback] 提供商 {provider} 无其他可用模型', { provider: providerName });
    return null;
  }

  private async tryModel(params: TryModelParams): Promise<LLMResponse | null> {
    const { entry, providerName, modelId, messages, tools, config } = params;

    try {
      log.info('[Fallback] 尝试 {provider}/{model}', { provider: providerName, model: modelId });
      const response = await entry.provider.chat(messages, tools, modelId, config);
      log.info('[Fallback] 成功切换到模型 {provider}/{model}', { provider: providerName, model: modelId });
      return this.withMeta(response, providerName, modelId);
    } catch (err) {
      log.warn('[Fallback] 模型 {model} 失败: {error}', { model: modelId, error: this.errorMsg(err) });
      return null;
    }
  }

  private async tryOtherProviders(
    messages: LLMMessage[],
    tools: LLMToolDefinition[] | undefined,
    excludeProvider: string,
    config?: GenerationConfig
  ): Promise<LLMResponse> {
    const sorted = Array.from(this.providers.entries())
      .filter(([name]) => name !== excludeProvider)
      .sort((a, b) => a[1].priority - b[1].priority);

    if (sorted.length === 0) {
      throw new Error(`Provider "${excludeProvider}" 请求失败，且没有其他可用 Provider`);
    }

    const errors: string[] = [];

    for (const [name, entry] of sorted) {
      try {
        const model = entry.provider.getDefaultModel();
        log.info('[Fallback] 尝试 {provider}/{model}', { provider: name, model });
        const response = await entry.provider.chat(messages, tools, model, config);
        log.info('[Fallback] 成功切换到 {provider}', { provider: name });
        return this.withMeta(response, name, model);
      } catch (err) {
        errors.push(`${name}: ${this.errorMsg(err)}`);
        log.warn('[Fallback] {provider} 失败: {error}', { provider: name, error: this.errorMsg(err) });
      }
    }

    throw new Error(`所有 Provider 尝试失败:\n${errors.join('\n')}`);
  }

  private withMeta(response: LLMResponse, provider: string, model: string): LLMResponse {
    const modelConfig = this.getModelConfig(provider, model);
    return {
      ...response,
      usedProvider: provider,
      usedModel: model,
      usedLevel: modelConfig?.level,
    };
  }

  private getModelConfig(providerName: string, modelId: string): ModelConfig | undefined {
    const entry = this.providers.get(providerName);
    return entry?.modelConfigs.find(m => m.id === modelId);
  }

  private parseModel(model?: string): { providerName: string; modelName: string | undefined } {
    if (!model) {
      return { providerName: this.config.defaultProvider, modelName: undefined };
    }

    const slashIndex = model.indexOf('/');
    if (slashIndex > 0) {
      return {
        providerName: model.slice(0, slashIndex),
        modelName: model.slice(slashIndex + 1) || undefined,
      };
    }

    for (const [name, entry] of this.providers) {
      if (entry.models.includes(model) || entry.models.includes('*')) {
        return { providerName: name, modelName: model };
      }
    }

    return { providerName: this.config.defaultProvider, modelName: model };
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

  getModelCapabilities(modelId: string): ModelConfig {
    const { providerName, modelName } = this.parseModel(modelId);
    const entry = this.providers.get(providerName);

    if (!entry) {
      return { id: modelName ?? modelId, vision: false, think: false, tool: true };
    }

    return entry.provider.getModelCapabilities(modelName ?? modelId);
  }

  private errorMsg(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
