import type { ILLMProvider, LLMMessage, LLMResponse, LLMToolDefinition, OpenAIResponse } from './base';
import { parseOpenAIResponse } from './base';

/** vLLM 配置 */
export interface VLLMConfig {
  baseUrl: string;
  defaultModel: string;
  apiKey?: string;
}

/**
 * vLLM Provider
 * 
 * 通过 OpenAI 兼容 API 连接 vLLM 服务。
 */
export class VLLMProvider implements ILLMProvider {
  readonly name = 'vllm';

  constructor(private config: VLLMConfig) {}

  async chat(
    messages: LLMMessage[],
    tools?: LLMToolDefinition[],
    model?: string
  ): Promise<LLMResponse> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
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
      throw new Error(`vLLM API 错误: ${response.status}`);
    }

    const data = await response.json() as OpenAIResponse;
    return parseOpenAIResponse(data);
  }

  getDefaultModel(): string {
    return this.config.defaultModel;
  }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.baseUrl}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}
