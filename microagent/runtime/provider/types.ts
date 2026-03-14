import type { ProviderSpec } from "../types.js";

/**
 * Provider 能力描述
 */
export interface ProviderCapabilities {
  /** 是否支持流式输出 */
  supportsStreaming: boolean;
  /** 是否支持视觉能力 */
  supportsVision: boolean;
  /** 是否支持提示词缓存 */
  supportsPromptCaching: boolean;
  /** 最大上下文 token 数 */
  maxContextTokens: number;
  /** 工具 Schema 模式 */
  toolSchemaMode: "native" | "openai-functions" | "anthropic";
}

/**
 * Provider 配置
 */
export interface ProviderConfig {
  /** Provider 唯一标识 */
  id: string;
  /** Provider 名称 */
  name: string;
  /** API 基础 URL */
  baseUrl: string;
  /** API 密钥 */
  apiKey: string;
  /** 支持的模型列表 */
  models: string[];
  /** 可选的能力覆盖 */
  capabilities?: Partial<ProviderCapabilities>;
}

/**
 * Provider 运行状态
 */
export interface ProviderStatus {
  /** Provider 名称 */
  name: string;
  /** 是否可用 */
  available: boolean;
  /** 可用模型列表 */
  models: string[];
  /** 最后使用时间戳 */
  lastUsed?: number;
  /** 错误计数 */
  errorCount: number;
}

/**
 * Provider 规格信息（扩展自基础类型）
 */
export interface ProviderSpecExtended extends ProviderSpec {
  /** 默认能力 */
  defaultCapabilities?: Partial<ProviderCapabilities>;
}
