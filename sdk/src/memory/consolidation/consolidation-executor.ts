/**
 * 整合执行器 (T038)
 *
 * 协调整合流程：压缩 → 提取 → 存储
 * 确保长期记忆增长不超过原始消息数的 20%
 */

import { z } from 'zod';
import { getLogger } from '@logtape/logtape';
import type { LLMProvider, LLMMessage, MemoryEntry, MemoryType } from '../../runtime';
import { ConsolidationTrigger, createConsolidationTrigger } from './consolidation-trigger';
import { IdleDetector, createIdleDetector } from './idle-detector';
import { FactExtractor, createFactExtractor, ExtractedFact } from './fact-extractor';
import { ConversationSummarizer, createSummarizer, Summary } from './summarizer';

const log = getLogger(['memory', 'consolidation', 'executor']);

/** 整合执行器配置 Schema */
export const ConsolidationExecutorConfigSchema = z.object({
  /** 消息阈值 */
  messageThreshold: z.number().min(5).max(200).default(20),
  /** 空闲超时（毫秒） */
  idleTimeout: z.number().min(10000).max(3600000).default(300000),
  /** 最大记忆增长率 */
  maxMemoryGrowthRate: z.number().min(0.1).max(1).default(0.2),
  /** 摘要 Token 预算 */
  summaryTokenBudget: z.number().min(100).max(10000).default(500),
  /** 是否启用自动整合 */
  autoConsolidate: z.boolean().default(true),
  /** 最小提取置信度 */
  minExtractionConfidence: z.number().min(0).max(1).default(0.7),
  /** 是否提取待办 */
  extractTodos: z.boolean().default(true),
  /** 是否提取偏好 */
  extractPreferences: z.boolean().default(true),
});

/** 整合执行器配置 */
export type ConsolidationExecutorConfig = z.infer<typeof ConsolidationExecutorConfigSchema>;

/** 整合结果 */
export interface ConsolidationResult {
  /** 是否成功 */
  success: boolean;
  /** 原始消息数 */
  originalMessageCount: number;
  /** 生成的记忆数 */
  memoryCount: number;
  /** 记忆增长率 */
  memoryGrowthRate: number;
  /** 摘要 */
  summary: Summary | null;
  /** 提取的事实 */
  facts: ExtractedFact[];
  /** 存储的记忆 ID */
  storedMemoryIds: string[];
  /** 错误信息 */
  errors: string[];
  /** 执行时间（毫秒） */
  duration: number;
}

/** 整合统计 */
export interface ConsolidationStats {
  /** 总整合次数 */
  totalConsolidations: number;
  /** 总处理消息数 */
  totalMessagesProcessed: number;
  /** 总生成记忆数 */
  totalMemoriesGenerated: number;
  /** 平均增长率 */
  averageGrowthRate: number;
  /** 最后整合时间 */
  lastConsolidationTime: Date | null;
}

/** 消息提供者 */
export type MessageProvider = () => LLMMessage[] | Promise<LLMMessage[]>;

/**
 * 整合执行器
 *
 * 协调整合流程：
 * 1. 触发器检测整合条件
 * 2. 生成对话摘要
 * 3. 提取关键事实
 * 4. 存储到长期记忆
 * 5. 控制记忆增长
 */
export class ConsolidationExecutor {
  private config: ConsolidationExecutorConfig;
  private trigger: ConsolidationTrigger;
  private idleDetector: IdleDetector;
  private factExtractor: FactExtractor;
  private summarizer: ConversationSummarizer;
  private store: {
    store: (entry: Omit<MemoryEntry, 'id' | 'createdAt' | 'accessedAt' | 'accessCount'>) => Promise<string>;
    storeBatch?: (entries: Array<Omit<MemoryEntry, 'id' | 'createdAt' | 'accessedAt' | 'accessCount'>>) => Promise<string[]>;
  };
  private stats: ConsolidationStats = {
    totalConsolidations: 0,
    totalMessagesProcessed: 0,
    totalMemoriesGenerated: 0,
    averageGrowthRate: 0,
    lastConsolidationTime: null,
  };
  private messageProvider: MessageProvider | null = null;
  private currentSessionKey: string;

