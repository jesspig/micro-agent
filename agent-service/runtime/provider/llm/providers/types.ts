/**
 * Provider 厂商特定类型定义
 */

import type { LLMResponse } from '../../../../types/message';
import type { GenerationConfig, ProviderVendor } from '../../../../types/provider';

// 重新导出 ProviderVendor
export type { ProviderVendor } from '../../../../types/provider';

/** 基础 Provider 配置 */
export interface BaseProviderConfig {
  /** API Key */
  apiKey?: string;
  /** API 基础 URL */
  baseUrl: string;
  /** 默认生成配置 */
  defaultGenerationConfig?: GenerationConfig;
  /** 厂商类型 */
  vendor?: ProviderVendor;
}

/** 通用 LLM 配置（用于工厂函数） */
export interface LLMConfig extends BaseProviderConfig {
  vendor?: ProviderVendor;
  /** DeepSeek 专用：默认启用思考 */
  defaultThinking?: boolean;
  /** GLM 专用：默认启用 CoT */
  defaultEnableCot?: boolean;
  /** Kimi 专用：默认启用推理 */
  defaultReasoning?: boolean;
  /** MiniMax 专用：Group ID */
  groupId?: string;
}

/** OpenAI Provider 配置 */
export interface OpenAIConfig extends BaseProviderConfig {
  vendor: 'openai';
}

/** DeepSeek Provider 配置 */
export interface DeepSeekConfig extends BaseProviderConfig {
  vendor: 'deepseek';
  /** 默认启用思考模式 */
  defaultThinking?: boolean;
}

/** GLM (智谱) Provider 配置 */
export interface GLMConfig extends BaseProviderConfig {
  vendor: 'glm';
  /** 默认启用思维链 */
  defaultEnableCot?: boolean;
}

/** Kimi (Moonshot) Provider 配置 */
export interface KimiConfig extends BaseProviderConfig {
  vendor: 'kimi';
  /** 默认启用推理 */
  defaultReasoning?: boolean;
}

/** MiniMax Provider 配置 */
export interface MiniMaxConfig extends BaseProviderConfig {
  vendor: 'minimax';
  /** Group ID (MiniMax 特有) */
  groupId?: string;
}

/** Ollama Provider 配置 */
export interface OllamaConfig extends BaseProviderConfig {
  vendor: 'ollama';
}

/** OpenAI 兼容 Provider 配置 */
export interface OpenAICompatibleConfig extends BaseProviderConfig {
  vendor: 'openai-compatible';
}

/** 所有 Provider 配置的联合类型 */
export type ProviderConfig = 
  | OpenAIConfig 
  | DeepSeekConfig 
  | GLMConfig 
  | KimiConfig 
  | MiniMaxConfig 
  | OllamaConfig 
  | OpenAICompatibleConfig;

/** API 响应中的消息 */
export interface APIResponseMessage {
  role: string;
  content: string | null;
  /** DeepSeek: 思考内容 */
  reasoning_content?: string;
  /** Kimi/OpenRouter: 思考详情 */
  reasoning_details?: Array<{ type: string; text: string }>;
  /** GLM: 思考内容 */
  reasoning?: string;
  /** 工具调用 */
  tool_calls?: Array<{
    id: string;
    type: string;
    function: {
      name: string;
      arguments: string;
    };
  }>;
}

/** API 响应中的选择 */
export interface APIResponseChoice {
  index: number;
  message: APIResponseMessage;
  finish_reason: string | null;
  delta?: {
    role?: string;
    content?: string;
    reasoning_content?: string;
    reasoning_details?: Array<{ type: string; text: string }>;
    tool_calls?: Array<{
      id: string;
      type: string;
      function: { name: string; arguments: string };
    }>;
  };
}

/** API 响应格式 */
export interface APIResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: APIResponseChoice[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    prompt_cache_hit_tokens?: number;
    prompt_cache_miss_tokens?: number;
    completion_tokens_details?: {
      reasoning_tokens?: number;
    };
  };
}

/** 各厂商的默认 baseUrl（不包含默认模型，模型必须显式配置） */
export const VENDOR_DEFAULTS: Record<ProviderVendor, { baseUrl: string }> = {
  openai: {
    baseUrl: 'https://api.openai.com/v1',
  },
  deepseek: {
    baseUrl: 'https://api.deepseek.com/v1',
  },
  glm: {
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
  },
  kimi: {
    baseUrl: 'https://api.moonshot.cn/v1',
  },
  minimax: {
    baseUrl: 'https://api.minimax.chat/v1',
  },
  ollama: {
    baseUrl: 'http://localhost:11434/v1',
  },
  'openai-compatible': {
    baseUrl: 'http://localhost:8000/v1',
  },
};

/** 思考模型列表 */
export const THINKING_MODELS: Record<ProviderVendor, string[]> = {
  openai: ['o1', 'o1-mini', 'o1-preview', 'o3', 'o3-mini'],
  deepseek: ['deepseek-reasoner', 'deepseek-r1'],
  glm: ['glm-4-plus', 'glm-5'],
  kimi: ['kimi-k2', 'kimi-k2.5'],
  minimax: ['m2.1', 'm2.5'],
  ollama: ['deepseek-r1', 'qwen3'],
  'openai-compatible': [],
};

/** 检查模型是否支持思考模式 */
export function supportsThinking(vendor: ProviderVendor, model: string): boolean {
  const models = THINKING_MODELS[vendor];
  return models.some(m => model.toLowerCase().includes(m.toLowerCase()));
}
