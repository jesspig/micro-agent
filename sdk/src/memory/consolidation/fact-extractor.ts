/**
 * 事实提取器 (T036)
 *
 * 从对话历史中提取关键事实、决策和偏好。
 */

import { z } from 'zod';
import { getLogger } from '@logtape/logtape';
import type { LLMProvider, LLMMessage, MemoryType } from '../../runtime';

const log = getLogger(['memory', 'consolidation', 'fact-extractor']);

/** 提取的事实类型 */
export type FactType = 'fact' | 'decision' | 'preference' | 'entity' | 'todo';

/** 提取的事实 */
export interface ExtractedFact {
  /** 事实 ID */
  id: string;
  /** 事实类型 */
  type: FactType;
  /** 事实内容 */
  content: string;
  /** 置信度 */
  confidence: number;
  /** 来源消息索引 */
  sourceMessageIndex: number;
  /** 相关实体 */
  entities: string[];
  /** 时间戳 */
  timestamp: Date;
  /** 是否已去重 */
  deduplicated?: boolean;
}

/** 提取选项 */
export interface ExtractionOptions {
  /** 最小置信度阈值 */
  minConfidence?: number;
  /** 是否启用去重 */
  enableDedup?: boolean;
  /** 去重相似度阈值 */
  dedupThreshold?: number;
  /** 最大提取数量 */
  maxFacts?: number;
  /** 是否提取待办事项 */
  extractTodos?: boolean;
  /** 是否提取偏好 */
  extractPreferences?: boolean;
}

/** 提取结果 */
export interface ExtractionResult {
  /** 提取的事实列表 */
  facts: ExtractedFact[];
  /** 原始消息数 */
  originalMessageCount: number;
  /** 提取统计 */
  stats: {
    total: number;
    byType: Record<FactType, number>;
    deduplicated: number;
    lowConfidence: number;
  };
}

/** LLM 提取响应 Schema */
const LLMExtractionSchema = z.object({
  facts: z.array(z.object({
    type: z.enum(['fact', 'decision', 'preference', 'entity', 'todo']),
    content: z.string(),
    confidence: z.number().min(0).max(1),
    sourceIndex: z.number().optional(),
    entities: z.array(z.string()).optional(),
  })),
});

/** 事实提取器配置 */
export interface FactExtractorConfig {
  /** LLM 提供者 */
  llmProvider: LLMProvider;
  /** 默认最小置信度 */
  defaultMinConfidence?: number;
  /** 默认去重阈值 */
  defaultDedupThreshold?: number;
  /** 批处理大小 */
  batchSize?: number;
}

/**
 * 事实提取器
 *
 * 功能：
 * - 从对话历史中提取事实
 * - 自动分类存储
 * - 支持去重
 */
export class FactExtractor {
  private config: Required<Omit<FactExtractorConfig, 'llmProvider'>> & { llmProvider: LLMProvider };

  constructor(config: FactExtractorConfig) {
    this.config = {
      llmProvider: config.llmProvider,
      defaultMinConfidence: config.defaultMinConfidence ?? 0.7,
      defaultDedupThreshold: config.defaultDedupThreshold ?? 0.85,
      batchSize: config.batchSize ?? 10,
    };
  }

  /**
   * 从对话历史提取事实
   */
  async extract(
    messages: LLMMessage[],
    options: ExtractionOptions = {}
  ): Promise<ExtractionResult> {
    const {
      minConfidence = this.config.defaultMinConfidence,
      enableDedup = true,
      dedupThreshold = this.config.defaultDedupThreshold,
      maxFacts = 50,
      extractTodos = true,
      extractPreferences = true,
    } = options;

    if (messages.length === 0) {
      return this.emptyResult(0);
    }

    log.info('开始提取事实', { messageCount: messages.length });

    // 使用 LLM 提取
    const facts = await this.extractWithLLM(
      messages,
      { extractTodos, extractPreferences }
    );

    // 过滤低置信度
    const filteredFacts = facts.filter(f => f.confidence >= minConfidence);
    const lowConfidenceCount = facts.length - filteredFacts.length;

    // 去重
    let deduplicatedFacts = filteredFacts;
    let deduplicatedCount = 0;
    if (enableDedup) {
      const { facts: deduped, removed } = this.deduplicateFacts(
        filteredFacts,
        dedupThreshold
      );
      deduplicatedFacts = deduped;
      deduplicatedCount = removed;
    }

    // 限制数量
    const limitedFacts = deduplicatedFacts.slice(0, maxFacts);

    // 统计
    const stats = this.computeStats(limitedFacts, facts.length, lowConfidenceCount, deduplicatedCount);

    log.info('事实提取完成', {
      total: facts.length,
      filtered: limitedFacts.length,
      byType: stats.byType,
    });

    return {
      facts: limitedFacts,
      originalMessageCount: messages.length,
      stats,
    };
  }

