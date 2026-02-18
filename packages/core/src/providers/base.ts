/**
 * LLM Provider 基础类型和接口
 * 
 * 定义所有 Provider 必须实现的统一接口。
 */

import type { ModelConfig } from '../config/schema';

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

/** LLM 响应 */
export interface LLMResponse {
  /** 文本内容 */
  content: string;
  /** 工具调用列表 */
  toolCalls?: ToolCall[];
  /** 是否包含工具调用 */
  hasToolCalls: boolean;
  /** 实际使用的 Provider 名称（fallback 时可能与请求不同） */
  usedProvider?: string;
  /** 实际使用的模型 ID（fallback 时可能与请求不同） */
  usedModel?: string;
  /** 实际使用的模型性能级别 */
  usedLevel?: string;
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
 * 
 * OpenAI API 要求 snake_case 字段名（tool_call_id, tool_calls）
 */
export function toOpenAIMessages(messages: LLMMessage[]): OpenAIMessage[] {
  return messages.map(msg => {
    const openaiMsg: OpenAIMessage = {
      role: msg.role,
      content: msg.content,
    };

    // 工具调用 ID（role=tool 时必须）
    if (msg.toolCallId) {
      openaiMsg.tool_call_id = msg.toolCallId;
    }

    // 工具调用列表（role=assistant 时）
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
   * @param messages - 消息历史
   * @param tools - 可用工具列表
   * @param model - 模型名称（可选）
   * @param config - 生成配置参数
   * @returns LLM 响应
   */
  chat(
    messages: LLMMessage[],
    tools?: LLMToolDefinition[],
    model?: string,
    config?: GenerationConfig
  ): Promise<LLMResponse>;
  
  /**
   * 获取默认模型
   * @returns 默认模型名称
   */
  getDefaultModel(): string;
  
  /**
   * 检查 Provider 是否可用
   * @returns 是否可用
   */
  isAvailable(): Promise<boolean>;

  /**
   * 获取模型能力配置
   * @param modelId - 模型 ID
   * @returns 模型能力配置
   */
  getModelCapabilities(modelId: string): ModelConfig;

  /**
   * 获取提供商支持的模型列表
   * 用于检测提供商是否可用以及模型是否存在
   * @returns 模型 ID 列表，失败返回 null
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
