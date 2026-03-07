/**
 * Provider 初始化模块
 *
 * 为 Agent Service 准备 Provider 配置数据。
 * 此模块仅负责准备配置数据，不负责实际注册。
 */

import type { Config, ProviderEntry, ModelConfig } from '@micro-agent/sdk';
import { parseModelConfigs } from '@micro-agent/sdk';

/**
 * Provider 配置接口
 *
 * 包含 Provider 初始化所需的完整配置信息
 */
export interface ProviderConfig {
  /** Provider 名称 */
  name: string;
  /** API 基础 URL */
  baseUrl: string;
  /** API 密钥（可选） */
  apiKey?: string;
  /** 模型配置列表 */
  models: ModelConfig[];
  /** 优先级（数字越小优先级越高） */
  priority: number;
}

/**
 * 默认模型信息
 */
export interface DefaultModelInfo {
  /** 默认 Provider 名称 */
  providerName: string | null;
  /** 默认模型 ID */
  modelId: string;
}

/**
 * 解析默认模型信息
 *
 * 从配置中解析默认模型，支持 `provider/model` 格式。
 * 例如: `openai/gpt-4o` -> { providerName: 'openai', modelId: 'gpt-4o' }
 *
 * @param config - 应用配置
 * @returns 解析后的默认模型信息
 */
export function parseDefaultModelInfo(config: Config): DefaultModelInfo {
  const chatModel = config.agents.models?.chat || '';
  const slashIndex = chatModel.indexOf('/');

  // 支持 provider/model 格式
  if (slashIndex > 0) {
    return {
      providerName: chatModel.slice(0, slashIndex),
      modelId: chatModel.slice(slashIndex + 1),
    };
  }

  // 不带 provider 前缀的格式
  return {
    providerName: null,
    modelId: chatModel,
  };
}

/**
 * 获取 Provider 配置列表
 *
 * 从配置中读取所有 Provider 并转换为初始化所需的格式。
 * 包含名称、baseUrl、apiKey、模型列表和优先级。
 *
 * @param config - 应用配置
 * @returns Provider 配置数组，按优先级排序
 */
export function getProviderConfigs(config: Config): ProviderConfig[] {
  const providers = config.providers as Record<string, ProviderEntry | undefined>;
  const { providerName: defaultProviderName } = parseDefaultModelInfo(config);
  const result: ProviderConfig[] = [];

  for (const [name, providerConfig] of Object.entries(providers)) {
    if (!providerConfig) continue;

    const modelIds = providerConfig.models ?? [];
    const models = parseModelConfigs(modelIds);

    // 默认 Provider 优先级为 1，其他为 100
    const priority = name === defaultProviderName ? 1 : 100;

    result.push({
      name,
      baseUrl: providerConfig.baseUrl,
      apiKey: providerConfig.apiKey,
      models,
      priority,
    });
  }

  // 按优先级排序
  return result.sort((a, b) => a.priority - b.priority);
}

/**
 * 获取 Provider 数量统计
 *
 * @param config - 应用配置
 * @returns Provider 统计信息
 */
export function getProviderStats(config: Config): {
  total: number;
  hasDefault: boolean;
  totalModels: number;
} {
  const providers = getProviderConfigs(config);
  const { providerName } = parseDefaultModelInfo(config);

  return {
    total: providers.length,
    hasDefault: providerName !== null,
    totalModels: providers.reduce((sum, p) => sum + p.models.length, 0),
  };
}

/**
 * 获取指定 Provider 的配置
 *
 * @param config - 应用配置
 * @param name - Provider 名称
 * @returns Provider 配置，不存在则返回 undefined
 */
export function getProviderConfigByName(
  config: Config,
  name: string
): ProviderConfig | undefined {
  const providers = getProviderConfigs(config);
  return providers.find(p => p.name === name);
}

/**
 * 检查 Provider 配置是否有效
 *
 * 验证 Provider 配置的完整性：
 * - 必须有名称
 * - 必须有 baseUrl
 * - 如果有模型列表，必须非空
 *
 * @param provider - Provider 配置
 * @returns 是否有效
 */
export function isValidProviderConfig(provider: ProviderConfig): boolean {
  if (!provider.name || !provider.baseUrl) {
    return false;
  }

  // 模型列表可以为空（表示支持所有模型）
  return true;
}

/**
 * 过滤有效的 Provider 配置
 *
 * @param config - 应用配置
 * @returns 有效的 Provider 配置数组
 */
export function getValidProviderConfigs(config: Config): ProviderConfig[] {
  return getProviderConfigs(config).filter(isValidProviderConfig);
}

/**
 * 获取模型 ID 列表
 *
 * 从 Provider 配置中提取所有模型 ID
 *
 * @param provider - Provider 配置
 * @returns 模型 ID 数组
 */
export function getModelIds(provider: ProviderConfig): string[] {
  return provider.models.map(m => m.id);
}

/**
 * 格式化 Provider 显示名称
 *
 * 用于启动信息显示
 *
 * @param provider - Provider 配置
 * @returns 格式化后的显示字符串
 */
export function formatProviderDisplay(provider: ProviderConfig): string {
  const modelCount = provider.models.length;
  const modelInfo = modelCount > 0 ? `${modelCount} 个模型` : '所有模型';
  const priorityInfo = provider.priority === 1 ? ' (默认)' : '';

  return `${provider.name}${priorityInfo} - ${modelInfo}`;
}
