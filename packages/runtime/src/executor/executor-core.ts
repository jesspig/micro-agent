/**
 * Agent 执行器核心
 *
 * 实现 Function Calling 模式处理消息并协调工具调用
 */

import type {
  InboundMessage,
  OutboundMessage,
  SessionKey,
  LLMMessage,
  LLMResponse,
  GenerationConfig,
  IntentResult,
  HistoryEntry,
} from '@micro-agent/types';

import { ModelRouter, IntentPipeline, type RouteResult, type LLMGateway, type IntentPipeline as IIntentPipeline } from '@micro-agent/providers';
import type { SessionStore } from '@micro-agent/storage';
import type { MessageBus } from '../bus/queue';
import type { ModelConfig } from '@micro-agent/config';
import type { AgentLoopResult, MemoryEntry, CitedResponse, MemoryEntryType } from '../types';
import type { MemoryStore, ConversationSummarizer } from '../memory';
import { getLogger } from '@logtape/logtape';
import { CitationGenerator } from '../citation';

import type { AgentExecutorConfig, ToolRegistryLike } from './types';
import { DEFAULT_CONFIG } from './types';
import { ToolExecutor } from './tool-executor';
import { LoopHandler } from './loop-handler';
import { MemoryManager } from './memory-manager';
import { MessageBuilder } from './message-builder';
import { ContextManager } from './context-manager';
import { safeErrorMsg } from './utils';

const log = getLogger(['executor']);

/**
 * 执行器依赖对象
 */
interface ExecutorDependencies {
  intentPipeline?: IntentPipeline;
  memoryStore?: MemoryStore;
  summarizer?: ConversationSummarizer;
  knowledgeBaseManager?: unknown;
  sessionStore?: SessionStore;
}

/**
 * Agent 执行器核心
 */
export class AgentExecutorCore {
  private running = false;
  private router: ModelRouter;
  private intentPipeline?: IIntentPipeline;
  private toolExecutor: ToolExecutor;
  private loopHandler: LoopHandler;
  private memoryManager: MemoryManager;
  private messageBuilder: MessageBuilder;
  private contextManager: ContextManager;
  private citationGenerator?: CitationGenerator;

  constructor(
    private bus: MessageBus,
    private gateway: LLMGateway,
    private tools: ToolRegistryLike,
    private config: AgentExecutorConfig = DEFAULT_CONFIG,
    deps?: ExecutorDependencies
  ) {
    this.router = new ModelRouter({
      chatModel: config.chatModel || '',
      visionModel: config.visionModel,
      coderModel: config.coderModel,
      intentModel: config.intentModel,
      models: config.availableModels ?? new Map(),
    });
    this.router.setProvider(gateway);

    // 初始化意图识别管道（优先使用依赖注入，其次尝试自动创建）
    if (deps?.intentPipeline) {
      this.intentPipeline = deps.intentPipeline;
      log.info('分阶段意图识别已启用（依赖注入）');
    } else if (config.buildPreflightPrompt && config.buildRoutingPrompt) {
      // 兼容旧版本：自动创建 IntentPipeline（不推荐，应通过依赖注入提供）
      this.intentPipeline = new IntentPipeline({
        provider: gateway,
        intentModel: config.intentModel ?? config.chatModel ?? '',
        buildPreflightPrompt: config.buildPreflightPrompt,
        buildRoutingPrompt: config.buildRoutingPrompt,
      });
      log.info('分阶段意图识别已启用（自动创建 - 建议通过依赖注入提供）');
    }

    // 初始化各个子模块
    this.toolExecutor = new ToolExecutor(tools);
    this.loopHandler = new LoopHandler(config.loopDetection);
    this.memoryManager = new MemoryManager(
      deps?.memoryStore,
      deps?.summarizer,
      {
        memoryEnabled: config.memoryEnabled,
        summarizeThreshold: config.summarizeThreshold,
      }
    );
    this.messageBuilder = new MessageBuilder({
      maxHistoryMessages: config.maxHistoryMessages,
    });
    this.contextManager = new ContextManager(
      deps?.sessionStore,
      { maxHistoryMessages: config.maxHistoryMessages }
    );

    if (deps?.memoryStore) {
      log.info('记忆系统已启用');
    }
    if (deps?.knowledgeBaseManager && config.knowledgeEnabled !== false) {
      log.info('知识库系统已启用');
    }
    if (deps?.sessionStore) {
      log.info('会话持久化已启用');
    }

    // 初始化引用生成器（可选）
    if (config.citationEnabled !== false) {
      this.citationGenerator = new CitationGenerator({
        minConfidence: config.citationMinConfidence ?? 0.5,
        maxCitations: config.citationMaxCount ?? 5,
        maxSnippetLength: 200,
        format: 'numbered',
      });
    }
  }

