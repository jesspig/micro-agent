/**
 * LLM Provider 基础类型和接口
 */

import type { ModelConfig } from '@micro-agent/config';
import type {
  ContentPart,
  TextContentPart,
  ImageContentPart,
  ImageUrlContentPart,
  ResourceContentPart,
  MessageRole,
  MessageContent,
  ToolCall,
  LLMMessage,
  LLMResponse,
  LLMToolDefinition,
  GenerationConfig,
  UsageStats,
} from '@micro-agent/types';

// 从 @micro-agent/types 重新导出（保持 API 兼容）
export type {
  ContentPart,
  TextContentPart,
  ImageContentPart,
  ImageUrlContentPart,
  ResourceContentPart,
  MessageRole,
  MessageContent,
  ToolCall,
  LLMMessage,
  LLMResponse,
  LLMToolDefinition,
  GenerationConfig,
  UsageStats,
}

/** OpenAI 文本内容部分 */
export interface OpenAITextContentPart {
  type: 'text';
  text: string;
}

/** OpenAI 消息内容部分（用于 OpenAI API 调用） */
export type OpenAIContentPart = OpenAITextContentPart | ImageUrlContentPart;

/** Provider 消息内容部分（ContentPart 别名，保持向后兼容） */
export type ProviderContentPart = ContentPart;

/** OpenAI API 响应格式 */
export interface OpenAIResponse {
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
export interface OpenAIMessage {
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

/**
 * 将 ContentPart 转换为 OpenAI 格式
 */
function toOpenAIContentPart(part: ContentPart): OpenAIContentPart {
  // OpenAI URL 格式直接返回
  if (part.type === 'image_url') {
    return part;
  }
  // MCP 文本格式
  if (part.type === 'text') {
    return { type: 'text', text: part.text };
  }
  // MCP base64 图片格式
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
export function toOpenAIMessages(messages: LLMMessage[]): OpenAIMessage[] {
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

/** Provider 接口 */
export interface LLMProvider {
  /** Provider 名称 */
  readonly name: string;
  
  /**
   * 聊天完成
   */
  chat(
    messages: LLMMessage[],
    tools?: LLMToolDefinition[],
    model?: string,
    config?: GenerationConfig
  ): Promise<LLMResponse>;
  
  /**
   * 获取默认模型
   */
  getDefaultModel(): string;
  
  /**
   * 检查 Provider 是否可用
   */
  isAvailable(): Promise<boolean>;

  /**
   * 获取模型能力配置
   */
  getModelCapabilities(modelId: string): ModelConfig;

  /**
   * 获取提供商支持的模型列表
   */
  listModels(): Promise<string[] | null>;
}

/** 解析 OpenAI 格式响应 */
export function parseOpenAIResponse(data: OpenAIResponse): LLMResponse {
  const choice = data.choices[0];
  if (!choice) {
    return { content: '', hasToolCalls: false };
  }

  const toolCalls = choice.message.tool_calls?.map(tc => ({
    id: tc.id,
    name: tc.function.name,
    arguments: JSON.parse(tc.function.arguments),
  }));

  return {
    content: choice.message.content || '',
    toolCalls,
    hasToolCalls: !!toolCalls?.length,
  };
}