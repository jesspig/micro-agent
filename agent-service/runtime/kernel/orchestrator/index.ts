/**
 * Agent 编排器
 *
 * 协调 Planner、ExecutionEngine、ContextManager 等核心组件。
 * 支持标准模式和流式模式。
 */

import type { LLMMessage, LLMProvider, GenerationConfig } from '../../../types/provider';
import type { InboundMessage, OutboundMessage } from '../../../types/message';
import type { ToolRegistry } from '../../capability/tool-system';
import type { MemoryManager } from '../../capability/memory';
import type { SessionStore } from '../../../infrastructure/database';
import type { KnowledgeRetriever } from '../../capability/knowledge';
import type { ToolContext } from '../../../types/tool';
import { getLogger } from '@logtape/logtape';

const log = getLogger(['kernel', 'orchestrator']);

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
    toolContext?: Partial<ToolContext>
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

      // 执行流式 ReAct 循环
      const result = await this.executeLoopWithStream(messages, msg, callbacks, toolContext);

      // 记录 LLM 输出
      if (result.answer) {
        log.info('LLM 响应', { 
          sessionKey,
          content: result.answer.slice(0, 500),
          toolCalls: result.toolCalls?.length ?? 0,
        });
      }

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
      return session.messages.map(m => ({
        role: m.role,
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
   * 执行 ReAct 循环
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
          sendToBus: async () => {},
        });

        messages.push({ role: 'assistant', content: '', toolCalls: [tc] });
        messages.push({
          role: 'tool',
          content: result.content ? JSON.stringify(result.content) : result,
          toolCallId: tc.id,
        });
      }
    }

    return { answer: '抱歉，我无法完成您的请求。', iterations };
  }

  /**
   * 执行流式 ReAct 循环
   */
  private async executeLoopWithStream(
    messages: LLMMessage[],
    msg: InboundMessage,
    callbacks: StreamCallbacks,
    toolContext?: Partial<ToolContext>
  ): Promise<{ answer: string; iterations: number }> {
    const toolDefinitions = this.toLLMToolDefinitions(this.tools.getDefinitions());
    let finalAnswer = '';

    let iterations = 0;
    while (iterations < this.config.maxIterations) {
      iterations++;

      const response = await this.config.llmProvider.chat(
        messages,
        toolDefinitions,
        this.config.defaultModel,
        this.config.generationConfig
      );

      // 记录每次 LLM 响应（包括中间响应）
      log.info('LLM 思考', { 
        iteration: iterations,
        content: response.content?.slice(0, 200),
        toolCalls: response.toolCalls?.map(tc => tc.name) ?? [],
      });

      // 检查是否有工具调用
      if (!response.hasToolCalls || !response.toolCalls?.length) {
        finalAnswer = response.content || '';
        
        // 流式发送最终响应
        for (let i = 0; i < finalAnswer.length; i += 20) {
          const chunk = finalAnswer.slice(i, i + 20);
          await callbacks.onChunk(chunk);
          await new Promise(resolve => setTimeout(resolve, 10));
        }
        
        return { answer: finalAnswer, iterations };
      }

      // 执行工具调用
      for (const tc of response.toolCalls) {
        log.info('执行工具调用', { name: tc.name, arguments: tc.arguments });

        const ctx: ToolContext = {
          channel: msg.channel,
          chatId: msg.chatId,
          workspace: this.config.workspace,
          currentDir: toolContext?.currentDir ?? this.config.workspace,
          sendToBus: async () => {},
        };

        try {
          const result = await this.tools.execute(tc.name, tc.arguments, ctx);
          const resultContent = typeof result.content === 'string'
            ? result.content
            : JSON.stringify(result.content);

          log.info('工具执行完成', { name: tc.name, resultLength: resultContent.length });

          messages.push({ role: 'assistant', content: '', toolCalls: [tc] });
          messages.push({
            role: 'tool',
            content: resultContent,
            toolCallId: tc.id,
          });
        } catch (error) {
          const errorText = error instanceof Error ? error.message : String(error);
          log.error('工具执行失败', { name: tc.name, error: errorText });

          messages.push({ role: 'assistant', content: '', toolCalls: [tc] });
          messages.push({
            role: 'tool',
            content: `错误: ${errorText}`,
            toolCallId: tc.id,
          });
        }
      }
    }

    // 超过最大迭代次数
    const timeoutMsg = '抱歉，我无法完成您的请求，请尝试简化您的问题。';
    await callbacks.onChunk(timeoutMsg);
    return { answer: timeoutMsg, iterations };
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