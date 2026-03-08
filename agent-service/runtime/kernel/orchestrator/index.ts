/**
 * Agent 编排器
 *
 * 协调 Planner、ExecutionEngine、ContextManager 等核心组件。
 * 支持标准模式和流式模式。
 * 使用简单循环实现 ReAct 模式。
 */

import type { LLMMessage, LLMProvider, GenerationConfig } from '../../../types/provider';
import type { InboundMessage, OutboundMessage } from '../../../types/message';
import type { ToolRegistry } from '../../capability/tool-system';
import type { MemoryManager } from '../../capability/memory';
import type { SessionStore } from '../../infrastructure/database';
import type { KnowledgeRetriever } from '../../capability/knowledge';
import type { ToolContext, ToolResult } from '../../../types/tool';
import { getLogger } from '@logtape/logtape';

const log = getLogger(['kernel', 'orchestrator']);

/**
 * 从 ToolResult.content 提取纯文本内容
 */
function extractToolResultContent(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .filter((block): block is { type: 'text'; text: string } => 
        block && typeof block === 'object' && block.type === 'text'
      )
      .map(block => block.text)
      .join('\n');
  }
  return JSON.stringify(content);
}

/** 编排器配置 */
export interface OrchestratorConfig {
  /** LLM Provider */
  llmProvider: LLMProvider;
  /** 默认模型 */
  defaultModel: string;
  /** 最大迭代次数 */
  maxIterations: number;
  /** 系统提示词 */
  systemPrompt: string;
  /** 生成配置 */
  generationConfig?: GenerationConfig;
  /** 工作目录 */
  workspace: string;
  /** 知识库目录 */
  knowledgeBase: string;
}

/** 流式响应回调 */
export interface StreamCallbacks {
  /** 发送内容块 */
  onChunk: (chunk: string) => void | Promise<void>;
  /** 完成响应 */
  onComplete: () => void | Promise<void>;
  /** 错误处理 */
  onError?: (error: Error) => void | Promise<void>;
}

/** 状态变化回调（保留接口兼容性） */
export interface StateChangeCallbacks {
  /** 状态变化时调用 */
  onStateChange?: (state: string, data: unknown) => void | Promise<void>;
}

/** ReAct 循环状态 */
interface ReActLoopState {
  messages: LLMMessage[];
  iterations: number;
  lastToolCalls: string[];
  consecutiveErrors: number;
}

/**
 * Agent 编排器
 */
export class AgentOrchestrator {
  private sessionHistory = new Map<string, LLMMessage[]>();

  constructor(
    private config: OrchestratorConfig,
    private tools: ToolRegistry,
    private memoryManager?: MemoryManager,
    private sessionStore?: SessionStore,
    private knowledgeRetriever?: KnowledgeRetriever
  ) {}

  /**
   * 处理用户消息
   */
  async processMessage(msg: InboundMessage): Promise<OutboundMessage> {
    const sessionKey = `${msg.channel}:${msg.chatId}`;

    // 获取会话历史
    const history = await this.getSessionHistory(sessionKey);

    // 检索相关记忆
    const relevantMemories = this.memoryManager
      ? await this.memoryManager.search(msg.content, { limit: 5 })
      : [];

    // 检索知识库
    const knowledgeContext = await this.retrieveKnowledge(msg.content);

    // 构建上下文
    const messages = this.buildContext(history, msg, relevantMemories, knowledgeContext);

    // 执行 ReAct 循环
    const result = await this.executeLoop(messages, msg);

    // 更新历史
    messages.push({ role: 'assistant', content: result.answer });
    await this.updateSessionHistory(sessionKey, messages);

    // 存储记忆
    if (this.memoryManager) {
      await this.memoryManager.save({
        type: 'conversation',
        content: msg.content,
        sessionKey,
        importance: 0.5,
      });
    }

    return {
      channel: msg.channel,
      chatId: msg.chatId,
      content: result.answer,
      media: [],
      metadata: msg.metadata,
    };
  }

