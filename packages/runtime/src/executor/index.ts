/**
 * Agent 执行器
 *
 * 实现 Function Calling 模式处理消息并协调工具调用。
 * 使用原生 Function Calling 而非 ReAct JSON 解析。
 */

import type { InboundMessage, OutboundMessage, ToolContext, SessionKey } from '@micro-agent/types';
import type { LLMGateway, LLMMessage, GenerationConfig, MessageContent, LLMToolDefinition, IntentPromptBuilder, UserPromptBuilder, IntentPipeline, IntentResult, PreflightPromptBuilder } from '@micro-agent/providers';
import type { MessageBus } from '../bus/queue';
import type { ModelConfig, LoopDetectionConfig } from '@micro-agent/config';
import type { AgentLoopResult, MemoryEntry, Citation, CitedResponse, MemoryEntryType } from '../types';
import type { MemoryStore, ConversationSummarizer } from '../memory';
import type { SessionStore } from '@micro-agent/storage';
import { classifyMemory } from '../memory';
import { ModelRouter, convertToPlainText, buildUserContent, type RouteResult } from '@micro-agent/providers';
import { LoopDetector } from '../loop-detection';
import { MessageHistoryManager } from '../message-manager';
import { CitationGenerator } from '../citation';
import { getLogger } from '@logtape/logtape';
import { getTracer } from '../logging';
import type { KnowledgeBaseManager } from '../knowledge';

const log = getLogger(['executor']);
const tracer = getTracer();

/** 最大会话数量（防止内存泄漏） */
const MAX_SESSIONS = 1000;

/**
 * 工具注册表接口（避免循环依赖）
 */
export interface ToolRegistryLike {
  getDefinitions(): Array<{ name: string; description: string; inputSchema: unknown }>;
  execute(name: string, input: unknown, ctx: ToolContext): Promise<string>;
}

/**
 * Agent 配置
 */
export interface AgentExecutorConfig {
  /** 工作目录 */
  workspace: string;
  /** 最大迭代次数 */
  maxIterations: number;
  /** 最大 tokens */
  maxTokens: number;
  /** 温度 */
  temperature: number;
  /** 系统提示词 */
  systemPrompt?: string;
  /** 对话模型 */
  chatModel?: string;
  /** 工具调用模型（可选，默认使用 chatModel） */
  toolModel?: string;
  /** 视觉模型，用于图片识别任务 */
  visionModel?: string;
  /** 编程模型，用于代码编写任务 */
  coderModel?: string;
  /** 意图识别模型（不会被路由，始终固定） */
  intentModel?: string;
  /** 可用模型列表 */
  availableModels?: Map<string, ModelConfig[]>;
  /** 意图识别 System Prompt 构建函数（兼容旧版） */
  buildIntentPrompt?: IntentPromptBuilder;
  /** 用户 Prompt 构建函数（兼容旧版） */
  buildUserPrompt?: UserPromptBuilder;
  /** 预处理阶段提示词构建函数 */
  buildPreflightPrompt?: PreflightPromptBuilder;
  /** 模型选择阶段提示词构建函数 */
  buildRoutingPrompt?: PreflightPromptBuilder;
  /** 是否启用分阶段意图识别（默认 false，使用旧版） */
  useIntentPipeline?: boolean;
  /** 循环检测配置 */
  loopDetection?: Partial<LoopDetectionConfig>;
  /** 最大历史消息数 */
  maxHistoryMessages?: number;
  /** 记忆系统是否启用 */
  memoryEnabled?: boolean;
  /** 自动摘要阈值 */
  summarizeThreshold?: number;
  /** 空闲超时时间 */
  idleTimeout?: number;
  /** 知识库是否启用 */
  knowledgeEnabled?: boolean;
  /** 知识库检索结果数量 */
  knowledgeLimit?: number;
  /** 是否启用引用溯源 */
  citationEnabled?: boolean;
  /** 引用最小置信度 */
  citationMinConfidence?: number;
  /** 最大引用数 */
  citationMaxCount?: number;
}

