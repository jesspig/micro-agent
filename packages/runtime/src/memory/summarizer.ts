/**
 * 对话摘要器
 */

import type { LLMMessage, LLMGateway } from '@micro-agent/providers';
import type { Summary, MemoryEntry } from '../types';
import type { MemoryStore } from './store';
import { getLogger } from '@logtape/logtape';

const log = getLogger(['memory', 'summarizer']);

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
  idleTimeout: 300000, // 5 分钟
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
  private pendingMessages: LLMMessage[] = [];

  constructor(
    private gateway: LLMGateway,
    private memoryStore: MemoryStore,
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
    log.info('生成对话摘要', { messageCount: messages.length });

    const prompt = this.buildSummaryPrompt(messages);
    const response = await this.gateway.chat([
      { role: 'system', content: this.getSystemPrompt() },
      { role: 'user', content: prompt },
    ]);

    const summary = this.parseSummary(response.content, messages);
    log.info('摘要生成完成', { topic: summary.topic, keyPoints: summary.keyPoints.length });

    return summary;
  }

  /**
   * 存储摘要
   */
  async storeSummary(summary: Summary, sessionId: string): Promise<void> {
    const entry: MemoryEntry = {
      id: summary.id,
      sessionId,
      type: 'summary',
      content: JSON.stringify(summary),
      metadata: {
        tags: ['summary', 'auto-generated'],
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await this.memoryStore.store(entry);
    log.info('摘要已存储', { id: summary.id, sessionId });
  }

  /**
   * 启动空闲检查
   */
  startIdleCheck(sessionId: string, getMessages: () => LLMMessage[]): void {
    this.stopIdleCheck();

    this.idleCheckInterval = setInterval(async () => {
      const idleTime = Date.now() - this.lastActivityTime;
      if (idleTime >= this.config.idleTimeout) {
        const messages = getMessages();
        if (messages.length > 0) {
          log.info('空闲超时，生成摘要', { sessionId, idleTime });
          const summary = await this.summarize(messages);
          await this.storeSummary(summary, sessionId);
        }
        this.stopIdleCheck();
      }
    }, 60000); // 每分钟检查一次

    log.debug('空闲检查已启动', { sessionId });
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

  // ========== 私有方法 ==========

  private getSystemPrompt(): string {
    return `你是一个专业的对话摘要助手。请分析对话内容并生成结构化摘要。

摘要必须包含：
1. topic: 对话主题（一句话概括）
2. keyPoints: 关键要点列表
3. decisions: 做出的决策列表
4. todos: 待办事项列表（包含 done 状态和 content 内容）
5. entities: 提及的实体（人名、地点、项目等）

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

请以 JSON 格式输出摘要，包含以下字段：
{
  "topic": "对话主题",
  "keyPoints": ["要点1", "要点2"],
  "decisions": ["决策1", "决策2"],
  "todos": [{"done": false, "content": "待办事项"}],
  "entities": ["实体1", "实体2"]
}`;
  }

  private parseSummary(content: string, messages: LLMMessage[]): Summary {
    // 尝试解析 JSON
    let parsed: Partial<Summary> = {};

    try {
      // 提取 JSON 块
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      const jsonStr = jsonMatch?.[1] ?? content;
      parsed = JSON.parse(jsonStr);
    } catch {
      log.warn('摘要 JSON 解析失败，使用默认值');
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