  /**
   * 流式处理用户消息
   */
  async processMessageStream(
    msg: InboundMessage,
    callbacks: StreamCallbacks,
    toolContext?: Partial<ToolContext>,
    stateCallbacks?: StateChangeCallbacks
  ): Promise<void> {
    const sessionKey = `${msg.channel}:${msg.chatId}`;

    // 记录用户输入
    const userContent = typeof msg.content === 'string'
      ? msg.content
      : (msg.content as { text?: string }).text || JSON.stringify(msg.content);
    log.info('收到用户消息', {
      sessionKey,
      content: userContent.slice(0, 200),
      channel: msg.channel,
    });

    try {
      // 获取会话历史
      const history = await this.getSessionHistory(sessionKey);

      // 检索相关记忆
      const relevantMemories = this.memoryManager
        ? await this.memoryManager.search(msg.content, { limit: 5 })
        : [];

      // 检索知识库
      const knowledgeContext = await this.retrieveKnowledge(msg.content);

      // 构建上下文
      const messages = this.buildContext(history, msg, relevantMemories, knowledgeContext);

      // 通知状态
      if (stateCallbacks?.onStateChange) {
        await stateCallbacks.onStateChange('initialized', { messages: messages.length });
      }

      // 执行 ReAct 循环
      const result = await this.executeReActLoop(
        messages,
        msg,
        callbacks,
        toolContext,
        stateCallbacks
      );

      // 记录 LLM 输出
      log.info('LLM 响应', {
        sessionKey,
        content: result.answer.slice(0, 500),
        iterations: result.iterations,
      });

      // 更新历史
      messages.push({ role: 'assistant', content: result.answer });
      await this.updateSessionHistory(sessionKey, messages);

      // 存储记忆
      if (this.memoryManager && result.answer) {
        await this.memoryManager.save({
          type: 'conversation',
          content: msg.content,
          sessionKey,
          importance: 0.5,
        });
      }

      // 发送响应内容到客户端
      if (result.answer.trim()) {
        await callbacks.onChunk(result.answer);
      }

      // 完成回调
      await callbacks.onComplete();
    } catch (error) {
      log.error('流式处理失败', { error: (error as Error).message });
      if (callbacks.onError) {
        await callbacks.onError(error as Error);
      }
      throw error;
    }
  }

