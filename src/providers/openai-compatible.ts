import type { ILLMProvider, LLMMessage, LLMResponse, LLMToolDefinition, OpenAIResponse } from './base';
import { parseOpenAIResponse } from './base';

/** OpenAI Compatible 配置 */
export interface OpenAICompatibleConfig {
  baseUrl: string;
  apiKey: string;
  defaultModel: string;
}

/**
 * OpenAI Compatible Provider
 * 
 * 支持所有 OpenAI 兼容的 API 服务：
 * - OpenAI
 * - DeepSeek
 * - Gemini
 * - OpenRouter
 * - Zhipu
 * - Moonshot
 * - MiniMax
 * 等
 */
export class OpenAICompatibleProvider implements ILLMProvider {
  readonly name = 'openai-compatible';

  constructor(private config: OpenAICompatibleConfig) {}

  async chat(
    messages: LLMMessage[],
    tools?: LLMToolDefinition[],
    model?: string
  ): Promise<LLMResponse> {
    const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
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
    // 云服务只需检查 API Key 是否配置
    return !!this.config.apiKey;
  }
}
