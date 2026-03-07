/**
 * OpenAI Compatible Provider
 */

import { getLogger } from '@logtape/logtape';
import type {
  LLMProvider,
  LLMMessage,
  LLMResponse,
  LLMToolDefinition,
  GenerationConfig,
  ProviderCapabilities,
  ContentPart,
} from '../../types';

const log = getLogger(['provider', 'openai']);

/** OpenAI 文本内容部分 */
interface OpenAITextContentPart {
  type: 'text';
  text: string;
}

/** OpenAI 消息内容部分 */
type OpenAIContentPart = OpenAITextContentPart | { type: 'image_url'; image_url: { url: string } };

/** OpenAI API 响应格式 */
interface OpenAIResponse {
  choices: Array<{
    message: {
      content: string;
      tool_calls?: Array<{
        id: string;
        function: {
          name: string;
          arguments: string;
        };
      }>;
    };
  }>;
}

/** OpenAI API 消息格式 */
interface OpenAIMessage {
  role: string;
  content: string | OpenAIContentPart[];
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>;
}

/** OpenAI Compatible 配置 */
export interface OpenAICompatibleConfig {
  baseUrl: string;
  apiKey?: string;
  defaultModel: string;
  /** 默认生成配置 */
  defaultGenerationConfig?: GenerationConfig;
}

/** 默认生成配置 */
const DEFAULT_GENERATION_CONFIG: GenerationConfig = {
  maxTokens: 8192,
  temperature: 0.7,
  topK: 50,
  topP: 0.7,
  frequencyPenalty: 0.5,
};

/**
 * 将 ContentPart 转换为 OpenAI 格式
 */
function toOpenAIContentPart(part: ContentPart): OpenAIContentPart {
  // OpenAI URL 格式直接返回
  if (part.type === 'image_url') {
    return part;
  }
  // 文本格式
  if (part.type === 'text') {
    return { type: 'text', text: part.text };
  }
  // base64 图片格式
  if (part.type === 'image') {
    return {
      type: 'image_url',
      image_url: { url: `data:${part.mimeType};base64,${part.data}` },
    };
  }
  // resource 类型转换为文本描述
  return { type: 'text', text: `Resource: ${(part as { uri: string }).uri}` };
}

/**
 * 将 LLMMessage 转换为 OpenAI API 格式
 */
function toOpenAIMessages(messages: LLMMessage[]): OpenAIMessage[] {
  return messages.map(msg => {
    // 转换内容格式
    let openaiContent: string | OpenAIContentPart[];
    if (typeof msg.content === 'string') {
      openaiContent = msg.content;
    } else {
      openaiContent = msg.content.map(toOpenAIContentPart);
    }

    const openaiMsg: OpenAIMessage = {
      role: msg.role,
      content: openaiContent,
    };

    if (msg.toolCallId) {
      openaiMsg.tool_call_id = msg.toolCallId;
    }

    if (msg.toolCalls?.length) {
      openaiMsg.tool_calls = msg.toolCalls.map(tc => ({
        id: tc.id,
        type: 'function' as const,
        function: {
          name: tc.name,
          arguments: JSON.stringify(tc.arguments),
        },
      }));
    }

    return openaiMsg;
  });
}

