/**
 * 对话摘要器
 */

import type { LLMMessage, LLMProvider } from '../../../types/provider';
import type { MemoryEntry } from '../../../types/memory';
import { getLogger } from '@logtape/logtape';

const log = getLogger(['memory', 'summarizer']);

/** 摘要结果 */
export interface Summary {
  id: string;
  topic: string;
  keyPoints: string[];
  decisions: string[];
  todos: Array<{ done: boolean; content: string }>;
  entities: string[];
  timeRange: {
    start: Date;
    end: Date;
  };
  originalMessageCount: number;
}

/** 摘要器配置 */
export interface SummarizerConfig {
  /** 触发摘要的最小消息数 */
  minMessages: number;
  /** 摘要最大长度 */
  maxLength: number;
  /** 空闲超时时间（毫秒） */
  idleTimeout: number;
}

/** 默认配置 */
const DEFAULT_CONFIG: SummarizerConfig = {
  minMessages: 20,
  maxLength: 2000,
  idleTimeout: 300000,
};

/**
 * 对话摘要器
 *
 * 功能：
 * - 阈值触发摘要
 * - 空闲超时触发摘要
 * - 生成结构化摘要
 */
export class ConversationSummarizer {
  private lastActivityTime: number = Date.now();
  private idleCheckInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    private gateway: LLMProvider,
    private store: { store: (entry: Omit<MemoryEntry, 'id' | 'createdAt' | 'accessedAt' | 'accessCount'>) => Promise<string> },
    private config: SummarizerConfig = DEFAULT_CONFIG
  ) {}

  /**
   * 检查是否应该生成摘要
   */
  shouldSummarize(messages: LLMMessage[]): boolean {
    return messages.length >= this.config.minMessages;
  }

  /**
   * 生成摘要
   */
  async summarize(messages: LLMMessage[]): Promise<Summary> {
    log.debug('生成对话摘要', { messageCount: messages.length });

    const prompt = this.buildSummaryPrompt(messages);
    const response = await this.gateway.chat([
      { role: 'user', content: this.getSystemPrompt() },
      { role: 'user', content: prompt },
    ]);

    const summary = this.parseSummary(response.content ?? '', messages);
    log.debug('摘要生成完成', { topic: summary.topic });

    return summary;
  }

  /**
   * 存储摘要
   */
  async storeSummary(summary: Summary, sessionKey: string): Promise<void> {
    await this.store.store({
      type: 'summary',
      content: JSON.stringify(summary),
      sessionKey,
      importance: 0.8,
      metadata: {
        tags: ['summary', 'auto-generated'],
        originalMessageCount: summary.originalMessageCount,
      },
    });
    log.debug('摘要已存储', { id: summary.id });
  }

  /**
   * 启动空闲检查
   */
  startIdleCheck(sessionKey: string, getMessages: () => LLMMessage[]): void {
    this.stopIdleCheck();

    this.idleCheckInterval = setInterval(async () => {
      const idleTime = Date.now() - this.lastActivityTime;
      if (idleTime >= this.config.idleTimeout) {
        const messages = getMessages();
        if (messages.length > 0) {
          log.info('空闲超时，生成摘要', { sessionKey, idleTime });
          const summary = await this.summarize(messages);
          await this.storeSummary(summary, sessionKey);
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

  private getSystemPrompt(): string {
    return `你是一个专业的对话摘要助手。请分析对话内容并生成结构化摘要。

摘要必须包含：
1. topic: 对话主题（一句话概括）
2. keyPoints: 关键要点列表
3. decisions: 做出的决策列表
4. todos: 待办事项列表
5. entities: 提及的实体

请以 JSON 格式输出摘要。`;
  }

  private buildSummaryPrompt(messages: LLMMessage[]): string {
    const conversationText = messages
      .map(m => {
        const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
        return `${m.role}: ${content}`;
      })
      .join('\n\n');

    return `请总结以下对话：

${conversationText}

请以 JSON 格式输出摘要。`;
  }

  private parseSummary(content: string, messages: LLMMessage[]): Summary {
    let parsed: Partial<Summary> = {};

    try {
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      const jsonStr = jsonMatch?.[1] ?? content;
      parsed = JSON.parse(jsonStr);
    } catch {
      log.warn('摘要 JSON 解析失败');
    }

    return {
      id: crypto.randomUUID(),
      topic: parsed.topic ?? '未命名对话',
      keyPoints: parsed.keyPoints ?? [],
      decisions: parsed.decisions ?? [],
      todos: parsed.todos ?? [],
      entities: parsed.entities ?? [],
      timeRange: {
        start: new Date(),
        end: new Date(),
      },
      originalMessageCount: messages.length,
    };
  }
}
