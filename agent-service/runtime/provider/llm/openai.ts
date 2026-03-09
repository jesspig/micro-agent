/**
 * LLM Provider 统一入口
 * 
 * 根据 vendor 配置自动选择合适的 Provider 实现
 */

import { getLogger } from '@logtape/logtape';
import type {
  LLMProvider,
  LLMMessage,
  LLMResponse,
  LLMToolDefinition,
  GenerationConfig,
  ProviderCapabilities,
} from '../../../types';

// 重新导出类型供外部使用
export type { LLMProvider } from '../../../types';

// 导出新的 Provider 系统
export {
  createProvider,
  detectVendor,
  getModelCapabilities,
  supportsThinking,
  type Provider,
  type LLMConfig,
  type OpenAIConfig,
  type DeepSeekConfig,
  type GLMConfig,
  type KimiConfig,
  type MiniMaxConfig,
  type OllamaConfig,
  type OpenAICompatibleConfig,
} from './providers';

import { createProvider, type Provider, type LLMConfig } from './providers';

const log = getLogger(['provider', 'llm']);

/**
 * LLM Provider 配置（兼容旧配置格式）
 */
export interface LLMProviderConfig {
  baseUrl: string;
  apiKey?: string;
  vendor?: LLMConfig['vendor'];
  /** 默认生成配置 */
  defaultGenerationConfig?: GenerationConfig;
  /** DeepSeek 专用：默认启用思考 */
  defaultEnableThinking?: boolean;
  /** GLM 专用：默认启用 CoT */
  defaultEnableCot?: boolean;
  /** Kimi 专用：默认启用推理 */
  defaultReasoning?: boolean;
  /** MiniMax 专用：Group ID */
  groupId?: string;
}

/**
 * LLM Provider 代理类
 * 
 * 包装具体 Provider 实现，提供统一接口
 */
class LLMProviderProxy implements LLMProvider {
  readonly name: string;
  readonly type = 'llm' as const;
  private provider: Provider;

  constructor(config: LLMProviderConfig) {
    // 转换配置格式
    const providerConfig: LLMConfig = {
      vendor: config.vendor,
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      defaultGenerationConfig: config.defaultGenerationConfig,
      defaultThinking: config.defaultEnableThinking,
      defaultEnableCot: config.defaultEnableCot,
      defaultReasoning: config.defaultReasoning,
      groupId: config.groupId,
    };

    this.provider = createProvider(providerConfig);
    this.name = this.provider.name;
    
    log.info('LLM Provider 已创建', { 
      vendor: this.name, 
      baseUrl: config.baseUrl,
    });
  }

  async chat(
    messages: LLMMessage[],
    tools?: LLMToolDefinition[],
    model?: string,
    config?: GenerationConfig
  ): Promise<LLMResponse> {
    return this.provider.chat(messages, tools, model, config);
  }

  getDefaultModel(): string | undefined {
    return this.provider.getDefaultModel();
  }

  async isAvailable(): Promise<boolean> {
    return this.provider.isAvailable();
  }

  getModelCapabilities(modelId: string): ProviderCapabilities {
    return this.provider.getModelCapabilities(modelId);
  }

  async listModels(): Promise<string[] | null> {
    return this.provider.listModels();
  }
}

/**
 * 创建 LLM Provider
 * 
 * 根据 vendor 配置自动选择合适的 Provider 实现
 */
export function createLLMProvider(config: LLMProviderConfig, name?: string): LLMProvider {
  const provider = new LLMProviderProxy(config);
  
  // 返回代理对象，保持接口一致性
  return {
    name: name ?? provider.name,
    type: 'llm',
    chat: provider.chat.bind(provider),
    getDefaultModel: provider.getDefaultModel.bind(provider),
    isAvailable: provider.isAvailable.bind(provider),
    getModelCapabilities: provider.getModelCapabilities.bind(provider),
    listModels: provider.listModels.bind(provider),
  };
}
