import type { ILLMProvider, LLMMessage, LLMResponse, LLMToolDefinition, OpenAIResponse } from './base';
import { parseOpenAIResponse } from './base';

/** LM Studio 配置 */
export interface LMStudioConfig {
  baseUrl: string;
  defaultModel: string;
}

const DEFAULT_CONFIG: LMStudioConfig = {
  baseUrl: 'http://localhost:1234/v1',
  defaultModel: 'local-model',
};

/**
 * LM Studio Provider
 * 
 * 通过 OpenAI 兼容 API 连接本地 LM Studio。
 */
export class LMStudioProvider implements ILLMProvider {
  readonly name = 'lm-studio';

  constructor(private config: LMStudioConfig = DEFAULT_CONFIG) {}

  async chat(
    messages: LLMMessage[],
    tools?: LLMToolDefinition[],
    model?: string
  ): Promise<LLMResponse> {
    const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model ?? this.config.defaultModel,
        messages,
        tools: tools?.length ? tools : undefined,
      }),
    });

    if (!response.ok) {
      throw new Error(`LM Studio API 错误: ${response.status}`);
    }

    const data = await response.json() as OpenAIResponse;
    return parseOpenAIResponse(data);
  }

  getDefaultModel(): string {
    return this.config.defaultModel;
  }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.baseUrl}/models`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}
