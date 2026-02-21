/**
 * OpenAI Compatible Provider
 */

import type { LLMProvider, LLMMessage, LLMResponse, LLMToolDefinition, OpenAIResponse, GenerationConfig } from './base';
import { parseOpenAIResponse, toOpenAIMessages } from './base';
import type { ModelConfig } from '@microbot/config';
import { getLogger } from '@logtape/logtape';

const log = getLogger(['provider', 'openai']);

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
  level: 'medium',
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
    const genConfig = { ...this.generationConfig, ...config };
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    const body: Record<string, unknown> = {
      model: modelName,
      messages: toOpenAIMessages(messages),
    };

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
    if (genConfig.topK !== undefined) {
      body.top_k = genConfig.topK;
    }

    log.debug('tools 参数: {count} 个, 模型能力 tool: {tool}', { 
      count: tools?.length ?? 0, 
      tool: capabilities.tool 
    });
    
    if (capabilities.tool && tools?.length) {
      body.tools = tools;
      body.tool_choice = 'auto';
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
    return true;
  }

  getModelCapabilities(modelId: string): ModelConfig {
    const found = this.modelConfigs.find(m => m.id === modelId);
    if (found) return found;
    return { ...DEFAULT_CAPABILITIES, id: modelId };
  }

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

      if (!response.ok) return null;

      const data = await response.json() as { data?: Array<{ id: string }> };
      if (!data.data || !Array.isArray(data.data)) return null;

      return data.data.map(m => m.id);
    } catch {
      return null;
    }
  }
}
