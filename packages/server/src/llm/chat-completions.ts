/**
 * OpenAI 兼容 Chat Completions API
 *
 * 提供与 OpenAI API 兼容的端点。
 */

import { getLogger } from '@logtape/logtape';
import type { LLMProvider, LLMMessage, LLMResponse, LLMToolDefinition } from '@microbot/providers';
import { jsonResponse, errorResponse } from '../http/server';

const log = getLogger(['server', 'llm', 'chat']);

/** Chat Completions 请求 */
export interface ChatCompletionsRequest {
  model: string;
  messages: Array<{
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
    name?: string;
    tool_calls?: Array<{
      id: string;
      type: 'function';
      function: { name: string; arguments: string };
    }>;
    tool_call_id?: string;
  }>;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  stream?: boolean;
  tools?: Array<{
    type: 'function';
    function: {
      name: string;
      description?: string;
      parameters?: Record<string, unknown>;
    };
  }>;
  tool_choice?: 'auto' | 'none' | 'required' | { type: 'function'; function: { name: string } };
}

/** Chat Completions 响应 */
export interface ChatCompletionsResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: 'assistant';
      content: string | null;
      tool_calls?: Array<{
        id: string;
        type: 'function';
        function: { name: string; arguments: string };
      }>;
    };
    finish_reason: 'stop' | 'tool_calls' | 'length' | null;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/** 创建 Chat Completions 处理器 */
export function createChatCompletionsHandler(provider: LLMProvider) {
  return async (request: Request): Promise<Response> => {
    try {
      const body = await request.json() as ChatCompletionsRequest;
      log.info('Chat Completions: model={model}, messages={count}', {
        model: body.model,
        count: body.messages.length,
      });

      // 转换消息格式
      const messages: LLMMessage[] = body.messages.map(msg => ({
        role: msg.role,
        content: typeof msg.content === 'string' 
          ? msg.content 
          : msg.content.map(c => c.text ?? '').join(''),
        name: msg.name,
        toolCalls: msg.tool_calls?.map(tc => ({
          id: tc.id,
          name: tc.function.name,
          arguments: JSON.parse(tc.function.arguments),
        })),
        toolCallId: msg.tool_call_id,
      }));

      // 转换工具定义
      const tools: LLMToolDefinition[] | undefined = body.tools?.map((tool): LLMToolDefinition => ({
        type: 'function',
        function: {
          name: tool.function.name,
          description: tool.function.description ?? '',
          parameters: tool.function.parameters ?? {},
        },
      }));

      // 调用 LLM
      const response: LLMResponse = await provider.chat(messages, tools);

      // 构建响应
      const completionId = `chatcmpl-${crypto.randomUUID()}`;
      const finishReason = response.hasToolCalls ? 'tool_calls' : 'stop';

      const chatResponse: ChatCompletionsResponse = {
        id: completionId,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: body.model,
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: response.content || null,
              tool_calls: response.toolCalls?.map(tc => ({
                id: tc.id,
                type: 'function' as const,
                function: {
                  name: tc.name,
                  arguments: JSON.stringify(tc.arguments),
                },
              })),
            },
            finish_reason: finishReason,
          },
        ],
        usage: {
          prompt_tokens: response.usage?.promptTokens ?? 0,
          completion_tokens: response.usage?.completionTokens ?? 0,
          total_tokens: response.usage?.totalTokens ?? 0,
        },
      };

      return jsonResponse(chatResponse);
    } catch (error) {
      log.error('Chat Completions 错误: {error}', {
        error: error instanceof Error ? error.message : String(error),
      });
      return errorResponse(
        error instanceof Error ? error.message : '内部服务器错误',
        500
      );
    }
  };
}