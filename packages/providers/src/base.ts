/**
 * LLM Provider 基础类型和接口
 */

import type { ModelConfig } from '@microbot/config';

/** LLM 消息角色 */
export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

/** 生成配置参数 */
export interface GenerationConfig {
  /** 生成的最大 token 数量 */
  maxTokens?: number;
  /** 控制响应的随机性 */
  temperature?: number;
  /** 限制 token 选择范围为前 k 个候选 */
  topK?: number;
  /** 核采样参数 */
  topP?: number;
  /** 频率惩罚 */
  frequencyPenalty?: number;
}

/** 工具调用 */
export interface ToolCall {
  /** 调用 ID */
  id: string;
  /** 工具名称 */
  name: string;
  /** 工具参数 */
  arguments: Record<string, unknown>;
}

/** 文本内容部分 */
export interface TextContentPart {
  type: 'text';
  text: string;
}

/** 图片 URL 内容部分 */
export interface ImageUrlContentPart {
  type: 'image_url';
  image_url: {
    url: string;
    detail?: 'low' | 'high' | 'auto';
  };
}

/** 消息内容部分（多模态支持） */
export type ContentPart = TextContentPart | ImageUrlContentPart;

/** 消息内容类型（支持纯文本或多模态数组） */
export type MessageContent = string | ContentPart[];

/** LLM 消息 */
export interface LLMMessage {
  /** 角色 */
  role: MessageRole;
  /** 内容（支持纯文本或多模态数组） */
  content: MessageContent;
  /** 工具调用 ID（role=tool 时） */
  toolCallId?: string;
  /** 工具调用列表（role=assistant 时） */
  toolCalls?: ToolCall[];
}

/** 使用统计 */
export interface UsageStats {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cacheWriteTokens?: number;
  cacheReadTokens?: number;
}

/** LLM 响应 */
export interface LLMResponse {
  /** 文本内容 */
  content: string;
  /** 工具调用列表 */
  toolCalls?: ToolCall[];
  /** 是否包含工具调用 */
  hasToolCalls: boolean;
  /** 推理内容（用于深度思考模型） */
  reasoning?: string;
  /** 使用统计 */
  usage?: UsageStats;
  /** 实际使用的 Provider 名称 */
  usedProvider?: string;
  /** 实际使用的模型 ID */
  usedModel?: string;
}

/** 工具定义（LLM 格式） */
export interface LLMToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

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
  content: string | ContentPart[];
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
 * 将 LLMMessage 转换为 OpenAI API 格式
 */
export function toOpenAIMessages(messages: LLMMessage[]): OpenAIMessage[] {
  return messages.map(msg => {
    const openaiMsg: OpenAIMessage = {
      role: msg.role,
      content: msg.content,
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
