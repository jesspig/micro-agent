/**
 * ACP 适配器
 *
 * 将 ACP 客户端与 MicroBot Agent 集成。
 */

import { getLogger } from '@logtape/logtape';
import { ACPClient, type ACPClientConfig } from './acp-client';
import type { ACPConnection, SessionInfo, PromptRequest, ContentBlock, ToolCallContent } from './types';
import type { LLMProvider, LLMResponse, LLMMessage, LLMToolDefinition } from '../base';

const log = getLogger(['acp', 'adapter']);

/** 工具注册表接口（简化版） */
export interface ToolRegistryLike {
  getDefinitions(): Array<{ name: string; description: string; inputSchema: unknown }>;
  execute(name: string, input: unknown, ctx: { channel: string; chatId: string; workspace: string; currentDir: string; sendToBus: (msg: unknown) => Promise<void> }): Promise<string>;
}

/** ACP 适配器配置 */
export interface ACPAdapterConfig extends ACPClientConfig {
  /** LLM Provider */
  provider: LLMProvider;
  /** 工具注册表 */
  toolRegistry: ToolRegistryLike;
  /** 工作目录 */
  workspace: string;
  /** 最大迭代次数 */
  maxIterations?: number;
}

/** 会话状态 */
interface SessionState {
  messages: LLMMessage[];
  modelId: string;
}

/**
 * ACP 适配器
 *
 * 实现 ACP Agent 接口，处理 IDE 请求并调用 LLM。
 */
export class ACPAdapter extends ACPClient {
  private provider: LLMProvider;
  private toolRegistry: ToolRegistryLike;
  private workspace: string;
  private maxIterations: number;
  private sessionStates = new Map<string, SessionState>();

  constructor(config: ACPAdapterConfig) {
    super(config);
    this.provider = config.provider;
    this.toolRegistry = config.toolRegistry;
    this.workspace = config.workspace;
    this.maxIterations = config.maxIterations ?? 20;
  }

  /**
   * 处理提示
   */
  protected override async handlePrompt(request: PromptRequest, session: SessionInfo): Promise<void> {
    const connection = this.getConnection();

    try {
      // 获取或创建会话状态
      let state = this.sessionStates.get(session.id);
      if (!state) {
        state = {
          messages: [],
          modelId: session.model?.modelId ?? 'default',
        };
        this.sessionStates.set(session.id, state);
      }

      // 添加用户消息
      const userMessage: LLMMessage = {
        role: 'user',
        content: request.prompt,
      };
      state.messages.push(userMessage);

      // 获取工具定义
      const tools: LLMToolDefinition[] = this.toolRegistry.getDefinitions().map((def): LLMToolDefinition => ({
        type: 'function',
        function: {
          name: def.name,
          description: def.description,
          parameters: def.inputSchema as Record<string, unknown>,
        },
      }));

      // ReAct 循环
      let iterations = 0;
      let lastResponse: LLMResponse | null = null;

      while (iterations < this.maxIterations) {
        iterations++;

        // 调用 LLM
        const response = await this.provider.chat(state.messages, tools);

        lastResponse = response;

        // 发送推理
        if (response.reasoning) {
          await connection.sendReasoning(session.id, response.reasoning);
        }

        // 处理工具调用
        if (response.hasToolCalls && response.toolCalls) {
          // 添加助手消息
          state.messages.push({
            role: 'assistant',
            content: response.content || '',
            toolCalls: response.toolCalls,
          });

          // 执行工具调用
          for (const toolCall of response.toolCalls) {
            const toolContent: ToolCallContent = {
              toolCallId: toolCall.id,
              name: toolCall.name,
              kind: 'function',
              arguments: toolCall.arguments,
            };

            await connection.sendToolPending(session.id, toolContent);
            await connection.sendToolInProgress(session.id, toolCall.id);

            try {
              const result = await this.toolRegistry.execute(
                toolCall.name,
                toolCall.arguments,
                {
                  channel: 'acp',
                  chatId: session.id,
                  workspace: this.workspace,
                  currentDir: session.cwd || this.workspace,
                  sendToBus: async () => {},
                }
              );

              await connection.sendToolCompleted(session.id, toolCall.id, [
                { type: 'text', text: result },
              ]);

              // 添加工具结果
              state.messages.push({
                role: 'tool',
                content: result,
                toolCallId: toolCall.id,
              });
            } catch (error) {
              const errorMsg = error instanceof Error ? error.message : String(error);
              await connection.sendToolError(session.id, toolCall.id, errorMsg);

              state.messages.push({
                role: 'tool',
                content: `错误: ${errorMsg}`,
                toolCallId: toolCall.id,
              });
            }
          }
        } else {
          // 没有工具调用，发送响应
          await connection.sendText(session.id, response.content);

          // 添加助手消息
          state.messages.push({
            role: 'assistant',
            content: response.content,
          });

          // 发送使用统计
          if (response.usage) {
            await connection.sendUsage(session.id, {
              inputTokens: response.usage.promptTokens,
              outputTokens: response.usage.completionTokens,
              totalTokens: response.usage.totalTokens,
            });
          }

          // 完成
          await connection.sendComplete(session.id);
          break;
        }
      }

      if (iterations >= this.maxIterations && lastResponse) {
        await connection.sendText(session.id, '达到最大迭代次数，请简化请求或分步执行。');
        await connection.sendComplete(session.id);
      }
    } catch (error) {
      log.error('处理提示失败: {error}', { error: error instanceof Error ? error.message : String(error) });
      await connection.sendText(session.id, `处理失败: ${error instanceof Error ? error.message : '未知错误'}`);
      await connection.sendComplete(session.id);
    }
  }
}

/**
 * 创建 ACP 适配器
 */
export function createACPAdapter(config: ACPAdapterConfig): ACPAdapter {
  return new ACPAdapter(config);
}