  /**
   * 启动执行器
   */
  async run(): Promise<void> {
    this.running = true;
    log.info('Agent 执行器已启动 (Function Calling 模式)');

    log.debug('配置详情', {
      maxIterations: this.config.maxIterations,
      maxTokens: this.config.maxTokens,
      temperature: this.config.temperature,
    });

    while (this.running) {
      try {
        const msg = await this.bus.consumeInbound();

        log.info('📥 用户输入', { content: msg.content });

        log.debug('消息详情', {
          channel: msg.channel,
          chatId: msg.chatId,
          senderId: msg.senderId,
          mediaCount: msg.media?.length ?? 0,
        });

        const startTime = Date.now();
        const response = await this.processMessage(msg);
        const elapsed = Date.now() - startTime;

        if (response) {
          await this.bus.publishOutbound(response);
          log.info('📤 回复已发送', { elapsed: `${elapsed}ms` });
        }
      } catch (error) {
        log.error('❌ 处理消息失败', { error: safeErrorMsg(error) });
      }
    }
  }

  /**
   * 停止执行器
   */
  stop(): void {
    this.running = false;
    log.info('Agent 执行器已停止');
  }

  /**
   * 处理单条消息
   */
  async processMessage(msg: InboundMessage): Promise<OutboundMessage | null> {
    const startTime = Date.now();
    
    // 使用 channel:chatId 作为会话标识，实现会话隔离
    const sessionKey = `${msg.channel}:${msg.chatId}` as SessionKey;
    
    // 获取会话历史
    let sessionHistory = await this.contextManager.getSessionHistory(sessionKey);

    // 清理孤立的 tool 消息（没有对应的 assistant+tool_calls）
    sessionHistory = this.messageBuilder.fixToolMessageDependencies(sessionHistory);

    log.info('📝 开始处理消息', { 
      channel: msg.channel, 
      chatId: msg.chatId,
      contentLength: msg.content.length,
      historyLength: sessionHistory.length,
      persistent: !!this.contextManager['sessionStore'],
    });

    // 意图识别（分阶段或旧版）
    let intentResult: IntentResult | null = null;
    let needMemory = true;
    let memoryTypes: string[] = [];

    if (this.intentPipeline) {
      // 使用新的分阶段意图识别
      const hasImage = msg.media && msg.media.length > 0;
      
      // 构建简化的对话历史（最近 5 条，用于上下文重试）
      const recentHistory: HistoryEntry[] = sessionHistory
        .slice(-5)
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .map(m => ({
          role: m.role as 'user' | 'assistant',
          content: typeof m.content === 'string' ? m.content : '',
        }));
      
      intentResult = await this.intentPipeline.analyze(msg.content, hasImage, recentHistory);
      
      if (intentResult) {
        needMemory = intentResult.preflight.needMemory;
        memoryTypes = intentResult.preflight.memoryTypes;
        
        log.info('🎯 意图识别结果', {
          needMemory,
          memoryTypes,
          modelType: intentResult.routing.type,
          reason: intentResult.preflight.reason,
        });
      }
    }

    // 根据意图决定是否检索记忆
    let relevantMemories: MemoryEntry[] = [];
    if (needMemory) {
      log.info('🔍 开始检索记忆', { query: msg.content.slice(0, 100), memoryTypes });
      relevantMemories = await this.memoryManager.retrieveMemories(msg.content, memoryTypes.length > 0 ? memoryTypes as MemoryEntryType[] : undefined);
      
      if (relevantMemories.length > 0) {
        // 统计各类型记忆数量
        const typeStats = relevantMemories.reduce((acc, m) => {
          acc[m.type] = (acc[m.type] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);
        
        // 构建类型分布说明
        const typeDistribution = Object.entries(typeStats)
          .map(([type, count]) => {
            const icons: Record<string, string> = {
              preference: '❤️',
              fact: '📋',
              decision: '✅',
              entity: '👤',
              conversation: '💬',
              summary: '📝',
              other: '📦',
            };
            return `${icons[type] || '📄'} ${type}:${count}`;
          })
          .join(', ');
        
        log.info('🧠 检索到相关记忆', { 
          count: relevantMemories.length,
          searchMode: this.memoryManager['memoryStore']?.getLastSearchMode?.() ?? 'unknown',
          typeDistribution,
          types: relevantMemories.map(m => m.type),
          previews: relevantMemories.map(m => m.content.slice(0, 50) + '...')
        });
      } else {
        log.info('🧠 未检索到相关记忆', {
          searchMode: this.memoryManager['memoryStore']?.getLastSearchMode?.() ?? 'unknown'
        });
      }
    } else {
      log.info('⏭️ 跳过记忆检索', { reason: intentResult?.preflight.reason ?? '意图识别决定' });
    }

    const messages = this.messageBuilder.buildMessages(sessionHistory, msg, relevantMemories);

    // 先执行主流程
    let result: AgentLoopResult;
    try {
      result = await this.runAgentLoop(messages, msg, intentResult);
    } catch (error) {
      log.error('❌ 处理消息异常', { error: safeErrorMsg(error) });
      return this.contextManager.createErrorResponse(msg);
    }

    // 添加 assistant 响应到消息历史
    messages.push({ role: 'assistant', content: result.content });

    // 更新历史记录
    this.contextManager.updateHistory(sessionKey, messages.slice(1));

    // 存储记忆（失败不影响对话返回，但会记录状态并抛出警告）
    try {
      await this.memoryManager.storeMemory(msg, result, sessionKey);
    } catch (error) {
      // 存储失败已记录到 storeMemoryResult，此处仅记录日志
      // 不阻断对话流程，但仍让上层感知到问题
      log.error('⚠️ 记忆存储失败，对话仍正常返回', { 
        error: safeErrorMsg(error),
        sessionKey 
      });
    }

    // 记录活动时间并启动空闲检查
    this.memoryManager.recordActivity(sessionKey, () => this.contextManager['conversationHistory'].get(sessionKey) ?? []);

    // 检查是否需要摘要
    await this.memoryManager.checkAndSummarize(sessionKey, messages);

    const elapsed = Date.now() - startTime;
    log.info('✅ 消息处理完成', { 
      elapsed: `${elapsed}ms`,
      contentLength: result.content?.length ?? 0 
    });

    // 生成带引用的响应（仅当有高置信度文档时）
    const minConfidence = this.config.citationMinConfidence ?? 0.5;
    const docMemories = relevantMemories.filter(m => 
      m.type === 'document' && 
      m.metadata.documentId &&
      (m.metadata.score ?? 0) >= minConfidence
    );
    
    const citedResponse = docMemories.length > 0
      ? this.generateCitedResponse(result.content || '处理完成', docMemories)
      : { content: result.content || '处理完成', citations: [] };

    return {
      channel: msg.channel,
      chatId: msg.chatId,
      content: citedResponse.content,
      media: [],
      metadata: {
        ...msg.metadata,
        citations: citedResponse.citations.length > 0 ? citedResponse.citations : undefined,
      },
    };
  }

  /**
   * 运行 Agent 循环 (Function Calling 模式)
   */
  private async runAgentLoop(messages: LLMMessage[], msg: InboundMessage, intentResult: IntentResult | null): Promise<AgentLoopResult> {
    let iteration = 0;
    const llmTools = this.toolExecutor.getLLMToolDefinitions();

    this.loopHandler.reset();

    let cachedRouteResult: RouteResult | null = null;

    while (iteration < this.config.maxIterations) {
      iteration++;

      const truncatedMessages = this.messageBuilder.truncateMessages(messages);
      const routeResult = this.selectModel(truncatedMessages, msg, intentResult, cachedRouteResult, iteration);
      
      if (iteration === 1) {
        cachedRouteResult = routeResult;
      }

      const response = await this.callLLM(truncatedMessages, routeResult, iteration);

      if (!response.hasToolCalls || !response.toolCalls?.length) {
        return this.loopHandler.buildSuccessResult(response.content, iteration);
      }

      const toolCallResult = await this.handleToolCalls(response.toolCalls, messages, msg, iteration);
      if (toolCallResult) {
        return toolCallResult;
      }

      this.messageBuilder.compressMessages(messages);
    }

    return this.loopHandler.buildMaxIterationsResult(iteration);
  }

  /**
   * 选择模型（路由逻辑）
   */
  private selectModel(
    messages: LLMMessage[],
    msg: InboundMessage,
    intentResult: IntentResult | null,
    cachedResult: RouteResult | null,
    iteration: number
  ): RouteResult {
    if (cachedResult) {
      return cachedResult;
    }

    if (intentResult) {
      const result = this.router.selectByTaskType(intentResult.routing.type);
      log.info('🎯 任务类型识别', { type: intentResult.routing.type, reason: intentResult.routing.reason });
      return result;
    }

    const hasImage = msg.media && msg.media.length > 0;
    const taskType = hasImage ? 'vision' : 'chat';
    const result = this.router.selectByTaskType(taskType);
    log.info('🎯 任务类型识别（兼容模式）', { type: taskType });
    return result;
  }

  /**
   * 调用 LLM
   */
  private async callLLM(
    messages: LLMMessage[],
    routeResult: RouteResult,
    iteration: number
  ): Promise<LLMResponse> {
    const toolModel = this.config.toolModel ?? routeResult.model;
    const generationConfig = this.mergeGenerationConfig(routeResult.config);

    const processedMessages = routeResult.isVision
      ? messages
      : this.messageBuilder.convertToPlainText(messages);

    const messagesWithSystem = this.messageBuilder.ensureSystemPrompt(processedMessages, this.config.systemPrompt);

    log.info('🤖 调用模型', { model: toolModel, reason: routeResult.reason });
    log.debug('路由详情', {
      provider: routeResult.config.id,
      isVision: routeResult.isVision,
      iteration,
    });

    const startTime = Date.now();
    const response = await this.gateway.chat(messagesWithSystem, this.toolExecutor.getLLMToolDefinitions(), toolModel, generationConfig);
    const elapsed = Date.now() - startTime;

    this.logLLMResponse(response, elapsed);
    return response;
  }

  /**
   * 记录 LLM 响应日志
   */
  private logLLMResponse(response: LLMResponse, elapsed: number): void {
    const contentPreview = response.content
      ? response.content.slice(0, 200).replace(/\n/g, ' ') + (response.content.length > 200 ? '...' : '')
      : response.hasToolCalls ? '[调用工具]' : '[无内容]';

    log.info('💬 LLM 响应', {
      model: `${response.usedProvider}/${response.usedModel}`,
      tokens: response.usage ? `${response.usage.promptTokens}→${response.usage.completionTokens}` : 'N/A',
      elapsed: `${elapsed}ms`,
      hasToolCalls: response.hasToolCalls,
      content: contentPreview,
    });
  }

  /**
   * 处理工具调用
   */
  private async handleToolCalls(
    toolCalls: NonNullable<LLMResponse['toolCalls']>,
    messages: LLMMessage[],
    msg: InboundMessage,
    iteration: number
  ): Promise<AgentLoopResult | null> {
    log.info('🛠️ 工具调用计划', {
      count: toolCalls.length,
      tools: toolCalls.map(tc => tc.name),
    });

    this.loopHandler.logToolCallDetails(toolCalls);

    messages.push({
      role: 'assistant',
      content: '',
      toolCalls,
    });

    for (const tc of toolCalls) {
      const loopCheck = this.loopHandler.checkLoopDetection(tc);
      if (loopCheck) {
        return loopCheck;
      }

      const context = this.toolExecutor.createToolContext(
        msg.channel,
        msg.chatId,
        this.config.workspace,
        msg.currentDir || this.config.workspace,
        async (m) => this.bus.publishOutbound(m as OutboundMessage)
      );
      const toolResult = await this.toolExecutor.executeTool(tc.name, tc.arguments, context);
      messages.push({
        role: 'tool',
        content: toolResult,
        toolCallId: tc.id,
      });
    }

    return null;
  }

  /**
   * 生成带引用的响应
   */
  private generateCitedResponse(content: string, memories: MemoryEntry[]): CitedResponse {
    if (!this.citationGenerator) {
      return { content, citations: [] };
    }

    const docMemories = memories.filter(m => m.type === 'document' && m.metadata.documentId);
    
    if (docMemories.length === 0) {
      return { content, citations: [] };
    }

    const citations = this.citationGenerator.generateCitations(docMemories);
    
    if (citations.length === 0) {
      return { content, citations: [] };
    }

    const formattedCitations = this.citationGenerator.formatCitations(citations);
    const citedContent = `${content}\n\n---\n${formattedCitations}`;

    log.debug('📄 生成引用响应', {
      citationCount: citations.length,
      documents: citations.map(c => c.documentTitle ?? c.documentPath),
    });

    return {
      content: citedContent,
      citations,
    };
  }

  /**
   * 合并生成配置
   */
  private mergeGenerationConfig(modelConfig: ModelConfig): GenerationConfig {
    const merged: GenerationConfig = {
      maxTokens: this.config.maxTokens,
      temperature: this.config.temperature,
    };

    if (modelConfig.maxTokens !== undefined) merged.maxTokens = modelConfig.maxTokens;
    if (modelConfig.temperature !== undefined) merged.temperature = modelConfig.temperature;
    if (modelConfig.topK !== undefined) merged.topK = modelConfig.topK;
    if (modelConfig.topP !== undefined) merged.topP = modelConfig.topP;
    if (modelConfig.frequencyPenalty !== undefined) merged.frequencyPenalty = modelConfig.frequencyPenalty;

    return merged;
  }

  /**
   * 清除会话历史
   */
  clearSession(channel: string, chatId: string): void {
    this.contextManager.clearSession(channel, chatId);
  }
}
