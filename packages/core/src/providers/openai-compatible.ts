/**
 * OpenAI Compatible Provider
 * 
 * 支持所有 OpenAI 兼容的 API 服务：
 * - Ollama（本地，无需 apiKey）
 * - OpenAI
 * - DeepSeek
 * - Gemini
 * - OpenRouter
 * 等
 */
import type { LLMProvider, LLMMessage, LLMResponse, LLMToolDefinition, OpenAIResponse, GenerationConfig } from './base';
import { parseOpenAIResponse, toOpenAIMessages } from './base';
import type { ModelConfig } from '../config/schema';

/** OpenAI Compatible 配置 */
export interface OpenAICompatibleConfig {
  baseUrl: string;
  apiKey?: string;
  defaultModel: string;
  /** 模型能力配置列表 */
  modelConfigs?: ModelConfig[];
  /** 默认生成配置 */
  defaultGenerationConfig?: GenerationConfig;
}

/** 默认模型能力 */
const DEFAULT_CAPABILITIES: ModelConfig = {
  id: '',
  vision: false,
  think: false,
  tool: true,
};

/** 默认生成配置 */
const DEFAULT_GENERATION_CONFIG: GenerationConfig = {
  maxTokens: 8192,
  temperature: 0.7,
  topK: 50,
  topP: 0.7,
  frequencyPenalty: 0.5,
};

export class OpenAICompatibleProvider implements LLMProvider {
  readonly name = 'openai-compatible';
  private modelConfigs: ModelConfig[];
  private generationConfig: GenerationConfig;

  constructor(private config: OpenAICompatibleConfig) {
    this.modelConfigs = config.modelConfigs ?? [];
    this.generationConfig = { ...DEFAULT_GENERATION_CONFIG, ...config.defaultGenerationConfig };
  }

  async chat(
    messages: LLMMessage[],
    tools?: LLMToolDefinition[],
    model?: string,
    config?: GenerationConfig
  ): Promise<LLMResponse> {
    const modelName = model ?? this.config.defaultModel;
    const capabilities = this.getModelCapabilities(modelName);
    // 合并默认配置和请求配置
    const genConfig = { ...this.generationConfig, ...config };
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    // 本地服务（如 Ollama）无需 Authorization
    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    // 构建请求体
    const body: Record<string, unknown> = {
      model: modelName,
      messages: toOpenAIMessages(messages),
    };

    // 生成参数
    if (genConfig.maxTokens !== undefined) {
      body.max_tokens = genConfig.maxTokens;
    }
    if (genConfig.temperature !== undefined) {
      body.temperature = genConfig.temperature;
    }
    if (genConfig.topP !== undefined) {
      body.top_p = genConfig.topP;
    }
    if (genConfig.frequencyPenalty !== undefined) {
      body.frequency_penalty = genConfig.frequencyPenalty;
    }
    // top_k 不是 OpenAI 标准参数，但部分兼容 API 支持
    if (genConfig.topK !== undefined) {
      body.top_k = genConfig.topK;
    }

    // 仅当模型支持工具调用且有工具时才发送
    if (capabilities.tool && tools?.length) {
      body.tools = tools;
    }

    const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API 错误 (${response.status}): ${errorText}`);
    }

    const data = await response.json() as OpenAIResponse;
    return parseOpenAIResponse(data);
  }

  getDefaultModel(): string {
    return this.config.defaultModel;
  }

  async isAvailable(): Promise<boolean> {
    // 总是可用（本地服务无需 apiKey）
    return true;
  }

  getModelCapabilities(modelId: string): ModelConfig {
    const found = this.modelConfigs.find(m => m.id === modelId);
    if (found) return found;
    
    // 返回默认能力配置
    return { ...DEFAULT_CAPABILITIES, id: modelId };
  }

  /**
   * 获取提供商支持的模型列表
   * 调用 OpenAI 兼容的 /models 端点
   * @returns 模型 ID 列表，失败返回 null
   */
  async listModels(): Promise<string[] | null> {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      
      if (this.config.apiKey) {
        headers['Authorization'] = `Bearer ${this.config.apiKey}`;
      }

      const response = await fetch(`${this.config.baseUrl}/models`, {
        method: 'GET',
        headers,
      });

      if (!response.ok) {
        return null;
      }

      const data = await response.json() as { data?: Array<{ id: string }> };
      if (!data.data || !Array.isArray(data.data)) {
        return null;
      }

      return data.data.map(m => m.id);
    } catch {
      return null;
    }
  }
}
