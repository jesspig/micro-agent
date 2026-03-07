/**
 * ReAct 循环
 *
 * 实现 Reasoning + Acting 循环逻辑。
 */

import type { LLMMessage, LLMResponse, ToolCall } from '../../../types/provider';
import type { ToolRegistry } from '../../capability/tool-system';
import { getLogger } from '@logtape/logtape';

const log = getLogger(['kernel', 'react-loop']);

/** ReAct 循环配置 */
export interface ReActLoopConfig {
  /** 最大迭代次数 */
  maxIterations: number;
  /** 工具执行超时（毫秒） */
  toolTimeout?: number;
}

/** ReAct 步骤结果 */
export interface ReActStep {
  type: 'thought' | 'action' | 'observation';
  content: string;
  toolCall?: ToolCall;
  toolResult?: string;
}

/** ReAct 循环结果 */
export interface ReActLoopResult {
  /** 最终答案 */
  answer: string;
  /** 步骤历史 */
  steps: ReActStep[];
  /** 迭代次数 */
  iterations: number;
  /** 是否完成 */
  completed: boolean;
}

/**
 * ReAct 循环
 */
export class ReActLoop {
  constructor(
    private tools: ToolRegistry,
    private config: ReActLoopConfig
  ) {}

  /**
   * 执行 ReAct 循环
   */
  async execute(
    messages: LLMMessage[],
    llmCall: (msgs: LLMMessage[], tools: ToolCall[]) => Promise<LLMResponse>,
    toolContext: Record<string, unknown>
  ): Promise<ReActLoopResult> {
    const steps: ReActStep[] = [];
    let completed = false;
    let iterations = 0;

    const toolDefinitions = this.tools.getDefinitions();

    while (iterations < this.config.maxIterations && !completed) {
      iterations++;

      // 调用 LLM
      const response = await llmCall(messages, toolDefinitions);

      // 检查是否有工具调用
      if (!response.hasToolCalls || !response.toolCalls?.length) {
        steps.push({
          type: 'thought',
          content: response.content || '',
        });
        completed = true;
        break;
      }

      // 记录思考
      steps.push({
        type: 'thought',
        content: response.content || '',
      });

      // 执行工具调用
      for (const tc of response.toolCalls) {
        steps.push({
          type: 'action',
          content: `调用工具: ${tc.name}`,
          toolCall: tc,
        });

        try {
          const result = await this.tools.execute(tc.name, tc.arguments, toolContext as Parameters<typeof this.tools.execute>[2]);
          const resultText = result.content ? JSON.stringify(result.content) : JSON.stringify(result);

          steps.push({
            type: 'observation',
            content: resultText,
            toolResult: resultText,
          });

          // 添加到消息历史
          messages.push({ role: 'assistant', content: '', toolCalls: [tc] });
          messages.push({
            role: 'tool',
            content: resultText,
            toolCallId: tc.id,
          });
        } catch (error) {
          const errorText = error instanceof Error ? error.message : String(error);
          steps.push({
            type: 'observation',
            content: `错误: ${errorText}`,
            toolResult: `错误: ${errorText}`,
          });

          messages.push({ role: 'assistant', content: '', toolCalls: [tc] });
          messages.push({
            role: 'tool',
            content: `错误: ${errorText}`,
            toolCallId: tc.id,
          });
        }
      }
    }

    const answer = this.extractAnswer(messages);

    return {
      answer,
      steps,
      iterations,
      completed,
    };
  }

  /**
   * 提取最终答案
   */
  private extractAnswer(messages: LLMMessage[]): string {
    // 查找最后一条非工具消息
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.role === 'assistant' && typeof msg.content === 'string' && msg.content) {
        return msg.content;
      }
    }
    return '';
  }
}