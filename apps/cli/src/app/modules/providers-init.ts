/**
 * Provider 初始化模块
 *
 * 负责初始化 LLM Provider
 */

import type { OpenAICompatibleProvider, LLMGateway, Config, ModelConfig as SDKModelConfig } from '@micro-agent/sdk';
import { OpenAICompatibleProvider as OpenAICompatibleProviderImpl } from '@micro-agent/sdk';
import { parseModelConfigs, type ModelConfig } from '@micro-agent/config';
import type { ProviderEntry } from '@micro-agent/types';

/**
 * 初始化所有 Provider
 */
export function initProviders(
  config: Config,
  llmGateway: LLMGateway
): Map<string, SDKModelConfig[]> {
  const providers = config.providers as Record<string, ProviderEntry | undefined>;
  const { defaultProviderName, defaultModelId } = parseDefaultModelInfo(config);
  const availableModels = new Map<string, SDKModelConfig[]>();

  for (const [name, providerConfig] of Object.entries(providers)) {
    if (!providerConfig) continue;

    registerProvider(name, providerConfig, defaultProviderName, defaultModelId, llmGateway, availableModels);
  }

  return availableModels;
}

/**
 * 解析默认模型信息
 */
function parseDefaultModelInfo(config: Config): { defaultProviderName: string | null; defaultModelId: string } {
  const chatModel = config.agents.models?.chat || '';
  const slashIndex = chatModel.indexOf('/');

  return {
    defaultProviderName: slashIndex > 0 ? chatModel.slice(0, slashIndex) : null,
    defaultModelId: slashIndex > 0 ? chatModel.slice(slashIndex + 1) : chatModel,
  };
}

/**
 * 注册单个 Provider
 */
function registerProvider(
  name: string,
  config: ProviderEntry,
  defaultProviderName: string | null,
  defaultModelId: string,
  llmGateway: LLMGateway,
  availableModels: Map<string, ModelConfig[]>
): void {
  const modelIds = config.models ?? [];
  const modelConfigs = parseModelConfigs(modelIds);

  if (modelConfigs.length > 0) {
    availableModels.set(name, modelConfigs);
  }

  const provider = createOpenAIProvider(config, defaultModelId, modelConfigs);
  const priority = name === defaultProviderName ? 1 : 100;

  llmGateway.registerProvider(
    name,
    provider,
    modelIds.length > 0 ? modelIds : ['*'],
    priority,
    modelConfigs
  );
}

/**
 * 创建 OpenAI 兼容的 Provider
 */
function createOpenAIProvider(
  config: ProviderEntry,
  defaultModelId: string,
  modelConfigs: ModelConfig[]
): OpenAICompatibleProvider {
  return new OpenAICompatibleProviderImpl({
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    defaultModel: modelConfigs[0]?.id ?? defaultModelId,
    modelConfigs,
  });
}