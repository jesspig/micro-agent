/**
 * Anthropic Claude Provider
 */

import type {
  LLMProvider,
  LLMMessage,
  LLMResponse,
  LLMToolDefinition,
  GenerationConfig,
  ProviderCapabilities,
  ContentPart,
} from '../../../types';

/** Anthropic API 响应格式 */
interface AnthropicResponse {
  content: Array<{
    type: 'text' | 'tool_use';
    text?: string;
    id?: string;
    name?: string;
    input?: Record<string, unknown>;
  }>;
  stop_reason: string | null;
}

/** Anthropic 消息格式 */
interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | Array<{ type: 'text'; text: string } | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }>;
}

/** Anthropic 配置 */
export interface AnthropicConfig {
  apiKey?: string;
  defaultModel: string;
  baseUrl?: string;
  /** 默认生成配置 */
  defaultGenerationConfig?: GenerationConfig;
}

/** 默认生成配置 */
const DEFAULT_GENERATION_CONFIG: GenerationConfig = {
  maxTokens: 8192,
  temperature: 0.7,
  topP: 0.9,
};

/**
 * 将 ContentPart 转换为 Anthropic 格式
 */
function toAnthropicContent(part: ContentPart): { type: 'text'; text: string } | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } } {
  if (part.type === 'text') {
    return { type: 'text', text: part.text };
  }
  if (part.type === 'image') {
    return {
      type: 'image',
      source: {
        type: 'base64',
        media_type: part.mimeType,
        data: part.data,
      },
    };
  }
  // image_url 和 resource 转换为文本描述
  if (part.type === 'image_url') {
    return { type: 'text', text: `[Image: ${part.image_url.url}]` };
  }
  return { type: 'text', text: `Resource: ${(part as { uri: string }).uri}` };
}

/**
 * 将 LLMMessage 转换为 Anthropic API 格式
 */
function toAnthropicMessages(messages: LLMMessage[]): AnthropicMessage[] {
  const result: AnthropicMessage[] = [];

  for (const msg of messages) {
    // Anthropic 不支持 system 角色在消息中
    if (msg.role === 'system') continue;

    let content: string | Array<{ type: 'text'; text: string } | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }>;

    if (typeof msg.content === 'string') {
      content = msg.content;
    } else {
      content = msg.content.map(toAnthropicContent);
    }

    const anthropicMsg: AnthropicMessage = {
      role: msg.role as 'user' | 'assistant',
      content,
    };

    // 处理工具调用结果
    if (msg.toolCallId && msg.role === 'tool') {
      // Anthropic 使用 user 角色传递工具结果
      anthropicMsg.role = 'user';
      if (typeof content === 'string') {
        content = [{ type: 'text', text: content }];
      }
    }

    result.push(anthropicMsg);
  }

  return result;
}

/** 解析 Anthropic 格式响应 */
function parseAnthropicResponse(data: AnthropicResponse): LLMResponse {
  const textBlocks = data.content.filter(b => b.type === 'text');
  const toolBlocks = data.content.filter(b => b.type === 'tool_use');

  const content = textBlocks.map(b => b.text).join('\n');

  const toolCalls = toolBlocks.map(b => ({
    id: b.id!,
    name: b.name!,
    arguments: b.input!,
  }));

  return {
    content,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    hasToolCalls: toolBlocks.length > 0,
  };
}

/**
 * Anthropic Provider
 */
export class AnthropicProvider implements LLMProvider {
  readonly name = 'anthropic';
  readonly type = 'llm' as const;
  private generationConfig: GenerationConfig;
  private baseUrl: string;

  constructor(private config: AnthropicConfig) {
    this.generationConfig = { ...DEFAULT_GENERATION_CONFIG, ...config.defaultGenerationConfig };
    this.baseUrl = config.baseUrl ?? 'https://api.anthropic.com/v1';
  }

  async chat(
    messages: LLMMessage[],
    tools?: LLMToolDefinition[],
    model?: string,
    config?: GenerationConfig
  ): Promise<LLMResponse> {
    const modelName = model ?? this.config.defaultModel;
    const genConfig = { ...this.generationConfig, ...config };

    if (!this.config.apiKey) {
      throw new Error('Anthropic API key is required');
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-api-key': this.config.apiKey,
      'anthropic-version': '2023-06-01',
    };

    // 提取 system 消息
    const systemMessage = messages.find(m => m.role === 'system');
    const chatMessages = toAnthropicMessages(messages);

    const body: Record<string, unknown> = {
      model: modelName,
      messages: chatMessages,
      max_tokens: genConfig.maxTokens ?? 8192,
    };

    if (systemMessage) {
      body.system = typeof systemMessage.content === 'string'
        ? systemMessage.content
        : systemMessage.content.filter(p => p.type === 'text').map(p => (p as { text: string }).text).join('\n');
    }

    if (genConfig.temperature !== undefined) {
      body.temperature = genConfig.temperature;
    }
    if (genConfig.topP !== undefined) {
      body.top_p = genConfig.topP;
    }

    // 转换工具定义
    if (tools?.length) {
      body.tools = tools.map(t => ({
        name: t.function.name,
        description: t.function.description,
        input_schema: t.function.parameters,
      }));
    }

    const response = await fetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Anthropic API 错误 (${response.status}): ${errorText}`);
    }

    const data = await response.json() as AnthropicResponse;
    return parseAnthropicResponse(data);
  }

  getDefaultModel(): string {
    return this.config.defaultModel;
  }

  async isAvailable(): Promise<boolean> {
    return !!this.config.apiKey;
  }

  getModelCapabilities(_modelId: string): ProviderCapabilities {
    // Claude 默认支持视觉和工具调用
    return { vision: true, think: false, tool: true };
  }

  async listModels(): Promise<string[] | null> {
    // Anthropic 不提供 list models API
    return null;
  }
}

/**
 * 创建 Anthropic Provider
 */
export function createAnthropicProvider(config: AnthropicConfig): LLMProvider {
  return new AnthropicProvider(config);
}