  /**
   * 执行 ReAct 循环（核心逻辑）
   *
   * 简单的 while 循环实现：
   * 1. 调用 LLM
   * 2. 如果有工具调用，执行工具
   * 3. 将工具结果加入消息历史
   * 4. 重复直到 LLM 返回文本响应或达到最大迭代次数
   */
  private async executeReActLoop(
    messages: LLMMessage[],
    msg: InboundMessage,
    callbacks: StreamCallbacks,
    toolContext?: Partial<ToolContext>,
    stateCallbacks?: StateChangeCallbacks
  ): Promise<{ answer: string; iterations: number }> {
    const toolDefinitions = this.toLLMToolDefinitions(this.tools.getDefinitions());
    const maxIterations = this.config.maxIterations || 10;

    const state: ReActLoopState = {
      messages,
      iterations: 0,
      lastToolCalls: [],
      consecutiveErrors: 0,
    };

    // 通知状态
    if (stateCallbacks?.onStateChange) {
      await stateCallbacks.onStateChange('thinking', { iteration: 0 });
    }

    // ReAct 主循环
    while (state.iterations < maxIterations) {
      state.iterations++;

      try {
        // === 思考阶段 ===
        const response = await this.config.llmProvider.chat(
          messages,
          toolDefinitions,
          this.config.defaultModel,
          this.config.generationConfig
        );

        // 记录 LLM 思考过程
        log.info('LLM 思考', {
          iteration: state.iterations,
          reasoning: response.reasoning?.slice(0, 500),
          content: response.content?.slice(0, 500),
          toolCalls: response.toolCalls?.map(tc => tc.name) ?? [],
        });

        // 通知状态
        if (stateCallbacks?.onStateChange) {
          await stateCallbacks.onStateChange('thinking', { 
            iteration: state.iterations,
            hasToolCalls: response.hasToolCalls,
          });
        }

        // === 判断是否需要工具调用 ===
        if (!response.hasToolCalls || !response.toolCalls?.length) {
          // 没有工具调用，返回最终答案
          const answer = response.content || '抱歉，我无法生成有效的响应。';
          log.info('ReAct 完成', { 
            iteration: state.iterations, 
            answer: answer.slice(0, 1000),
            reasoning: response.reasoning?.slice(0, 500),
          });

          if (stateCallbacks?.onStateChange) {
            await stateCallbacks.onStateChange('completed', { iterations: state.iterations });
          }

          return { answer, iterations: state.iterations };
        }

        // === 执行阶段 ===
        log.info('ReAct 执行工具', { 
          iteration: state.iterations,
          tools: response.toolCalls.map(tc => tc.name),
          reasoning: response.reasoning?.slice(0, 500),
        });

        if (stateCallbacks?.onStateChange) {
          await stateCallbacks.onStateChange('executing', { 
            tools: response.toolCalls.map(tc => tc.name),
          });
        }

        // 执行所有工具调用
        const toolResults: Array<{ call: typeof response.toolCalls[0]; result: ToolResult }> = [];
        
        for (const toolCall of response.toolCalls) {
          const result = await this.executeToolCall(toolCall, msg, toolContext, state);
          toolResults.push({ call: toolCall, result });

          // 检查是否连续错误
          const resultText = extractToolResultContent(result.content);
          if (result.isError || resultText.includes('错误') || resultText.includes('失败')) {
            state.consecutiveErrors++;
          } else {
            state.consecutiveErrors = 0;
          }
        }

        // 检测困惑模式：连续 3 次相同工具调用失败
        const currentToolNames = response.toolCalls.map(tc => tc.name);
        if (state.consecutiveErrors >= 3) {
          log.warn('检测到困惑模式：连续工具调用失败', {
            consecutiveErrors: state.consecutiveErrors,
            lastTools: currentToolNames,
          });

          // 尝试给出有用的错误信息
          const lastResult = toolResults[toolResults.length - 1];
          const errorContent = extractToolResultContent(lastResult.result.content);

          return {
            answer: `我在执行工具时遇到了一些问题。\n\n最后的问题：${errorContent.slice(0, 300)}\n\n请尝试提供更多信息，或用不同的方式描述您的需求。`,
            iterations: state.iterations,
          };
        }

        // === 观察阶段 ===
        // 将工具调用和结果加入消息历史
        for (const { call, result } of toolResults) {
          messages.push({
            role: 'assistant',
            content: '',
            toolCalls: [call],
          });
          messages.push({
            role: 'tool',
            content: extractToolResultContent(result.content),
            toolCallId: call.id,
          });
        }

        // 记录本次工具调用
        state.lastToolCalls = currentToolNames;

        if (stateCallbacks?.onStateChange) {
          await stateCallbacks.onStateChange('observing', { 
            toolResults: toolResults.map(tr => ({
              tool: tr.call.name,
              success: !tr.result.isError,
            })),
          });
        }

        log.info('ReAct 观察', { 
          iteration: state.iterations,
          toolResults: toolResults.map(tr => ({
            tool: tr.call.name,
            success: !tr.result.isError,
            result: extractToolResultContent(tr.result.content).slice(0, 500),
          })),
        });

      } catch (error) {
        log.error('ReAct 循环错误', { 
          iteration: state.iterations, 
          error: (error as Error).message 
        });

        // LLM 调用失败，尝试返回已收集的信息
        if (state.iterations === 1) {
          return {
            answer: `抱歉，处理您的请求时发生了错误：${(error as Error).message}`,
            iterations: state.iterations,
          };
        }

        // 已经有了一些交互，返回当前状态
        return {
          answer: '抱歉，我在处理过程中遇到了一些问题。请稍后重试。',
          iterations: state.iterations,
        };
      }
    }

    // 达到最大迭代次数
    log.warn('ReAct 达到最大迭代次数', { iterations: state.iterations });

    if (stateCallbacks?.onStateChange) {
      await stateCallbacks.onStateChange('max_iterations', { iterations: state.iterations });
    }

    return {
      answer: '抱歉，我已经尝试了多次但仍未能完全解决您的问题。请尝试提供更多细节或重新表述您的需求。',
      iterations: state.iterations,
    };
  }

  /**
   * 执行单个工具调用
   */
  private async executeToolCall(
    toolCall: { id: string; name: string; arguments: Record<string, unknown> },
    msg: InboundMessage,
    toolContext?: Partial<ToolContext>,
    state?: ReActLoopState
  ): Promise<ToolResult> {
    const argsPreview = JSON.stringify(toolCall.arguments).slice(0, 200);
    log.info('执行工具调用', { 
      tool: toolCall.name, 
      arguments: toolCall.arguments,
      argsPreview,
      workspace: this.config.workspace,
    });

    const ctx: ToolContext = {
      channel: msg.channel,
      chatId: msg.chatId,
      workspace: this.config.workspace,
      currentDir: toolContext?.currentDir ?? this.config.workspace,
      knowledgeBase: this.config.knowledgeBase,
      sendToBus: async () => {},
    };

    try {
      const result = await this.tools.execute(toolCall.name, toolCall.arguments, ctx);
      const resultContent = extractToolResultContent(result.content);
      const isError = result.isError ?? false;

      log.info('工具执行完成', { 
        tool: toolCall.name,
        success: !isError,
        result: resultContent.slice(0, 1000),
        isError,
      });

      return result;
    } catch (error) {
      const errorMessage = (error as Error).message;
      log.error('工具执行异常', { 
        tool: toolCall.name, 
        error: errorMessage 
      });

      return {
        content: [{ type: 'text', text: `工具执行失败: ${errorMessage}` }],
        isError: true,
      };
    }
  }

