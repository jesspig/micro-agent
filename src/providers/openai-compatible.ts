import type { LLMProvider, LLMMessage, LLMResponse, LLMToolDefinition, OpenAIResponse } from './base';
import { parseOpenAIResponse } from './base';

/** OpenAI Compatible 配置 */
export interface OpenAICompatibleConfig {
  baseUrl: string;
  apiKey?: string;
  defaultModel: string;
}

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
export class OpenAICompatibleProvider implements LLMProvider {
  readonly name = 'openai-compatible';

  constructor(private config: OpenAICompatibleConfig) {}

  async chat(
    messages: LLMMessage[],
    tools?: LLMToolDefinition[],
    model?: string
  ): Promise<LLMResponse> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    // 本地服务（如 Ollama）无需 Authorization
    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: model ?? this.config.defaultModel,
        messages,
        tools: tools?.length ? tools : undefined,
      }),
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
}
