/**
 * 基础 Provider 实现
 * 
 * 提供通用的 HTTP 请求和响应解析功能
 */

import { getLogger } from '../../../infrastructure/logging/logger';
import type { LLMMessage, LLMResponse } from '../../../../types/message';
import type { LLMToolDefinition, ToolCall } from '../../../../types/tool';
import type { GenerationConfig, ProviderCapabilities, LLMProvider } from '../../../../types/provider';
import type { BaseProviderConfig, APIResponse, ProviderVendor } from './types';

const log = getLogger('provider.base');

/** 默认生成配置 */
const DEFAULT_GENERATION_CONFIG: GenerationConfig = {
  temperature: 0.7,
  topP: 0.95,
  maxTokens: 4096,
};

/**
 * 将 LLMMessage 转换为 OpenAI 格式消息
 */
export function toOpenAIMessages(messages: LLMMessage[]): Array<Record<string, unknown>> {
  return messages.map(msg => {
    const result: Record<string, unknown> = {
      role: msg.role,
    };

    // 处理内容
    if (typeof msg.content === 'string') {
      result.content = msg.content;
    } else if (Array.isArray(msg.content)) {
      // 多模态内容
      result.content = msg.content.map(part => {
        if (part.type === 'text') {
          return { type: 'text', text: part.text };
        }
        if (part.type === 'image') {
          return {
            type: 'image_url',
            image_url: { url: `data:${part.mimeType};base64,${part.data}` },
          };
        }
        if (part.type === 'image_url') {
          return part;
        }
        return { type: 'text', text: JSON.stringify(part) };
      });
    }

    // 处理工具调用 ID
    if (msg.toolCallId) {
      result.tool_call_id = msg.toolCallId;
    }

    // 处理工具调用
    if (msg.toolCalls?.length) {
      result.tool_calls = msg.toolCalls.map(tc => ({
        id: tc.id,
        type: 'function',
        function: {
          name: tc.name,
          arguments: JSON.stringify(tc.arguments),
        },
      }));
    }

    return result;
  });
}

/**
 * 将工具定义转换为 OpenAI 格式
 * 
 * LLMToolDefinition 已经是 OpenAI 格式 { type: 'function', function: { name, description, parameters } }
 */
export function toOpenAITools(tools?: LLMToolDefinition[]): LLMToolDefinition[] | undefined {
  if (!tools?.length) return undefined;
  // LLMToolDefinition 已经是正确的格式，直接返回
  return tools;
}

/**
 * 解析 API 响应为 LLMResponse
 */
export function parseAPIResponse(
  data: unknown,
  _vendor: ProviderVendor
): LLMResponse {
  if (!data || typeof data !== 'object') {
    log.warn('LLM 响应数据无效', { dataType: typeof data });
    return { content: '', hasToolCalls: false };
  }

  const response = data as APIResponse;
  const choice = response.choices?.[0];
  
  if (!choice) {
    log.warn('LLM choices 数组为空');
    return { content: '', hasToolCalls: false };
  }

  const message = choice.message;
  const content = message?.content || '';
  
  // 解析推理内容（不同厂商字段名不同）
  let reasoning: string | undefined;
  if (message?.reasoning_content) {
    // DeepSeek 格式
    reasoning = message.reasoning_content;
  } else if (message?.reasoning_details) {
    // Kimi/OpenRouter 格式
    reasoning = message.reasoning_details
      .map(d => d.text)
      .filter(Boolean)
      .join('');
  } else if (message?.reasoning) {
    // GLM 格式
    reasoning = message.reasoning;
  }

  // 解析工具调用
  const toolCalls: ToolCall[] | undefined = message?.tool_calls?.map(tc => ({
    id: tc.id,
    name: tc.function.name,
    arguments: JSON.parse(tc.function.arguments),
  }));

  return {
    content,
    reasoning,
    toolCalls,
    hasToolCalls: !!toolCalls?.length,
    usage: response.usage ? {
      promptTokens: response.usage.prompt_tokens,
      completionTokens: response.usage.completion_tokens,
      totalTokens: response.usage.total_tokens,
      cacheWriteTokens: response.usage.prompt_cache_miss_tokens,
      cacheReadTokens: response.usage.prompt_cache_hit_tokens,
    } : undefined,
  };
}

/**
 * 基础 Provider 抽象类
 */
export abstract class BaseProvider implements LLMProvider {
  readonly type = 'llm' as const;
  abstract readonly name: string;
  
  protected config: BaseProviderConfig;
  protected generationConfig: GenerationConfig;

  constructor(config: BaseProviderConfig) {
    this.config = config;
    this.generationConfig = { ...DEFAULT_GENERATION_CONFIG, ...config.defaultGenerationConfig };
  }

  abstract chat(
    messages: LLMMessage[],
    tools?: LLMToolDefinition[],
    model?: string,
    config?: GenerationConfig
  ): Promise<LLMResponse>;

  getDefaultModel(): string | undefined {
    return undefined;
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }

  getModelCapabilities(_modelId: string): ProviderCapabilities {
    return { vision: false, think: false, tool: true };
  }

  async listModels(): Promise<string[] | null> {
    return null;
  }

  /**
   * 发送 HTTP 请求
   */
  protected async sendRequest(
    body: Record<string, unknown>,
    model: string
  ): Promise<unknown> {
    const url = `${this.config.baseUrl}/chat/completions`;
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    // 记录请求
    log.info('LLM 请求', {
      provider: this.name,
      model,
      messageCount: (body.messages as unknown[])?.length ?? 0,
      toolCount: (body.tools as unknown[])?.length ?? 0,
    });

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API 错误 (${response.status}): ${errorText.slice(0, 500)}`);
    }

    return response.json();
  }

  /**
   * 构建请求体（子类可覆盖添加特定参数）
   */
  protected buildRequestBody(
    messages: LLMMessage[],
    tools: LLMToolDefinition[] | undefined,
    model: string,
    config: GenerationConfig | undefined
  ): Record<string, unknown> {
    const genConfig = { ...this.generationConfig, ...config };
    
    const body: Record<string, unknown> = {
      model,
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
    if (genConfig.topK !== undefined) {
      body.top_k = genConfig.topK;
    }
    if (genConfig.frequencyPenalty !== undefined) {
      body.frequency_penalty = genConfig.frequencyPenalty;
    }

    if (tools?.length) {
      body.tools = toOpenAITools(tools);
      body.tool_choice = 'auto';
    }

    return body;
  }
}
