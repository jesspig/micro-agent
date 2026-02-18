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

const DEFAULT_CONFIG: GatewayConfig = {
  defaultProvider: 'ollama',
  fallbackEnabled: true,
};

/**
 * LLM Gateway
 * 
 * 聚合多个 Provider，支持自动路由和故障转移。
 * 
 * 模型名称格式：`provider/model`（如 `openai-compatible/gpt-4o`）
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
   * @param modelConfigs - 模型配置列表（包含 level 等信息）
   */
  registerProvider(
    name: string,
    provider: LLMProvider,
    models: string[],
    priority: number = 100,
    modelConfigs: ModelConfig[] = []
  ): void {
    this.providers.set(name, { provider, models, modelConfigs, priority });
  }

  /**
   * 获取已注册的 Provider 名称列表
   */
  getProviderNames(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * 获取模型的配置（包括 level）
   */
  private getModelConfig(providerName: string, modelId: string): ModelConfig | undefined {
    const entry = this.providers.get(providerName);
    if (!entry) return undefined;
    return entry.modelConfigs.find(m => m.id === modelId);
  }

  /**
   * 聊天（自动路由到合适的 Provider）
   */
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

    const actualModelName = modelName ?? entry.provider.getDefaultModel();
    
    try {
      const response = await entry.provider.chat(messages, tools, actualModelName, config);
      const modelConfig = this.getModelConfig(providerName, actualModelName);
      // 标记实际使用的 provider、model 和 level
      return {
        ...response,
        usedProvider: providerName,
        usedModel: actualModelName,
        usedLevel: modelConfig?.level,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      log.error('Provider {name} 失败: {error}', { name: providerName, error: errorMsg });
      
      if (this.config.fallbackEnabled) {
        log.info('尝试故障转移到其他 Provider...');
        return this.fallback(messages, tools, actualModelName, providerName, config);
      }
      throw error;
    }
  }

  /**
   * 故障转移
   * 
   * 当首选模型失败时：
   * 1. 先检查提供商是否可用（调用 listModels）
   * 2. 如果提供商可用，优先切换同一提供商的其他模型
   * 3. 如果提供商不可用，才切换到其他提供商
   */
  private async fallback(
    messages: LLMMessage[],
    tools: LLMToolDefinition[] | undefined,
    failedModel: string | undefined,
    failedProvider: string,
    config?: GenerationConfig
  ): Promise<LLMResponse> {
    const entry = this.providers.get(failedProvider);
    
    // 尝试检查提供商是否可用
    if (entry) {
      const availableModels = await entry.provider.listModels();
      
      if (availableModels !== null) {
        // 提供商可用，尝试切换同一提供商的其他模型
        log.info('[Fallback] 提供商 {provider} 可用，尝试切换模型', { provider: failedProvider });
        
        // 过滤掉失败的模型，优先使用配置的其他模型
        const otherModels = entry.models.filter(m => m !== failedModel && m !== '*');
        
        for (const modelId of otherModels) {
          // 检查模型是否在可用列表中
          if (availableModels.length > 0 && !availableModels.includes(modelId)) {
            continue;
          }
          
          try {
            log.info('[Fallback] 尝试 {provider}/{model}', { provider: failedProvider, model: modelId });
            const response = await entry.provider.chat(messages, tools, modelId, config);
            const modelConfig = this.getModelConfig(failedProvider, modelId);
            log.info('[Fallback] 成功切换到模型 {provider}/{model}', { provider: failedProvider, model: modelId });
            return {
              ...response,
              usedProvider: failedProvider,
              usedModel: modelId,
              usedLevel: modelConfig?.level,
            };
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            log.warn('[Fallback] 模型 {model} 失败: {error}', { model: modelId, error: errorMsg });
            continue;
          }
        }
        
        // 同一提供商没有其他可用模型，使用默认模型
        const defaultModel = entry.provider.getDefaultModel();
        if (defaultModel !== failedModel) {
          try {
            log.info('[Fallback] 尝试默认模型 {provider}/{model}', { provider: failedProvider, model: defaultModel });
            const response = await entry.provider.chat(messages, tools, defaultModel, config);
            const modelConfig = this.getModelConfig(failedProvider, defaultModel);
            log.info('[Fallback] 成功切换到默认模型 {provider}/{model}', { provider: failedProvider, model: defaultModel });
            return {
              ...response,
              usedProvider: failedProvider,
              usedModel: defaultModel,
              usedLevel: modelConfig?.level,
            };
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            log.warn('[Fallback] 默认模型失败: {error}', { error: errorMsg });
          }
        }
        
        log.warn('[Fallback] 提供商 {provider} 无其他可用模型，尝试切换提供商', { provider: failedProvider });
      } else {
        log.info('[Fallback] 提供商 {provider} 不可用，尝试切换提供商', { provider: failedProvider });
      }
    }

    // 提供商不可用，尝试其他提供商
    return this.fallbackToOtherProvider(messages, tools, failedProvider, config);
  }

  /**
   * 切换到其他提供商
   */
  private async fallbackToOtherProvider(
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
        const fallbackModel = entry.provider.getDefaultModel();
        log.info('[Fallback] 尝试 {provider}/{model}', { provider: name, model: fallbackModel });
        
        const response = await entry.provider.chat(messages, tools, fallbackModel, config);
        const modelConfig = this.getModelConfig(name, fallbackModel);
        log.info('[Fallback] 成功切换到 {provider}', { provider: name });
        return {
          ...response,
          usedProvider: name,
          usedModel: fallbackModel,
          usedLevel: modelConfig?.level,
        };
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        errors.push(`${name}: ${errorMsg}`);
        log.warn('[Fallback] {provider} 失败: {error}', { provider: name, error: errorMsg });
        continue;
      }
    }

    throw new Error(`所有 Provider 尝试失败:\n${errors.join('\n')}`);
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

  /**
   * 获取模型能力配置
   * @param modelId - 模型名称，格式为 `provider/model` 或 `model`
   * @returns 模型能力配置
   */
  getModelCapabilities(modelId: string): ModelConfig {
    const { providerName, modelName } = this.parseModel(modelId);
    const entry = this.providers.get(providerName);

    if (!entry) {
      // 返回默认能力
      return { id: modelName ?? modelId, vision: false, think: false, tool: true };
    }

    return entry.provider.getModelCapabilities(modelName ?? modelId);
  }
}