  constructor(
    llmProvider: LLMProvider,
    store: {
      store: (entry: Omit<MemoryEntry, 'id' | 'createdAt' | 'accessedAt' | 'accessCount'>) => Promise<string>;
      storeBatch?: (entries: Array<Omit<MemoryEntry, 'id' | 'createdAt' | 'accessedAt' | 'accessCount'>>) => Promise<string[]>;
    },
    config: Partial<ConsolidationExecutorConfig> = {},
    sessionKey: string = 'default'
  ) {
    this.config = ConsolidationExecutorConfigSchema.parse(config);
    this.store = store;
    this.currentSessionKey = sessionKey;

    // 创建子组件
    this.idleDetector = createIdleDetector({
      idleTimeout: this.config.idleTimeout,
      enabled: this.config.autoConsolidate,
    });

    this.trigger = createConsolidationTrigger({
      messageThreshold: this.config.messageThreshold,
      enableIdleTrigger: this.config.autoConsolidate,
      enableThresholdTrigger: this.config.autoConsolidate,
    });

    this.factExtractor = createFactExtractor({
      llmProvider,
    });

    this.summarizer = createSummarizer(llmProvider, store, {
      maxTokens: this.config.summaryTokenBudget,
    });

    // 设置触发器与空闲检测器的关联
    this.trigger.setIdleDetector(this.idleDetector);

    // 注册触发回调
    this.trigger.onTrigger(event => this.handleTrigger(event));
  }

  /**
   * 设置消息提供者
   */
  setMessageProvider(provider: MessageProvider): void {
    this.messageProvider = provider;
  }

  /**
   * 设置会话键
   */
  setSessionKey(sessionKey: string): void {
    this.currentSessionKey = sessionKey;
    this.trigger.setSessionKey(sessionKey);
    this.idleDetector.reset();
  }

  /**
   * 启动整合执行器
   */
  start(): void {
    this.idleDetector.start();
    log.info('整合执行器已启动', {
      sessionKey: this.currentSessionKey,
      messageThreshold: this.config.messageThreshold,
      idleTimeout: this.config.idleTimeout,
    });
  }

  /**
   * 停止整合执行器
   */
  stop(): void {
    this.idleDetector.stop();
    this.trigger.stop();
    this.summarizer.stopIdleCheck();
    log.info('整合执行器已停止');
  }

  /**
   * 记录新消息
   */
  recordMessage(): void {
    this.trigger.recordMessage();
  }

