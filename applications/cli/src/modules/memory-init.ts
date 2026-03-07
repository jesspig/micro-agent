/**
 * 记忆系统初始化模块
 *
 * 为 Agent Service 准备记忆系统配置数据。
 * 此模块仅负责准备配置数据，不负责实际初始化。
 */

import type { Config, ProviderEntry } from '@micro-agent/sdk';
import { expandPath } from '@micro-agent/sdk';
import { resolve } from 'path';
import { homedir } from 'os';

/**
 * 记忆系统配置接口
 *
 * 包含 Agent Service 初始化记忆系统所需的完整配置信息
 */
export interface MemorySystemConfig {
  /** 是否启用记忆系统 */
  enabled: boolean;
  /** 检索模式：向量检索、全文检索或混合检索 */
  mode: 'vector' | 'fulltext' | 'hybrid';
  /** 嵌入模型 ID（格式：provider/model） */
  embedModel?: string;
  /** 记忆存储路径（已展开） */
  storagePath: string;
  /** 是否启用自动摘要 */
  autoSummarize: boolean;
  /** 触发摘要的消息阈值 */
  summarizeThreshold: number;
  /** 空闲超时时间（毫秒） */
  idleTimeout: number;
  /** 短期记忆保留天数 */
  shortTermRetentionDays: number;
  /** 检索结果数量限制 */
  searchLimit: number;
  /** 多嵌入模型配置 */
  multiEmbed?: {
    enabled: boolean;
    maxModels: number;
    autoMigrate: boolean;
    batchSize: number;
    migrateInterval: number;
  };
}

/**
 * 嵌入模型信息
 */
export interface EmbeddingModelInfo {
  /** Provider 名称 */
  provider: string;
  /** 模型 ID */
  model: string;
  /** API 基础 URL */
  baseUrl?: string;
  /** API 密钥 */
  apiKey?: string;
}

/**
 * 获取记忆系统配置
 *
 * 从应用配置中提取记忆系统相关配置，并转换为 Agent Service 所需格式。
 * 会自动展开路径中的 ~ 前缀。
 *
 * @param config - 应用配置
 * @returns 记忆系统配置
 */
export function getMemorySystemConfig(config: Config): MemorySystemConfig {
  const memoryConfig = config.agents.memory;
  const embedModel = config.agents.models?.embed;

  // 确定检索模式
  const mode = determineSearchMode(embedModel);

  // 展开存储路径
  const storagePath = memoryConfig?.storagePath
    ? expandPath(memoryConfig.storagePath)
    : resolve(homedir(), '.micro-agent/memory');

  return {
    enabled: memoryConfig?.enabled ?? true,
    mode,
    embedModel: embedModel,
    storagePath,
    autoSummarize: memoryConfig?.autoSummarize ?? true,
    summarizeThreshold: memoryConfig?.summarizeThreshold ?? 20,
    idleTimeout: memoryConfig?.idleTimeout ?? 300000,
    shortTermRetentionDays: memoryConfig?.shortTermRetentionDays ?? 7,
    searchLimit: memoryConfig?.searchLimit ?? 10,
    multiEmbed: memoryConfig?.multiEmbed ? {
      enabled: memoryConfig.multiEmbed.enabled ?? true,
      maxModels: memoryConfig.multiEmbed.maxModels ?? 3,
      autoMigrate: memoryConfig.multiEmbed.autoMigrate ?? true,
      batchSize: memoryConfig.multiEmbed.batchSize ?? 50,
      migrateInterval: memoryConfig.multiEmbed.migrateInterval ?? 0,
    } : undefined,
  };
}

/**
 * 获取嵌入模型信息
 *
 * 解析嵌入模型配置，返回 Provider 和模型信息。
 * 支持两种格式：
 * - `provider/model` - 完整格式
 * - `model` - 仅模型 ID，使用第一个 Provider
 *
 * @param config - 应用配置
 * @returns 嵌入模型信息，未配置嵌入模型则返回 null
 */
export function getEmbeddingModelInfo(config: Config): EmbeddingModelInfo | null {
  const embedModel = config.agents.models?.embed;

  if (!embedModel) {
    return null;
  }

  // 解析 Provider 和模型名称
  const { providerName, modelId } = parseEmbedModelId(embedModel, config);

  // 获取 Provider 配置
  const providerConfig = config.providers[providerName] as ProviderEntry | undefined;

  return {
    provider: providerName,
    model: modelId,
    baseUrl: providerConfig?.baseUrl,
    apiKey: providerConfig?.apiKey,
  };
}

/**
 * 检查记忆系统是否启用
 *
 * @param config - 应用配置
 * @returns 记忆系统是否启用
 */
export function isMemoryEnabled(config: Config): boolean {
  return config.agents.memory?.enabled ?? true;
}

/**
 * 检查向量检索是否可用
 *
 * 向量检索需要配置嵌入模型且 Provider 配置有效。
 *
 * @param config - 应用配置
 * @returns 是否可用向量检索
 */
export function isVectorSearchAvailable(config: Config): boolean {
  const embedModel = config.agents.models?.embed;

  if (!embedModel) {
    return false;
  }

  const modelInfo = getEmbeddingModelInfo(config);

  // 需要有有效的 baseUrl 才能进行向量检索
  return modelInfo?.baseUrl !== undefined;
}

/**
 * 获取检索模式描述
 *
 * 用于启动信息显示。
 *
 * @param config - 应用配置
 * @returns 检索模式描述
 */
export function getSearchModeDescription(config: Config): string {
  const memoryConfig = getMemorySystemConfig(config);

  switch (memoryConfig.mode) {
    case 'vector':
      return `向量检索 (${memoryConfig.embedModel})`;
    case 'hybrid':
      return `混合检索 (${memoryConfig.embedModel})`;
    case 'fulltext':
    default:
      return '全文检索';
  }
}

// ============================================================
// 内部辅助函数
// ============================================================

/**
 * 确定检索模式
 *
 * 根据嵌入模型配置确定使用哪种检索模式：
 * - 有嵌入模型且有有效 Provider：向量检索
 * - 无嵌入模型：全文检索
 *
 * @param embedModel - 嵌入模型 ID
 * @returns 检索模式
 */
function determineSearchMode(embedModel?: string): 'vector' | 'fulltext' | 'hybrid' {
  // 有嵌入模型配置时使用向量检索
  // 实际运行时会根据 Provider 配置的有效性决定是否降级为全文检索
  if (embedModel) {
    return 'vector';
  }
  return 'fulltext';
}

/**
 * 解析嵌入模型 ID
 *
 * 支持 `provider/model` 和 `model` 两种格式。
 *
 * @param embedModel - 嵌入模型 ID
 * @param config - 应用配置
 * @returns Provider 名称和模型 ID
 */
function parseEmbedModelId(
  embedModel: string,
  config: Config
): { providerName: string; modelId: string } {
  const slashIndex = embedModel.indexOf('/');

  // provider/model 格式
  if (slashIndex > 0) {
    return {
      providerName: embedModel.slice(0, slashIndex),
      modelId: embedModel.slice(slashIndex + 1),
    };
  }

  // 仅模型 ID，使用第一个 Provider
  const providerNames = Object.keys(config.providers);
  const defaultProvider = providerNames[0] || 'unknown';

  return {
    providerName: defaultProvider,
    modelId: embedModel,
  };
}