const DEFAULT_CONFIG: AgentExecutorConfig = {
  workspace: './workspace',
  maxIterations: 20,
  maxTokens: 8192,
  temperature: 0.7,
};

/**
 * Agent 执行器
 */
export class AgentExecutor {
  private running = false;
  private sessionStore?: SessionStore;
  private conversationHistory = new Map<string, LLMMessage[]>(); // 兼容模式：内存存储
  private router: ModelRouter;
  private intentPipeline?: IntentPipeline;
  private cachedToolDefinitions: Array<{ name: string; description: string; inputSchema: unknown }> | null = null;
  private cachedLLMTools: LLMToolDefinition[] | null = null;
  private loopDetector: LoopDetector;
  private messageManager: MessageHistoryManager;
  private memoryStore?: MemoryStore;
  private summarizer?: ConversationSummarizer;
  private knowledgeBaseManager?: KnowledgeBaseManager;
  private citationGenerator?: CitationGenerator;

  constructor(
    private bus: MessageBus,
    private gateway: LLMGateway,
    private tools: ToolRegistryLike,
    private config: AgentExecutorConfig = DEFAULT_CONFIG,
    memoryStore?: MemoryStore,
    summarizer?: ConversationSummarizer,
    knowledgeBaseManager?: KnowledgeBaseManager,
    sessionStore?: SessionStore
  ) {
    this.router = new ModelRouter({
      chatModel: config.chatModel || '',
      visionModel: config.visionModel,
      coderModel: config.coderModel,
      intentModel: config.intentModel,
      models: config.availableModels ?? new Map(),
      buildIntentPrompt: config.buildIntentPrompt,
      buildUserPrompt: config.buildUserPrompt,
    });
    this.router.setProvider(gateway);

    // 初始化意图识别管道（如果启用）
    if (config.useIntentPipeline && config.buildPreflightPrompt && config.buildRoutingPrompt) {
      const { IntentPipeline } = require('@micro-agent/providers');
      this.intentPipeline = new IntentPipeline({
        provider: gateway,
        intentModel: config.intentModel ?? config.chatModel ?? '',
        buildPreflightPrompt: config.buildPreflightPrompt,
        buildRoutingPrompt: config.buildRoutingPrompt,
      });
      log.info('分阶段意图识别已启用');
    }

    // 初始化循环检测器
    this.loopDetector = new LoopDetector({
      enabled: config.loopDetection?.enabled ?? true,
      warningThreshold: config.loopDetection?.warningThreshold ?? 3,
      criticalThreshold: config.loopDetection?.criticalThreshold ?? 5,
      globalCircuitBreaker: config.maxIterations + 10,
    });

    // 初始化消息管理器
    this.messageManager = new MessageHistoryManager({
      maxMessages: config.maxHistoryMessages ?? 50,
      truncationStrategy: 'sliding',
      preserveSystemMessages: true,
      preserveRecentCount: 10,
    });

    // 注入记忆系统（可选）
    this.memoryStore = memoryStore;
    this.summarizer = summarizer;
    this.knowledgeBaseManager = knowledgeBaseManager;
    this.sessionStore = sessionStore;

    if (memoryStore) {
      log.info('记忆系统已启用');
    }
    if (knowledgeBaseManager && config.knowledgeEnabled !== false) {
      log.info('知识库系统已启用');
    }
    if (sessionStore) {
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
        log.error('❌ 处理消息失败', { error: this.safeErrorMsg(error) });
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
    
    // 获取会话历史（优先使用 SessionStore，否则使用内存）
    let sessionHistory: LLMMessage[];
    if (this.sessionStore) {
      const session = this.sessionStore.getOrCreate(sessionKey);
      sessionHistory = session.messages.map(m => ({
        role: m.role,
        content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
      }));
    } else {
      sessionHistory = this.conversationHistory.get(sessionKey) ?? [];
    }

    log.info('📝 开始处理消息', { 
      channel: msg.channel, 
      chatId: msg.chatId,
      contentLength: msg.content.length,
      historyLength: sessionHistory.length,
      persistent: !!this.sessionStore,
    });

    // 意图识别（分阶段或旧版）
    let intentResult: IntentResult | null = null;
    let needMemory = true;
    let memoryTypes: MemoryEntryType[] = [];

    if (this.intentPipeline) {
      // 使用新的分阶段意图识别
      const hasImage = msg.media && msg.media.length > 0;
      intentResult = await this.intentPipeline.analyze(msg.content, hasImage);
      
      needMemory = intentResult.preflight.needMemory;
      memoryTypes = intentResult.preflight.memoryTypes as MemoryEntryType[];
      
      log.info('🎯 意图识别结果', {
        needMemory,
        memoryTypes,
        modelType: intentResult.routing.type,
        reason: intentResult.preflight.reason,
      });
    }

    // 根据意图决定是否检索记忆
    let relevantMemories: MemoryEntry[] = [];
    if (needMemory) {
      log.info('🔍 开始检索记忆', { query: msg.content.slice(0, 100), memoryTypes });
      relevantMemories = await this.retrieveMemories(msg.content, memoryTypes.length > 0 ? memoryTypes : undefined);
      
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
          searchMode: this.memoryStore?.getLastSearchMode?.() ?? 'unknown',
          typeDistribution,
          types: relevantMemories.map(m => m.type),
          previews: relevantMemories.map(m => m.content.slice(0, 50) + '...')
        });
      } else {
        log.info('🧠 未检索到相关记忆', {
          searchMode: this.memoryStore?.getLastSearchMode?.() ?? 'unknown'
        });
      }
    } else {
      log.info('⏭️ 跳过记忆检索', { reason: intentResult?.preflight.reason ?? '意图识别决定' });
    }

    const messages = this.buildMessages(sessionHistory, msg, relevantMemories);

    // 先执行主流程
    let result: AgentLoopResult;
    try {
      result = await this.runAgentLoop(messages, msg);
    } catch (error) {
      log.error('❌ 处理消息异常', { error: this.safeErrorMsg(error) });
      return this.createErrorResponse(msg);
    }

    // 添加 assistant 响应到消息历史
    messages.push({ role: 'assistant', content: result.content });

    // 更新历史记录
    this.updateHistory(sessionKey, messages.slice(1));

    // 存储记忆（失败不影响对话返回，但会记录状态并抛出警告）
    try {
      await this.storeMemory(msg, result, sessionKey);
    } catch (error) {
      // 存储失败已记录到 storeMemoryResult，此处仅记录日志
      // 不阻断对话流程，但仍让上层感知到问题
      log.error('⚠️ 记忆存储失败，对话仍正常返回', { 
        error: this.safeErrorMsg(error),
        sessionKey 
      });
    }

    // 记录活动时间并启动空闲检查
    if (this.summarizer) {
      this.summarizer.recordActivity();
      this.summarizer.startIdleCheck(sessionKey, () => this.conversationHistory.get(sessionKey) ?? []);
    }

    // 检查是否需要摘要
    await this.checkAndSummarize(sessionKey, messages);

    const elapsed = Date.now() - startTime;
    log.info('✅ 消息处理完成', { 
      elapsed: `${elapsed}ms`,
      contentLength: result.content?.length ?? 0 
    });

    // 生成带引用的响应（仅当有高置信度文档时）
    const docMemories = relevantMemories.filter(m => 
      m.type === 'document' && 
      m.metadata.documentId &&
      (m.metadata.score ?? 0) >= 0.7  // 只保留高置信度文档
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
   * 检索相关记忆（包含知识库）
   * 
   * 使用双层检索架构统一检索对话记忆和知识库内容
   * @param query 查询文本
   * @param memoryTypes 可选的记忆类型过滤
   */
  private async retrieveMemories(query: string, memoryTypes?: MemoryEntryType[]): Promise<MemoryEntry[]> {
    const results: MemoryEntry[] = [];

    // 使用 MemoryStore 的双层检索（统一检索记忆和知识库）
    if (this.memoryStore) {
      try {
        // 构建过滤条件
        const filter = memoryTypes && memoryTypes.length > 0
          ? { type: memoryTypes }
          : undefined;

        // 使用 dualLayerSearch 统一检索
        const memories = await this.memoryStore.dualLayerSearch(query, 8, 200, filter);
        results.push(...memories);
        log.debug('记忆检索完成', { count: memories.length, filter });
      } catch (error) {
        log.warn('记忆检索失败', { error: this.safeErrorMsg(error) });
      }
    } else {
      log.debug('MemoryStore 为空，跳过检索');
    }

    return results;
  }

  /**
   * 存储记忆结果
   */
  private storeMemoryResult: { success: boolean; error?: string } = { success: true };

  /**
   * 存储记忆
   *
   * 包含最多 2 次重试机制，存储失败时会向上传递错误状态。
   * 使用分类器自动识别记忆类型。
   */
  private async storeMemory(msg: InboundMessage, result: AgentLoopResult, sessionKey: string): Promise<void> {
    if (!this.memoryStore) {
      log.debug('记忆系统未启用，跳过存储');
      return;
    }

    // 使用分类器自动分类用户输入
    const classification = await classifyMemory(msg.content);
    const memoryType = classification.type;

    // 构建记忆内容
    const content = `用户: ${msg.content}\n助手: ${result.content}`;

    const entry: MemoryEntry = {
      id: crypto.randomUUID(),
      sessionId: sessionKey,
      type: memoryType,
      content: content,
      metadata: {
        channel: msg.channel,
        classification: {
          confidence: classification.confidence,
          matchedPatterns: classification.matchedPatterns,
        },
        tags: [memoryType, 'conversation'],
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // 带重试的存储操作
    const maxRetries = 2;
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      try {
        await this.memoryStore.store(entry);
        
        log.info('💾 记忆已存储', {
          id: entry.id,
          sessionKey,
          type: entry.type,
          confidence: classification.confidence.toFixed(2),
          matched: classification.matchedPatterns.length > 0 ? classification.matchedPatterns.slice(0, 2) : undefined,
          attempt: attempt > 1 ? attempt : undefined,
          userMsg: msg.content.slice(0, 50) + '...',
          assistantMsg: result.content?.slice(0, 50) + '...'
        });
        
        this.storeMemoryResult = { success: true };
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        log.warn('记忆存储失败', { 
          attempt, 
          maxRetries: maxRetries + 1, 
          error: this.safeErrorMsg(error) 
        });
        
        // 非最后一次尝试，等待后重试
        if (attempt <= maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 100 * attempt));
        }
      }
    }

    // 所有重试都失败，记录错误状态并向上传递
    const errorMsg = lastError?.message ?? '未知错误';
    this.storeMemoryResult = { success: false, error: errorMsg };
    
    log.error('❌ 记忆存储最终失败', { 
      sessionKey, 
      error: errorMsg,
      retries: maxRetries 
    });
    
    // 向上抛出错误，让调用方感知
    throw new Error(`记忆存储失败（已重试 ${maxRetries} 次）: ${errorMsg}`);
  }

  /**
   * 检查并触发摘要
   */
  private async checkAndSummarize(sessionKey: string, messages: LLMMessage[]): Promise<void> {
    if (!this.memoryStore || !this.summarizer) return;

    // 检查是否启用记忆
    if (this.config.memoryEnabled === false) return;

    const threshold = this.config.summarizeThreshold ?? 20;
    
    if (messages.length >= threshold && this.summarizer.shouldSummarize(messages)) {
      try {
        log.info('📝 触发自动摘要', { messageCount: messages.length, threshold });
        
        const summary = await this.summarizer.summarize(messages);
        
        const entry: MemoryEntry = {
          id: summary.id,
          sessionId: sessionKey,
          type: 'summary',
          content: JSON.stringify(summary),
          metadata: {
            tags: ['summary', 'auto'],
          },
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        await this.memoryStore.store(entry);
        log.info('✅ 摘要已存储', { id: summary.id, topic: summary.topic });
      } catch (error) {
        log.warn('摘要生成失败', { error: this.safeErrorMsg(error) });
      }
    }
  }

  /**
   * 构建消息列表
   */
  private buildMessages(history: LLMMessage[], msg: InboundMessage, memories?: MemoryEntry[]): LLMMessage[] {
    const messages: LLMMessage[] = [];

    // 构建系统提示（包含记忆上下文）
    const systemPrompt = this.buildSystemPrompt(memories);
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }

    messages.push(...history);

    const userContent: MessageContent = buildUserContent(msg.content, msg.media);
    messages.push({ role: 'user', content: userContent });

    if (msg.media && msg.media.length > 0) {
      log.info('📎 媒体', { count: msg.media.length });
    }

    return messages;
  }

  /**
   * 构建系统提示（包含记忆上下文）
   */
  private buildSystemPrompt(memories?: MemoryEntry[]): string {
    let prompt = this.config.systemPrompt ?? '';

    // 注入记忆上下文
    if (memories && memories.length > 0) {
      const memoryContext = this.formatMemoryContext(memories);
      prompt = prompt 
        ? `${prompt}\n\n${memoryContext}` 
        : memoryContext;
      
      log.info('💉 记忆已注入系统提示', { 
        memoryCount: memories.length,
        contextLength: memoryContext.length 
      });
    }

    return prompt;
  }

  /**
   * 格式化记忆上下文
   */
  private formatMemoryContext(memories: MemoryEntry[]): string {
    const lines = ['<relevant-memories>', '以下是相关的历史记忆，仅供参考：'];
    
    for (const m of memories) {
      const timeLabel = m.type === 'summary' ? '[摘要]' : '[对话]';
      const preview = m.content.length > 200 ? m.content.slice(0, 200) + '...' : m.content;
      lines.push(`- ${timeLabel} ${preview}`);
    }
    
    lines.push('</relevant-memories>');
    
    log.debug('📝 格式化记忆上下文', { 
      memoryCount: memories.length,
      types: memories.map(m => m.type),
      totalLength: lines.join('\n').length
    });
    
    return lines.join('\n');
  }

  /**
   * 生成带引用的响应
   * @param content 响应内容
   * @param memories 检索结果
   * @returns 带引用的响应
   */
  private generateCitedResponse(content: string, memories: MemoryEntry[]): CitedResponse {
    if (!this.citationGenerator) {
      return { content, citations: [] };
    }

    // 过滤出文档类型的记忆
    const docMemories = memories.filter(m => m.type === 'document' && m.metadata.documentId);
    
    if (docMemories.length === 0) {
      return { content, citations: [] };
    }

    const citations = this.citationGenerator.generateCitations(docMemories);
    
    if (citations.length === 0) {
      return { content, citations: [] };
    }

    // 在响应末尾添加引用
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
   * 运行 Agent 循环 (Function Calling 模式)
   */
  private async runAgentLoop(messages: LLMMessage[], msg: InboundMessage): Promise<AgentLoopResult> {
    let iteration = 0;
    const llmTools = this.getLLMToolDefinitions();
    
    // 重置循环检测器
    this.loopDetector.reset();
    
    // 缓存第一次迭代选择的模型
    let cachedRouteResult: RouteResult | null = null;

    while (iteration < this.config.maxIterations) {
      iteration++;

      // 消息历史裁剪
      const truncatedMessages = this.messageManager.truncate(messages);

      const routeResult: RouteResult = cachedRouteResult ?? await this.selectModel(truncatedMessages, msg.media);
      // 第一次迭代后缓存模型选择结果
      if (iteration === 1) {
        cachedRouteResult = routeResult;
      }
      
      // 工具调用使用专用模型（如果配置）
      const toolModel = this.config.toolModel ?? routeResult.model;
      const generationConfig = this.mergeGenerationConfig(routeResult.config);

      const processedMessages = routeResult.isVision
        ? truncatedMessages
        : convertToPlainText(truncatedMessages);

      // 构建系统提示词
      const messagesWithSystem = this.ensureSystemPrompt(processedMessages);

      log.info('🤖 调用模型', { model: toolModel, reason: routeResult.reason });

      log.debug('路由详情', {
        provider: routeResult.config.id,
        isVision: routeResult.isVision,
        iteration,
      });

      const llmStartTime = Date.now();
      const response = await this.gateway.chat(messagesWithSystem, llmTools, toolModel, generationConfig);
      const llmElapsed = Date.now() - llmStartTime;

      // 构建 LLM 响应内容摘要
      const contentPreview = response.content
        ? response.content.slice(0, 200).replace(/\n/g, ' ') + (response.content.length > 200 ? '...' : '')
        : response.hasToolCalls ? '[调用工具]' : '[无内容]';

      log.info('💬 LLM 响应', {
        model: `${response.usedProvider}/${response.usedModel}`,
        tokens: response.usage ? `${response.usage.promptTokens}→${response.usage.completionTokens}` : 'N/A',
        elapsed: `${llmElapsed}ms`,
        hasToolCalls: response.hasToolCalls,
        content: contentPreview,
      });

      // 记录详细的 LLM 调用（debug 级别，避免重复显示）
      log.debug('🤖 LLM 调用详情', {
        model: `${response.usedProvider}/${response.usedModel}`,
        messages: messagesWithSystem.length,
        tools: llmTools?.length ?? 0,
        duration: `${llmElapsed}ms`,
        tokens: response.usage,
        content: response.content,
        hasToolCalls: response.hasToolCalls,
      });

      // 无工具调用，返回结果
      if (!response.hasToolCalls || !response.toolCalls?.length) {
        log.info('✅ 任务完成', { 
          content: response.content.slice(0, 500),
          fullLength: response.content.length,
        });
        return {
          content: response.content,
          iterations: iteration,
          loopDetected: false,
        };
      }

      // 记录工具调用计划
      log.info('🛠️ 工具调用计划', {
        count: response.toolCalls.length,
        tools: response.toolCalls.map(tc => tc.name),
      });

      // 详细记录每个工具调用的参数
      for (const tc of response.toolCalls) {
        const args = tc.arguments as Record<string, unknown>;
        const argEntries = Object.entries(args || {});
        const argStr = argEntries.length > 0
          ? argEntries.map(([k, v]) => {
              let valStr: string;
              if (typeof v === 'string') {
                valStr = v.length > 50 ? `"${v.slice(0, 50)}..."` : `"${v}"`;
              } else {
                valStr = JSON.stringify(v);
              }
              return `${k}=${valStr}`;
            }).join(', ')
          : '无参数';
        
        log.info(`📞 调用工具: ${tc.name}`, { args: argStr });
      }

      // 添加 assistant 消息（包含工具调用）
      messages.push({
        role: 'assistant',
        content: response.content,
        toolCalls: response.toolCalls,
      });

      // 执行工具调用
      for (const tc of response.toolCalls) {
        // 记录工具调用
        const callKey = this.loopDetector.recordCall(tc.name, tc.arguments);
        
        // 检测循环
        const loopCheck = this.loopDetector.detectLoop();
        if (loopCheck) {
          log.warn('⚠️ 循环检测', { reason: loopCheck.reason, severity: loopCheck.severity });
          
          // 临界级别终止循环
          if (loopCheck.severity === 'critical') {
            return {
              content: `检测到循环行为，终止执行: ${loopCheck.reason}`,
              iterations: iteration,
              loopDetected: true,
              loopReason: loopCheck.reason,
            };
          }
          
          // 警告级别继续执行，记录日志
          log.info('⚠️ 循环警告，继续执行', { reason: loopCheck.reason });
        }

        // 执行工具（工具调用的日志在 executeTool 内部统一处理）
        const toolResult = await this.executeTool(tc.name, tc.arguments, msg);

        // 添加工具结果消息
        messages.push({
          role: 'tool',
          content: toolResult,
          toolCallId: tc.id,
        });
      }

      // 压缩工具结果
      const compressedMessages = this.messageManager.compressToolResults(messages);
      messages.length = 0;
      messages.push(...compressedMessages);
    }

    log.warn('⚠️ 达到最大迭代次数', { maxIterations: this.config.maxIterations });
    return {
      content: '达到最大迭代次数，任务未完成',
      iterations: iteration,
      loopDetected: false,
    };
  }

  /**
   * 确保消息列表包含系统提示词
   */
  private ensureSystemPrompt(messages: LLMMessage[]): LLMMessage[] {
    const hasSystem = messages.some(m => m.role === 'system');
    if (hasSystem || !this.config.systemPrompt) {
      return messages;
    }
    return [
      { role: 'system', content: this.config.systemPrompt },
      ...messages,
    ];
  }

  /**
   * 获取工具定义
   */
  private getToolDefinitions(): Array<{ name: string; description: string; inputSchema: unknown }> {
    if (!this.cachedToolDefinitions) {
      this.cachedToolDefinitions = this.tools.getDefinitions();
    }
    return this.cachedToolDefinitions;
  }

  /**
   * 获取 LLM 工具定义（Function Calling 格式）
   */
  private getLLMToolDefinitions(): LLMToolDefinition[] {
    if (!this.cachedLLMTools) {
      const defs = this.getToolDefinitions();
      this.cachedLLMTools = defs.map(def => ({
        type: 'function' as const,
        function: {
          name: def.name,
          description: def.description,
          parameters: def.inputSchema as Record<string, unknown>,
        },
      }));
    }
    return this.cachedLLMTools;
  }

  /**
   * 执行单个工具
   */
  private async executeTool(name: string, input: unknown, msg: InboundMessage): Promise<string> {
    const startTime = Date.now();
    let success = true;
    let errorMsg: string | undefined;
    
    try {
      // 执行工具
      const result = await this.tools.execute(name, input, this.createContext(msg));
      
      const elapsed = Date.now() - startTime;
      
      // 记录工具调用结果（使用 tracer 格式化）
      tracer.logToolCall(name, input, result, elapsed, true);
      
      // 在 CLI 中显示简洁的工具结果
      const resultPreview = this.formatResultPreview(result);
      log.info(`✅ 工具完成: ${name}`, {
        duration: `${elapsed}ms`,
        result: resultPreview,
      });
      
      return result;
    } catch (error) {
      success = false;
      errorMsg = this.safeErrorMsg(error);
      const elapsed = Date.now() - startTime;
      
      tracer.logToolCall(name, input, '', elapsed, false, errorMsg);
      log.error(`❌ 工具失败: ${name}`, { error: errorMsg, duration: `${elapsed}ms` });
      
      return JSON.stringify({
        error: true,
        message: '工具执行失败: ' + errorMsg,
        tool: name
      });
    }
  }

  /**
   * 更新会话历史
   */
  private updateHistory(sessionKey: SessionKey, history: LLMMessage[]): void {
    const trimmed = this.messageManager.truncate(history);
    
    // 优先使用 SessionStore 持久化
    if (this.sessionStore) {
      // 清空现有消息并追加新消息
      this.sessionStore.clear(sessionKey);
      for (const msg of trimmed) {
        this.sessionStore.appendMessage(sessionKey, {
          role: msg.role as 'user' | 'assistant' | 'system',
          content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
          timestamp: Date.now(),
        });
      }
    } else {
      // 回退到内存存储
      this.conversationHistory.set(sessionKey, trimmed);
      this.trimSessions();
    }
  }

  /**
   * 清理过期会话（仅内存模式）
   */
  private trimSessions(): void {
    if (this.conversationHistory.size <= MAX_SESSIONS) return;

    const keysToDelete = Array.from(this.conversationHistory.keys())
      .slice(0, this.conversationHistory.size - MAX_SESSIONS);

    for (const key of keysToDelete) {
      this.conversationHistory.delete(key);
    }

    log.debug('清理过期会话', { count: keysToDelete.length });
  }

  /**
   * 创建错误响应
   */
  private createErrorResponse(msg: InboundMessage): OutboundMessage {
    return {
      channel: msg.channel,
      chatId: msg.chatId,
      content: '处理消息时发生内部错误，请稍后重试',
      media: [],
      metadata: msg.metadata,
    };
  }

  /**
   * 创建工具上下文
   */
  createContext(msg: InboundMessage): ToolContext {
    return {
      channel: msg.channel,
      chatId: msg.chatId,
      workspace: this.config.workspace,
      currentDir: msg.currentDir || this.config.workspace,
      sendToBus: async (m) => this.bus.publishOutbound(m as OutboundMessage),
    };
  }

  /**
   * 清除会话历史
   */
  clearSession(channel: string, chatId: string): void {
    const sessionKey = `${channel}:${chatId}` as SessionKey;
    
    if (this.sessionStore) {
      this.sessionStore.delete(sessionKey);
    } else {
      this.conversationHistory.delete(sessionKey);
    }
    
    log.debug('会话已清除', { sessionKey });
  }

  /**
   * 选择模型（仅第一次迭代调用）
   */
  private async selectModel(
    messages: LLMMessage[],
    media: string[] | undefined
  ): Promise<RouteResult> {
    const plainMessages = convertToPlainText(messages) as Array<{ role: string; content: string }>;
    const taskType = await this.router.analyzeTaskType(plainMessages, media);
    log.info('🎯 任务类型识别', { type: taskType.type, reason: taskType.reason });
    return this.router.selectByTaskType(taskType.type);
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
   * 安全的错误消息（脱敏）
   */
  private safeErrorMsg(error: unknown): string {
    if (!(error instanceof Error)) return '未知错误';

    let msg = error.message;
    msg = msg.replace(/[A-Z]:\\[^\s]+/gi, '[路径]');
    msg = msg.replace(/[a-zA-Z0-9_-]{20,}/g, '[密钥]');

    return msg;
  }

  /**
   * 格式化工具输入参数预览
   */
  private formatInputPreview(input: unknown, maxLength = 50): string {
    if (input === null || input === undefined) return '';
    
    if (typeof input === 'object') {
      const entries = Object.entries(input as Record<string, unknown>);
      if (entries.length === 0) return '';
      
      const parts = entries.slice(0, 2).map(([key, value]) => {
        let valStr: string;
        if (typeof value === 'string') {
          valStr = value.length > 20 ? `${value.slice(0, 20)}...` : value;
        } else if (typeof value === 'object' && value !== null) {
          valStr = '{...}';
        } else {
          valStr = String(value);
        }
        return `${key}=${valStr}`;
      });
      
      let result = parts.join(', ');
      if (entries.length > 2) {
        result += ` +${entries.length - 2}`;
      }
      return result.length > maxLength ? result.slice(0, maxLength) + '...' : result;
    }
    
    return '';
  }

  /**
   * 格式化工具结果预览
   */
  private formatResultPreview(result: string, maxLength = 100): string {
    if (!result) return '\x1b[90m(空)\x1b[0m';
    
    // 尝试解析 JSON 结果
    try {
      const parsed = JSON.parse(result);
      if (typeof parsed === 'object' && parsed !== null) {
        if (parsed.error) {
          return `\x1b[31m❌ ${parsed.message || '执行失败'}\x1b[0m`;
        }
        // 显示关键字段
        const keys = Object.keys(parsed);
        if (keys.length > 0) {
          const preview = keys.slice(0, 3).join(', ');
          return `\x1b[32m{${preview}${keys.length > 3 ? ', ...' : ''}}\x1b[0m`;
        }
      }
    } catch {
      // 非 JSON
    }
    
    // 普通文本截取
    const cleanResult = result.replace(/\n/g, ' ').trim();
    if (cleanResult.length > maxLength) {
      return `\x1b[90m${cleanResult.slice(0, maxLength)}...\x1b[0m`;
    }
    return `\x1b[90m${cleanResult}\x1b[0m`;
  }
}