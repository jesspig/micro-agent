/**
 * 对话摘要器 (T037 增强)
 *
 * 扩展摘要功能，支持：
 * - 结构化摘要生成
 * - Token 预算控制
 * - 关键信息保留
 */

import { z } from 'zod';
import { getLogger } from '@logtape/logtape';
import type { LLMMessage, LLMProvider, MemoryEntry } from '../../runtime';

const log = getLogger(['memory', 'summarizer']);

/** 摘要类型 */
export type SummaryType = 'session' | 'topic' | 'daily' | 'custom';

/** 待办事项 */
export interface TodoItem {
  /** 是否完成 */
  done: boolean;
  /** 内容 */
  content: string;
  /** 优先级 */
  priority?: 'high' | 'medium' | 'low';
}

/** 时间范围 */
export interface TimeRange {
  /** 开始时间 */
  start: Date;
  /** 结束时间 */
  end: Date;
}

/** 摘要结果 */
export interface Summary {
  /** 摘要 ID */
  id: string;
  /** 摘要类型 */
  type: SummaryType;
  /** 主题 */
  topic: string;
  /** 关键要点 */
  keyPoints: string[];
  /** 决策列表 */
  decisions: string[];
  /** 待办事项 */
  todos: TodoItem[];
  /** 实体列表 */
  entities: string[];
  /** 时间范围 */
  timeRange: TimeRange;
  /** 原始消息数 */
  originalMessageCount: number;
  /** 摘要 Token 数 */
  tokenCount?: number;
  /** 摘要文本 */
  summaryText?: string;
}

/** 摘要器配置 */
export interface SummarizerConfig {
  /** 触发摘要的最小消息数 */
  minMessages: number;
  /** 摘要最大 Token 数 */
  maxTokens: number;
  /** 空闲超时时间（毫秒） */
  idleTimeout: number;
  /** 是否保留原文片段 */
  preserveOriginals: boolean;
  /** 最大保留要点数 */
  maxKeyPoints: number;
  /** 最大保留决策数 */
  maxDecisions: number;
  /** 最大保留待办数 */
  maxTodos: number;
}

/** 摘要生成选项 */
export interface SummarizeOptions {
  /** 摘要类型 */
  type?: SummaryType;
  /** Token 预算 */
  tokenBudget?: number;
  /** 是否包含待办事项 */
  includeTodos?: boolean;
  /** 是否包含实体 */
  includeEntities?: boolean;
  /** 额外上下文 */
  context?: string;
}

/** LLM 摘要响应 Schema */
const SummaryResponseSchema = z.object({
  topic: z.string(),
  keyPoints: z.array(z.string()),
  decisions: z.array(z.string()),
  todos: z.array(z.object({
    content: z.string(),
    done: z.boolean().optional(),
    priority: z.enum(['high', 'medium', 'low']).optional(),
  })).optional(),
  entities: z.array(z.string()).optional(),
  summaryText: z.string().optional(),
});

/** 默认配置 */
const DEFAULT_CONFIG: SummarizerConfig = {
  minMessages: 10,
  maxTokens: 500,
  idleTimeout: 300000,
  preserveOriginals: false,
  maxKeyPoints: 5,
  maxDecisions: 3,
  maxTodos: 5,
};

/**
 * 对话摘要器
 *
 * 功能：
 * - 结构化摘要生成
 * - Token 预算控制
 * - 阈值触发摘要
 * - 空闲超时触发摘要
 */
export class ConversationSummarizer {
  private config: SummarizerConfig;
  private lastActivityTime: number = Date.now();
  private idleCheckInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    private gateway: LLMProvider,
    private store: {
      store: (entry: Omit<MemoryEntry, 'id' | 'createdAt' | 'accessedAt' | 'accessCount'>) => Promise<string>;
    },
    config: Partial<SummarizerConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 检查是否应该生成摘要
   */
  shouldSummarize(messages: LLMMessage[]): boolean {
    return messages.length >= this.config.minMessages;
  }