  /**
   * 执行 ReAct 循环（非流式）
   */
  private async executeLoop(messages: LLMMessage[], msg: InboundMessage): Promise<{
    answer: string;
    iterations: number;
  }> {
    const toolDefinitions = this.toLLMToolDefinitions(this.tools.getDefinitions());

    let iterations = 0;
    while (iterations < this.config.maxIterations) {
      iterations++;

      const response = await this.config.llmProvider.chat(
        messages,
        toolDefinitions,
        this.config.defaultModel,
        this.config.generationConfig
      );

      // 检查是否有工具调用
      if (!response.hasToolCalls || !response.toolCalls?.length) {
        return { answer: response.content || '', iterations };
      }

      // 执行工具
      for (const tc of response.toolCalls) {
        const result = await this.tools.execute(tc.name, tc.arguments, {
          channel: msg.channel,
          chatId: msg.chatId,
          workspace: this.config.workspace,
          currentDir: this.config.workspace,
          knowledgeBase: this.config.knowledgeBase,
          sendToBus: async () => {},
        });

        messages.push({ role: 'assistant', content: '', toolCalls: [tc] });
        messages.push({
          role: 'tool',
          content: extractToolResultContent(result.content),
          toolCallId: tc.id,
        });
      }
    }

    return { answer: '抱歉，我无法完成您的请求。', iterations };
  }

  /**
   * 检索知识库
   */
  private async retrieveKnowledge(query: string): Promise<string> {
    if (!this.knowledgeRetriever) return '';

    try {
      const results = await this.knowledgeRetriever.retrieve(query);
      if (results.length === 0) return '';

      const contextParts = results.map(r => {
        const doc = r.document;
        return `【${doc.path}】\n${doc.content.slice(0, 500)}...`;
      });

      return `\n\n# 相关知识库内容\n\n${contextParts.join('\n\n---\n\n')}\n`;
    } catch (error) {
      log.warn('知识库检索失败', { error: (error as Error).message });
      return '';
    }
  }

  /**
   * 获取会话历史
   */
  private async getSessionHistory(sessionKey: string): Promise<LLMMessage[]> {
    if (this.sessionStore) {
      const session = this.sessionStore.getOrCreate(sessionKey);
      return session.messages.map((m) => ({
        role: m.role as 'system' | 'user' | 'assistant' | 'tool',
        content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
      }));
    }
    return this.sessionHistory.get(sessionKey) ?? [];
  }

  /**
   * 更新会话历史
   */
  private async updateSessionHistory(sessionKey: string, messages: LLMMessage[]): Promise<void> {
    if (this.sessionStore) {
      const newMessages = messages.slice((this.sessionStore.get(sessionKey)?.messages.length ?? 0));
      for (const msg of newMessages) {
        this.sessionStore.appendMessage(sessionKey, {
          role: msg.role as 'user' | 'assistant',
          content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
          timestamp: Date.now(),
        });
      }
    } else {
      this.sessionHistory.set(sessionKey, messages);
    }
  }

  /**
   * 构建上下文
   */
  private buildContext(
    history: LLMMessage[],
    msg: InboundMessage,
    memories: Array<{ entry: unknown; score: number }>,
    knowledgeContext?: string
  ): LLMMessage[] {
    const messages: LLMMessage[] = [];

    // 系统提示词
    let systemPrompt = this.config.systemPrompt || '';

    // 添加知识库上下文
    if (knowledgeContext) {
      systemPrompt += knowledgeContext;
    }

    // 添加记忆上下文
    if (memories.length > 0) {
      const memoryContext = memories
        .map(m => {
          const entry = m.entry as { content?: string; type?: string };
          return `[${entry.type || '记忆'}] ${entry.content || ''}`;
        })
        .join('\n');
      systemPrompt += `\n\n# 相关记忆\n\n${memoryContext}\n`;
    }

    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }

    // 历史消息
    messages.push(...history);

    // 用户消息
    messages.push({ role: 'user', content: msg.content });

    return messages;
  }

  /**
   * 清除会话
   */
  clearSession(channel: string, chatId: string): void {
    const sessionKey = `${channel}:${chatId}`;
    this.sessionStore?.delete(sessionKey);
    this.sessionHistory.delete(sessionKey);
    log.debug('会话已清除', { sessionKey });
  }

  /**
   * 将内部工具定义转换为 LLM API 格式
   */
  private toLLMToolDefinitions(definitions: Array<{ name: string; description: string; inputSchema: unknown }>) {
    return definitions.map(def => ({
      type: 'function' as const,
      function: {
        name: def.name,
        description: def.description,
        parameters: def.inputSchema as Record<string, unknown>,
      },
    }));
  }
}