/**
 * ReAct Agent 架构
 *
 * 实现 Reasoning + Acting 循环，让任何 LLM 都能通过 JSON 结构化输出调用工具。
 * 不依赖原生的 function calling 能力。
 */

import type { LLMGateway, LLMMessage, GenerationConfig } from '@micro-agent/providers';
import { parseReActResponse, type ReActResponse, type ReActAction } from './react-types';
import { getLogger } from '@logtape/logtape';

const log = getLogger(['react']);

/**
 * ReAct 工具定义
 */
export interface ReActTool {
  name: string;
  description: string;
  execute: (input: unknown) => Promise<string>;
}

/**
 * ReAct Agent 配置
 */
export interface ReActAgentConfig {
  /** LLM Gateway */
  gateway: LLMGateway;
  /** 默认模型 */
  model: string;
  /** 系统提示词 */
  systemPrompt: string;
  /** 可用工具列表 */
  tools: ReActTool[];
  /** 最大迭代次数 */
  maxIterations: number;
  /** 生成配置 */
  generationConfig?: GenerationConfig;
}

/**
 * ReAct Agent 执行结果
 */
export interface ReActResult {
  /** 最终回答 */
  answer: string;
  /** 迭代次数 */
  iterations: number;
  /** 执行的工具调用 */
  toolCalls: Array<{ action: ReActAction; input: unknown; result: string }>;
}

/**
 * ReAct Agent
 *
 * 实现 ReAct 循环：Thought -> Action -> Observation -> ...
 */
export class ReActAgent {
  private tools: Map<string, ReActTool>;

  constructor(private config: ReActAgentConfig) {
    this.tools = new Map(config.tools.map(t => [t.name, t]));
  }

  /**
   * 执行 ReAct 循环
   */
  async run(userMessage: string): Promise<ReActResult> {
    const messages: LLMMessage[] = [
      { role: 'system', content: this.config.systemPrompt },
      { role: 'user', content: userMessage },
    ];

    const toolCalls: ReActResult['toolCalls'] = [];
    let iterations = 0;

    while (iterations < this.config.maxIterations) {
      iterations++;

      const response = await this.config.gateway.chat(
        messages,
        [], // 不使用原生工具调用
        this.config.model,
        this.config.generationConfig ?? { maxTokens: 8192, temperature: 0.7 }
      );

      log.info('[ReAct] LLM 响应', { 
        iteration: iterations, 
        content: response.content.slice(0, 500),
        fullLength: response.content.length,
      });

      // 解析 ReAct 响应
      const reactResponse = parseReActResponse(response.content);

      if (!reactResponse) {
        // 无法解析为 ReAct 格式，直接返回
        log.warn('[ReAct] 无法解析为 ReAct 格式，直接返回');
        return { answer: response.content, iterations, toolCalls };
      }

      log.info('[ReAct] 解析结果', { 
        thought: reactResponse.thought,
        action: reactResponse.action,
        actionInput: reactResponse.action_input,
      });

      // 检查是否完成
      if (reactResponse.action === 'finish') {
        return {
          answer: typeof reactResponse.action_input === 'string'
            ? reactResponse.action_input
            : JSON.stringify(reactResponse.action_input),
          iterations,
          toolCalls,
        };
      }

      // 执行工具
      const tool = this.tools.get(reactResponse.action);
      if (!tool) {
        const error = `未知工具: ${reactResponse.action}`;
        messages.push({ role: 'assistant', content: response.content });
        messages.push({ role: 'user', content: `Observation: 错误 - ${error}` });
        continue;
      }

      try {
        log.info('[ReAct] 开始执行工具', { 
          action: reactResponse.action, 
          input: reactResponse.action_input 
        });
        const result = await tool.execute(reactResponse.action_input);
        log.info('[ReAct] 工具执行成功', { 
          action: reactResponse.action, 
          result: result.slice(0, 500),
          fullLength: result.length,
        });
        toolCalls.push({ action: reactResponse.action, input: reactResponse.action_input, result });

        messages.push({ role: 'assistant', content: response.content });
        messages.push({ role: 'user', content: `Observation: ${result}` });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        log.error('[ReAct] 工具执行失败', { action: reactResponse.action, error: errorMsg });

        messages.push({ role: 'assistant', content: response.content });
        messages.push({ role: 'user', content: `Observation: 错误 - ${errorMsg}` });
      }
    }

    // 达到最大迭代次数
    log.warn('[ReAct] 达到最大迭代次数', { maxIterations: this.config.maxIterations });
    return {
      answer: '抱歉，我在处理您的请求时遇到了问题，请稍后重试。',
      iterations,
      toolCalls,
    };
  }

  /**
   * 更新系统提示词
   */
  setSystemPrompt(prompt: string): void {
    this.config.systemPrompt = prompt;
  }

  /**
   * 更新模型
   */
  setModel(model: string): void {
    this.config.model = model;
  }
}
