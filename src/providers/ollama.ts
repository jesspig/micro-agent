import type { ILLMProvider, LLMMessage, LLMResponse, LLMToolDefinition, OpenAIResponse } from './base';
import { parseOpenAIResponse } from './base';

/** Ollama 配置 */
export interface OllamaConfig {
  baseUrl: string;
  defaultModel: string;
}

const DEFAULT_CONFIG: OllamaConfig = {
  baseUrl: 'http://localhost:11434/v1',
  defaultModel: 'qwen3',
};

/**
 * Ollama Provider
 * 
 * 通过 OpenAI 兼容 API 连接本地 Ollama。
 */
export class OllamaProvider implements ILLMProvider {
  readonly name = 'ollama';

  constructor(private config: OllamaConfig = DEFAULT_CONFIG) {}

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
      throw new Error(`Ollama API 错误: ${response.status}`);
    }

    const data = await response.json() as OpenAIResponse;
    return parseOpenAIResponse(data);
  }

  getDefaultModel(): string {
    return this.config.defaultModel;
  }

  async isAvailable(): Promise<boolean> {
    try {
      // Ollama 原生 API 端点
      const baseUrl = this.config.baseUrl.replace('/v1', '');
      const response = await fetch(`${baseUrl}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}