/** 解析 OpenAI 格式响应 */
function parseOpenAIResponse(data: unknown): LLMResponse {
  // 类型检查
  if (!data || typeof data !== 'object') {
    log.warn('LLM 响应数据无效', { dataType: typeof data });
    return { content: '', hasToolCalls: false };
  }

  const responseData = data as Record<string, unknown>;
  
  // 检查是否有 choices 字段
  if (!('choices' in responseData)) {
    console.error('[LLM] 响应没有 choices 字段, 可用字段:', Object.keys(responseData));
    // 尝试其他常见格式
    
    // 某些 API 可能直接返回 content
    if ('content' in responseData && typeof responseData.content === 'string') {
      return { content: responseData.content, hasToolCalls: false };
    }
    
    // 某些 API 可能返回 result
    if ('result' in responseData) {
      const result = responseData.result;
      if (typeof result === 'string') {
        return { content: result, hasToolCalls: false };
      }
      if (result && typeof result === 'object' && 'content' in result) {
        return { content: String((result as Record<string, unknown>).content), hasToolCalls: false };
      }
    }
    
    // 某些 API 可能返回 data.content
    if ('data' in responseData) {
      const innerData = (responseData as Record<string, unknown>).data;
      if (innerData && typeof innerData === 'object') {
        const inner = innerData as Record<string, unknown>;
        if ('content' in inner && typeof inner.content === 'string') {
          return { content: inner.content, hasToolCalls: false };
        }
        if ('choices' in inner && Array.isArray(inner.choices)) {
          // data.choices 格式
          const choice = inner.choices[0] as Record<string, unknown> | undefined;
          if (choice && 'message' in choice) {
            const message = (choice as Record<string, unknown>).message as Record<string, unknown>;
            return { content: String(message?.content ?? ''), hasToolCalls: false };
          }
        }
      }
    }
    
    // 某些 API 可能返回 output 或 text
    if ('output' in responseData && typeof responseData.output === 'string') {
      return { content: responseData.output, hasToolCalls: false };
    }
    if ('text' in responseData && typeof responseData.text === 'string') {
      return { content: responseData.text, hasToolCalls: false };
    }
    
    // 无法解析，返回原始 JSON 作为内容
    return { content: JSON.stringify(responseData), hasToolCalls: false };
  }

  const choices = responseData.choices as Array<Record<string, unknown>>;
  const choice = choices?.[0];
  
  if (!choice) {
    log.warn('LLM choices 数组为空');
    return { content: '', hasToolCalls: false };
  }

  const message = (choice as Record<string, unknown>).message as Record<string, unknown> | undefined;
  if (!message) {
    log.warn('LLM choice 没有 message 字段');
    return { content: '', hasToolCalls: false };
  }

  const content = typeof message.content === 'string' ? message.content : '';
  
  const toolCalls = (message.tool_calls as Array<{
    id: string;
    function: { name: string; arguments: string };
  }>)?.map(tc => ({
    id: tc.id,
    name: tc.function.name,
    arguments: JSON.parse(tc.function.arguments),
  }));

  return {
    content: content || '',
    toolCalls,
    hasToolCalls: !!toolCalls?.length,
  };
}

/**
 * OpenAI Compatible Provider
 */
export class OpenAICompatibleProvider implements LLMProvider {
  readonly name: string;
  readonly type = 'llm' as const;
  private generationConfig: GenerationConfig;

  constructor(
    private config: OpenAICompatibleConfig,
    name?: string
  ) {
    this.name = name ?? 'openai-compatible';
    this.generationConfig = { ...DEFAULT_GENERATION_CONFIG, ...config.defaultGenerationConfig };
  }

  async chat(
    messages: LLMMessage[],
    tools?: LLMToolDefinition[],
    model?: string,
    config?: GenerationConfig
  ): Promise<LLMResponse> {
    const modelName = model ?? this.config.defaultModel;
    const genConfig = { ...this.generationConfig, ...config };

    // 记录请求
    log.info('LLM 请求', {
      model: modelName,
      messageCount: messages.length,
      toolCount: tools?.length ?? 0,
      lastUserMessage: messages.filter(m => m.role === 'user').slice(-1)[0]?.content?.toString().slice(0, 200),
    });

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

    // 始终传递 tools 参数（如果有的话）
    if (tools?.length) {
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
      log.error('LLM API 错���', { status: response.status, error: errorText.slice(0, 500) });
      throw new Error(`API 错误 (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    
    // 记录原始响应（debug 级别）
    log.debug('LLM API 原始响应', { response: JSON.stringify(data).slice(0, 1000) });
    
    // 检查是否为错误响应（某些 API 返回 HTTP 200 但包含错误信息）
    if (data && typeof data === 'object') {
      const responseData = data as Record<string, unknown>;
      
      // 检查常见的错误响应格式
      if ('status' in responseData && responseData.status !== 200 && responseData.status !== '200') {
        const errorMsg = String(responseData.msg || responseData.message || '未知错误');
        throw new Error(`API 错误 (status: ${responseData.status}): ${errorMsg}`);
      }
      
      if ('error' in responseData) {
        const error = responseData.error;
        if (typeof error === 'object' && error !== null) {
          const errorObj = error as Record<string, unknown>;
          throw new Error(`API 错误: ${errorObj.message || JSON.stringify(error)}`);
        }
        throw new Error(`API 错误: ${error}`);
      }
      
      if ('code' in responseData && 'message' in responseData && responseData.code !== 0) {
        throw new Error(`API 错误 (code: ${responseData.code}): ${responseData.message}`);
      }
    }
    
    return parseOpenAIResponse(data as OpenAIResponse);
  }

  getDefaultModel(): string {
    return this.config.defaultModel;
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }

  getModelCapabilities(_modelId: string): ProviderCapabilities {
    // 默认支持工具调用，不支持视觉和思考
    return { vision: false, think: false, tool: true };
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

/**
 * 创建 OpenAI Compatible Provider
 */
export function createOpenAICompatibleProvider(config: OpenAICompatibleConfig, name?: string): LLMProvider {
  return new OpenAICompatibleProvider(config, name);
}