  /**
   * 手动触发整合
   */
  async consolidate(
    messages?: LLMMessage[],
    sessionKey?: string
  ): Promise<ConsolidationResult> {
    const startTime = Date.now();
    const targetSessionKey = sessionKey ?? this.currentSessionKey;

    // 获取消息
    const targetMessages = messages ?? await this.messageProvider?.() ?? [];
    if (targetMessages.length === 0) {
      return this.emptyResult(0, Date.now() - startTime);
    }

    log.info('开始整合', {
      messageCount: targetMessages.length,
      sessionKey: targetSessionKey,
    });

    const errors: string[] = [];
    const storedIds: string[] = [];

    try {
      // 步骤 1: 生成摘要
      const summary = await this.summarizer.summarize(targetMessages, {
        type: 'session',
        tokenBudget: this.config.summaryTokenBudget,
        includeTodos: this.config.extractTodos,
      });

      // 步骤 2: 提取事实
      const extractionResult = await this.factExtractor.extract(targetMessages, {
        minConfidence: this.config.minExtractionConfidence,
        extractTodos: this.config.extractTodos,
        extractPreferences: this.config.extractPreferences,
      });

      // 步骤 3: 计算记忆增长并控制
      const potentialMemories = extractionResult.facts.length + 1; // +1 for summary
      const maxMemories = Math.ceil(targetMessages.length * this.config.maxMemoryGrowthRate);

      // 按重要性筛选
      const selectedFacts = this.selectFactsByImportance(
        extractionResult.facts,
        maxMemories - 1 // 为摘要留一个位置
      );

      // 步骤 4: 存储记忆
      // 存储摘要
      const summaryId = await this.store.store({
        type: 'summary',
        content: JSON.stringify(summary),
        sessionKey: targetSessionKey,
        importance: 0.8,
        stability: 1.0,
        status: 'active',
        metadata: {
          tags: ['summary', 'consolidated'],
          originalMessageCount: targetMessages.length,
        },
      });
      storedIds.push(summaryId);

      // 存储事实
      for (const fact of selectedFacts) {
        const id = await this.store.store({
          type: this.mapFactTypeToMemoryType(fact.type),
          content: fact.content,
          sessionKey: targetSessionKey,
          importance: fact.confidence,
          stability: 1.0,
          status: 'active',
          metadata: {
            tags: ['fact', 'extracted', fact.type],
            confidence: fact.confidence,
          },
        });
        storedIds.push(id);
      }

      const memoryCount = storedIds.length;
      const growthRate = memoryCount / targetMessages.length;

      // 更新统计
      this.updateStats(targetMessages.length, memoryCount);

      const duration = Date.now() - startTime;

      log.info('整合完成', {
        originalMessages: targetMessages.length,
        memoriesGenerated: memoryCount,
        growthRate: growthRate.toFixed(2),
        duration,
      });

      return {
        success: true,
        originalMessageCount: targetMessages.length,
        memoryCount,
        memoryGrowthRate: growthRate,
        summary,
        facts: selectedFacts,
        storedMemoryIds: storedIds,
        errors,
        duration,
      };
    } catch (error) {
      errors.push(String(error));
      log.error('整合失败', { error: String(error) });

      return {
        success: false,
        originalMessageCount: targetMessages.length,
        memoryCount: 0,
        memoryGrowthRate: 0,
        summary: null,
        facts: [],
        storedMemoryIds: [],
        errors,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * 获取统计信息
   */
  getStats(): ConsolidationStats {
    return { ...this.stats };
  }

  /**
   * 重置统计
   */
  resetStats(): void {
    this.stats = {
      totalConsolidations: 0,
      totalMessagesProcessed: 0,
      totalMemoriesGenerated: 0,
      averageGrowthRate: 0,
      lastConsolidationTime: null,
    };
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<ConsolidationExecutorConfig>): void {
    this.config = { ...this.config, ...ConsolidationExecutorConfigSchema.partial().parse(config) };

    // 更新子组件配置
    this.idleDetector.updateConfig({
      idleTimeout: this.config.idleTimeout,
    });

    this.trigger.updateConfig({
      messageThreshold: this.config.messageThreshold,
      enableIdleTrigger: this.config.autoConsolidate,
      enableThresholdTrigger: this.config.autoConsolidate,
    });

    log.info('整合执行器配置已更新', this.config);
  }

  // ========== 私有方法 ==========

  private async handleTrigger(event: {
    strategy: string;
    messageCount: number;
    sessionKey: string;
  }): Promise<void> {
    log.info('触发整合', {
      strategy: event.strategy,
      messageCount: event.messageCount,
    });

    const result = await this.consolidate();

    if (!result.success) {
      log.error('自动整合失败', { errors: result.errors });
    }
  }

  private selectFactsByImportance(
    facts: ExtractedFact[],
    maxCount: number
  ): ExtractedFact[] {
    if (facts.length <= maxCount) {
      return facts;
    }

    // 按置信度和类型优先级排序
    const typePriority: Record<string, number> = {
      decision: 3,
      preference: 2,
      fact: 1,
      entity: 1,
      todo: 0,
    };

    return facts
      .slice() // 创建副本
      .sort((a, b) => {
        // 先按类型优先级
        const priorityDiff = (typePriority[b.type] ?? 0) - (typePriority[a.type] ?? 0);
        if (priorityDiff !== 0) return priorityDiff;

        // 再按置信度
        return b.confidence - a.confidence;
      })
      .slice(0, maxCount);
  }

  private mapFactTypeToMemoryType(factType: string): MemoryType {
    const mapping: Record<string, MemoryType> = {
      fact: 'fact',
      decision: 'decision',
      preference: 'preference',
      entity: 'entity',
      todo: 'fact', // todos 作为事实存储
    };
    return mapping[factType] ?? 'other';
  }

  private updateStats(messagesProcessed: number, memoriesGenerated: number): void {
    this.stats.totalConsolidations++;
    this.stats.totalMessagesProcessed += messagesProcessed;
    this.stats.totalMemoriesGenerated += memoriesGenerated;
    this.stats.lastConsolidationTime = new Date();

    // 计算平均增长率
    this.stats.averageGrowthRate =
      this.stats.totalMemoriesGenerated / this.stats.totalMessagesProcessed;
  }

  private emptyResult(messageCount: number, duration: number): ConsolidationResult {
    return {
      success: true,
      originalMessageCount: messageCount,
      memoryCount: 0,
      memoryGrowthRate: 0,
      summary: null,
      facts: [],
      storedMemoryIds: [],
      errors: [],
      duration,
    };
  }
}

/**
 * 创建整合执行器
 */
export function createConsolidationExecutor(
  llmProvider: LLMProvider,
  store: {
    store: (entry: Omit<MemoryEntry, 'id' | 'createdAt' | 'accessedAt' | 'accessCount'>) => Promise<string>;
    storeBatch?: (entries: Array<Omit<MemoryEntry, 'id' | 'createdAt' | 'accessedAt' | 'accessCount'>>) => Promise<string[]>;
  },
  config?: Partial<ConsolidationExecutorConfig>,
  sessionKey?: string
): ConsolidationExecutor {
  return new ConsolidationExecutor(llmProvider, store, config, sessionKey);
}