  /**
   * 生成摘要
   */
  async summarize(
    messages: LLMMessage[],
    options: SummarizeOptions = {}
  ): Promise<Summary> {
    const {
      type = 'session',
      tokenBudget = this.config.maxTokens,
      includeTodos = true,
      includeEntities = true,
      context,
    } = options;

    log.debug('生成对话摘要', {
      messageCount: messages.length,
      type,
      tokenBudget,
    });

    // 构建 prompt
    const systemPrompt = this.buildSystemPrompt({
      includeTodos,
      includeEntities,
      maxKeyPoints: this.config.maxKeyPoints,
      maxDecisions: this.config.maxDecisions,
      maxTodos: this.config.maxTodos,
    });

    const conversationText = this.formatConversation(messages, context);

    // 调用 LLM
    const response = await this.gateway.chat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: conversationText },
      ],
      undefined,
      undefined,
      { maxTokens: tokenBudget, temperature: 0.3 }
    );

    const content = typeof response.content === 'string'
      ? response.content
      : JSON.stringify(response.content);

    // 解析响应
    const summary = this.parseSummary(content, messages, type);

    // 设置 Token 数
    summary.tokenCount = response.usage?.totalTokens;

    log.debug('摘要生成完成', {
      topic: summary.topic,
      keyPoints: summary.keyPoints.length,
      decisions: summary.decisions.length,
      tokenCount: summary.tokenCount,
    });

    return summary;
  }

  /**
   * 存储摘要
   */
  async storeSummary(summary: Summary, sessionKey: string): Promise<string> {
    const id = await this.store.store({
      type: 'summary',
      content: JSON.stringify(summary),
      sessionKey,
      importance: 0.8,
      stability: 1.0,
      status: 'active',
      metadata: {
        tags: ['summary', 'auto-generated', summary.type],
        originalMessageCount: summary.originalMessageCount,
      },
    });

    log.debug('摘要已存储', { id, sessionKey });
    return id;
  }

  /**
   * 启动空闲检查
   */
  startIdleCheck(
    sessionKey: string,
    getMessages: () => LLMMessage[]
  ): void {
    this.stopIdleCheck();

    this.idleCheckInterval = setInterval(async () => {
      const idleTime = Date.now() - this.lastActivityTime;
      if (idleTime >= this.config.idleTimeout) {
        const messages = getMessages();
        if (messages.length >= this.config.minMessages) {
          log.info('空闲超时，生成摘要', { sessionKey, idleTime });
          try {
            const summary = await this.summarize(messages);
            await this.storeSummary(summary, sessionKey);
          } catch (error) {
            log.error('空闲摘要生成失败', { error: String(error) });
          }
        }
        this.stopIdleCheck();
      }
    }, 60000);

    log.debug('空闲检查已启动', { sessionKey });
  }

  /**
   * 停止空闲检查
   */
  stopIdleCheck(): void {
    if (this.idleCheckInterval) {
      clearInterval(this.idleCheckInterval);
      this.idleCheckInterval = null;
    }
  }

  /**
   * 记录活动时间
   */
  recordActivity(): void {
    this.lastActivityTime = Date.now();
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<SummarizerConfig>): void {
    this.config = { ...this.config, ...config };
    log.info('摘要器配置已更新', { config: this.config });
  }

  /**
   * 估算 Token 数
   */
  estimateTokens(messages: LLMMessage[]): number {
    // 简单估算：中文约 1.5 字符/token，英文约 4 字符/token
    let totalChars = 0;
    for (const msg of messages) {
      const content = typeof msg.content === 'string'
        ? msg.content
        : JSON.stringify(msg.content);
      totalChars += content.length;
    }
    return Math.ceil(totalChars / 3);
  }

  /**
   * 压缩消息历史
   *
   * 当消息过多时，保留最近消息并生成摘要
   */
  async compress(
    messages: LLMMessage[],
    keepRecent: number = 5
  ): Promise<{
    summary: Summary;
    recentMessages: LLMMessage[];
  }> {
    if (messages.length <= keepRecent) {
      throw new Error('消息数量不足，无需压缩');
    }

    const toSummarize = messages.slice(0, -keepRecent);
    const recentMessages = messages.slice(-keepRecent);

    const summary = await this.summarize(toSummarize);

    return { summary, recentMessages };
  }

  // ========== 私有方法 ==========

  private buildSystemPrompt(options: {
    includeTodos: boolean;
    includeEntities: boolean;
    maxKeyPoints: number;
    maxDecisions: number;
    maxTodos: number;
  }): string {
    const sections = [
      '你是一个专业的对话摘要助手。请分析对话内容并生成结构化摘要。',
      '',
      '摘要必须包含：',
      `1. topic: 对话主题（一句话概括，不超过20字）`,
      `2. keyPoints: 关键要点列表（最多${options.maxKeyPoints}条）`,
      `3. decisions: 做出的决策列表（最多${options.maxDecisions}条）`,
    ];

    if (options.includeTodos) {
      sections.push(`4. todos: 待办事项列表（最多${options.maxTodos}条，包含content和done状态）`);
    }

    if (options.includeEntities) {
      sections.push('5. entities: 提及的重要实体（人名、地名、项目名等）');
    }

    sections.push('');
    sections.push('输出规则：');
    sections.push('- 关键要点应简洁明了，每条不超过30字');
    sections.push('- 决策应明确具体，标注决策内容');
    sections.push('- 待办事项应包含具体行动');
    sections.push('');
    sections.push('请以 JSON 格式输出摘要。');

    return sections.join('\n');
  }

  private formatConversation(
    messages: LLMMessage[],
    context?: string
  ): string {
    const parts: string[] = [];

    if (context) {
      parts.push(`背景上下文：${context}`, '');
    }

    const conversationText = messages
      .map(m => {
        const content = typeof m.content === 'string'
          ? m.content
          : JSON.stringify(m.content);
        return `${m.role}: ${content}`;
      })
      .join('\n\n');

    parts.push('对话内容：', conversationText);
    parts.push('', '请生成摘要：');

    return parts.join('\n');
  }

  private parseSummary(
    content: string,
    messages: LLMMessage[],
    type: SummaryType
  ): Summary {
    let parsed: z.infer<typeof SummaryResponseSchema> | null = null;

    try {
      // 尝试提取 JSON
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      const jsonStr = jsonMatch?.[1] ?? content;

      const raw = JSON.parse(jsonStr);
      parsed = SummaryResponseSchema.parse(raw);
    } catch (error) {
      log.warn('摘要 JSON 解析失败，使用默认值', { error: String(error) });
    }

    const timestamps = messages
      .map(m => (m as any).timestamp)
      .filter(Boolean) as number[];

    return {
      id: crypto.randomUUID(),
      type,
      topic: parsed?.topic ?? '未命名对话',
      keyPoints: parsed?.keyPoints ?? [],
      decisions: parsed?.decisions ?? [],
      todos: parsed?.todos?.map(t => ({
        done: t.done ?? false,
        content: t.content,
        priority: t.priority,
      })) ?? [],
      entities: parsed?.entities ?? [],
      timeRange: {
        start: timestamps.length > 0 ? new Date(Math.min(...timestamps)) : new Date(),
        end: timestamps.length > 0 ? new Date(Math.max(...timestamps)) : new Date(),
      },
      originalMessageCount: messages.length,
      summaryText: parsed?.summaryText,
    };
  }
}

/**
 * 创建摘要器
 */
export function createSummarizer(
  gateway: LLMProvider,
  store: {
    store: (entry: Omit<MemoryEntry, 'id' | 'createdAt' | 'accessedAt' | 'accessCount'>) => Promise<string>;
  },
  config?: Partial<SummarizerConfig>
): ConversationSummarizer {
  return new ConversationSummarizer(gateway, store, config);
}

// 导出类型和默认配置
export { DEFAULT_CONFIG };