  /**
   * 批量提取
   */
  async extractBatch(
    messageGroups: LLMMessage[][],
    options: ExtractionOptions = {}
  ): Promise<ExtractionResult[]> {
    const results: ExtractionResult[] = [];

    for (let i = 0; i < messageGroups.length; i += this.config.batchSize) {
      const batch = messageGroups.slice(i, i + this.config.batchSize);
      const batchResults = await Promise.all(
        batch.map(messages => this.extract(messages, options))
      );
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * 快速提取（不使用 LLM）
   *
   * 使用规则进行快速提取，适用于简单场景
   */
  extractQuick(messages: LLMMessage[]): ExtractedFact[] {
    const facts: ExtractedFact[] = [];

    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];
      const content = typeof message.content === 'string'
        ? message.content
        : JSON.stringify(message.content);

      // 规则提取
      const extracted = this.extractByRules(content, i);
      facts.push(...extracted);
    }

    return facts;
  }

  // ========== 私有方法 ==========

  private async extractWithLLM(
    messages: LLMMessage[],
    options: { extractTodos: boolean; extractPreferences: boolean }
  ): Promise<ExtractedFact[]> {
    const systemPrompt = this.buildSystemPrompt(options);
    const conversationText = this.formatConversation(messages);

    try {
      const response = await this.config.llmProvider.chat(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `请从以下对话中提取关键事实：\n\n${conversationText}` },
        ],
        undefined,
        undefined,
        { temperature: 0.1 }
      );

      const content = typeof response.content === 'string'
        ? response.content
        : JSON.stringify(response.content);

      const parsed = LLMExtractionSchema.safeParse(JSON.parse(content));

      if (!parsed.success) {
        log.warn('LLM 响应解析失败', { error: parsed.error.message });
        return [];
      }

      return parsed.data.facts.map((f, index) => ({
        id: crypto.randomUUID(),
        type: f.type as FactType,
        content: f.content,
        confidence: f.confidence,
        sourceMessageIndex: f.sourceIndex ?? 0,
        entities: f.entities ?? [],
        timestamp: new Date(),
      }));
    } catch (error) {
      log.error('LLM 提取失败', { error: String(error) });
      // 回退到规则提取
      return this.extractQuick(messages);
    }
  }

  private buildSystemPrompt(options: {
    extractTodos: boolean;
    extractPreferences: boolean;
  }): string {
    const types = [
      '- fact: 客观事实陈述（如：用户是软件工程师）',
      '- decision: 做出的决策或选择（如：决定使用 TypeScript）',
      '- entity: 实体信息（如：电话号码、邮箱地址）',
    ];

    if (options.extractPreferences) {
      types.push('- preference: 用户偏好（如：喜欢简洁的回答风格）');
    }

    if (options.extractTodos) {
      types.push('- todo: 待办事项或任务（如：需要修复某个 bug）');
    }

    return `你是一个专业的信息提取专家。请从对话中提取关键事实、决策和偏好。

提取类型：
${types.join('\n')}

提取规则：
1. 只提取确定性的信息，不要推测
2. 每个事实应该是独立且完整的
3. 标注置信度（0-1）
4. 如果涉及实体（人名、地名、组织等），请列出

请以 JSON 格式输出，格式如下：
{
  "facts": [
    {
      "type": "fact|decision|preference|entity|todo",
      "content": "提取的事实内容",
      "confidence": 0.9,
      "sourceIndex": 0,
      "entities": ["相关实体"]
    }
  ]
}`;
  }

  private formatConversation(messages: LLMMessage[]): string {
    return messages
      .map((m, i) => {
        const content = typeof m.content === 'string'
          ? m.content
          : JSON.stringify(m.content);
        return `[${i}] ${m.role}: ${content}`;
      })
      .join('\n\n');
  }

  private extractByRules(content: string, messageIndex: number): ExtractedFact[] {
    const facts: ExtractedFact[] = [];
    const now = new Date();

    // 偏好规则
    const preferencePatterns = [
      { pattern: /我(喜欢|愛|prefer|like)\s*(.+)/i, type: 'preference' as FactType },
      { pattern: /我(不喜欢|讨厌|hate|dislike)\s*(.+)/i, type: 'preference' as FactType },
    ];

    for (const { pattern, type } of preferencePatterns) {
      const match = content.match(pattern);
      if (match) {
        facts.push({
          id: crypto.randomUUID(),
          type,
          content: match[0],
          confidence: 0.8,
          sourceMessageIndex: messageIndex,
          entities: [],
          timestamp: now,
        });
      }
    }

    // 决策规则
    const decisionPatterns = [
      /我们?决定\s*(.+)/i,
      /选择\s*(.+)/i,
      /确定\s*(.+)/i,
    ];

    for (const pattern of decisionPatterns) {
      const match = content.match(pattern);
      if (match) {
        facts.push({
          id: crypto.randomUUID(),
          type: 'decision',
          content: match[0],
          confidence: 0.85,
          sourceMessageIndex: messageIndex,
          entities: [],
          timestamp: now,
        });
      }
    }

    // 待办规则
    const todoPatterns = [
      /需要\s*(.+)/i,
      /待办\s*(.+)/i,
      /TODO:\s*(.+)/i,
    ];

    for (const pattern of todoPatterns) {
      const match = content.match(pattern);
      if (match) {
        facts.push({
          id: crypto.randomUUID(),
          type: 'todo',
          content: match[1],
          confidence: 0.75,
          sourceMessageIndex: messageIndex,
          entities: [],
          timestamp: now,
        });
      }
    }

    return facts;
  }

  private deduplicateFacts(
    facts: ExtractedFact[],
    threshold: number
  ): { facts: ExtractedFact[]; removed: number } {
    const uniqueFacts: ExtractedFact[] = [];
    let removed = 0;

    for (const fact of facts) {
      let isDuplicate = false;

      for (const existing of uniqueFacts) {
        if (this.computeSimilarity(fact.content, existing.content) >= threshold) {
          isDuplicate = true;
          removed++;
          break;
        }
      }

      if (!isDuplicate) {
        uniqueFacts.push({ ...fact, deduplicated: false });
      }
    }

    return { facts: uniqueFacts, removed };
  }

  private computeSimilarity(a: string, b: string): number {
    // 简单的 Jaccard 相似度
    const wordsA = new Set(a.toLowerCase().split(/\s+/));
    const wordsB = new Set(b.toLowerCase().split(/\s+/));

    const intersection = new Set(Array.from(wordsA).filter(x => wordsB.has(x)));
    const union = new Set([...Array.from(wordsA), ...Array.from(wordsB)]);

    return intersection.size / union.size;
  }

  private computeStats(
    facts: ExtractedFact[],
    total: number,
    lowConfidence: number,
    deduplicated: number
  ): ExtractionResult['stats'] {
    const byType: Record<FactType, number> = {
      fact: 0,
      decision: 0,
      preference: 0,
      entity: 0,
      todo: 0,
    };

    for (const fact of facts) {
      byType[fact.type]++;
    }

    return {
      total,
      byType,
      deduplicated,
      lowConfidence,
    };
  }

  private emptyResult(messageCount: number): ExtractionResult {
    return {
      facts: [],
      originalMessageCount: messageCount,
      stats: {
        total: 0,
        byType: { fact: 0, decision: 0, preference: 0, entity: 0, todo: 0 },
        deduplicated: 0,
        lowConfidence: 0,
      },
    };
  }
}

/**
 * 创建事实提取器
 */
export function createFactExtractor(config: FactExtractorConfig): FactExtractor {
  return new FactExtractor(config);
}
