/**
 * 记忆分类器
 *
 * 基于 LLM 的智能记忆分类器，支持所有 MemoryType 类型。
 */

import { z } from 'zod';
import { getLogger } from '@logtape/logtape';
import type { MemoryType, LLMProvider } from '../../runtime';

const log = getLogger(['memory', 'classifier', 'llm']);

/** 分类结果 */
export interface ClassificationResult {
  /** 记忆类型 */
  type: MemoryType;
  /** 置信度分数 (0-1) */
  confidence: number;
  /** 匹配的模式/规则 */
  matchedPatterns: string[];
  /** 分类来源 */
  source: 'rule' | 'llm';
}

/** 分类结果 Schema */
export const ClassificationResultSchema = z.object({
  type: z.enum([
    'preference',
    'fact',
    'decision',
    'entity',
    'conversation',
    'summary',
    'document',
    'other',
  ]),
  confidence: z.number().min(0).max(1),
  matchedPatterns: z.array(z.string()),
  source: z.enum(['rule', 'llm']),
});

/** 分类选项 */
export interface ClassifyOptions {
  /** 是否使用 LLM（默认 true） */
  useLLM?: boolean;
  /** 规则分类置信度阈值，低于此值时调用 LLM */
  llmThreshold?: number;
  /** 额外上下文 */
  context?: string;
  /** LLM 提供者 */
  llmProvider?: LLMProvider;
  /** 是否启用规则预分类 */
  useRules?: boolean;
}

/** 分类规则定义 */
interface ClassificationRule {
  type: MemoryType;
  keywords: RegExp[];
  patterns: RegExp[];
  priority: number;
  description: string;
}

/** Zod Schema 用于 LLM 输出解析 */
const ClassificationSchema = z.object({
  type: z.enum([
    'preference',
    'fact',
    'decision',
    'entity',
    'conversation',
    'summary',
    'document',
    'other',
  ]),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().optional(),
});

/** 分类规则库 - 按优先级排序 */
const CLASSIFICATION_RULES: ClassificationRule[] = [
  {
    type: 'preference',
    keywords: [
      /喜欢|愛|like|love|prefer|enjoy|favor/i,
      /讨厌|討厭|hate|dislike|avoid/i,
      /想要|需要|want|need|wish|desire/i,
      /习惯|習慣|habit|usually|typically/i,
      /风格|風格|style|format/i,
    ],
    patterns: [
      /我(喜欢|愛|讨厌|想要|需要|习惯).*/i,
      /please (don't|do not|avoid)/i,
      /I (prefer|like|hate|want|need).*/i,
      /(建议|建議|recommend).*用.*/i,
    ],
    priority: 5,
    description: '用户偏好、喜好、习惯',
  },
  {
    type: 'decision',
    keywords: [
      /决定|決定|decided|decision|determine/i,
      /选择|選擇|choose|selected|opted/i,
      /同意|approve|agreed|confirmed/i,
      /拒绝|拒絕|reject|declined|denied/i,
      /最终|最终|final|finally/i,
    ],
    patterns: [
      /我们?(决定|選擇|同意|拒绝).*/i,
      /(已|已經)?(确定|決定).*/i,
      /let's (use|go with|choose)/i,
      /we (decided|chose|agreed)/i,
    ],
    priority: 4,
    description: '决策记录、选择结果',
  },
  {
    type: 'entity',
    keywords: [
      /电话|電話|手机|手機|mobile|phone/i,
      /邮箱|郵箱|email|mail/i,
      /地址|address|location/i,
      /名字|姓名|name|称呼/i,
      /公司|company|organization/i,
    ],
    patterns: [
      /我的?(电话|電話|手机|邮箱|地址).*/i,
      /my (phone|email|address|name) is/i,
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/,
      /\b\d{3}[-.]?\d{3,4}[-.]?\d{4}\b/,
    ],
    priority: 3,
    description: '实体信息、联系方式',
  },
  {
    type: 'fact',
    keywords: [
      /是|are|is|am|being/i,
      /有|have|has|having/i,
      /职位|崗位|position|role|job/i,
      /工作|work|project/i,
      /技能|skill|ability/i,
    ],
    patterns: [
      /我(是|在|有|做|从事).*/i,
      /my (job|role|skill|project) is/i,
      /I (work|am working) (at|on|as)/i,
    ],
    priority: 2,
    description: '事实陈述、背景信息',
  },
  {
    type: 'summary',
    keywords: [
      /总结|總結|summary|conclude/i,
      /概要|大綱|outline|overview/i,
      /回顾|回顧|review|recap/i,
      /要点|要點|key points/i,
    ],
    patterns: [
      /(总结|總結|summary).*/i,
      /(回顾|回顧|review).*/i,
      /in summary|to summarize/i,
    ],
    priority: 2,
    description: '摘要、总结',
  },
  {
    type: 'document',
    keywords: [
      /文档|文檔|document|file/i,
      /文章|article|paper/i,
      /章节|章節|chapter|section/i,
      /代码|代碼|code|snippet/i,
    ],
    patterns: [
      /(文档|文檔|document).*/i,
      /(章节|章節|section).*/i,
      /```[\s\S]*```/,
    ],
    priority: 2,
    description: '文档内容、代码片段',
  },
  {
    type: 'conversation',
    keywords: [
      /问|問|ask|question/i,
      /答|answer|reply|response/i,
      /对话|對話|conversation|chat/i,
      /消息|message/i,
    ],
    patterns: [
      /^(问|問|Q:).*/i,
      /^(答|A:).*/i,
    ],
    priority: 1,
    description: '对话记录',
  },
  {
    type: 'other',
    keywords: [],
    patterns: [],
    priority: 0,
    description: '其他信息',
  },
];

/**
 * 记忆分类器
 *
 * 提供基于规则和 LLM 的双重分类机制：
 * 1. 首先使用规则进行快速预分类
 * 2. 如果置信度不足，可选调用 LLM 进行精确分类
 */
export class MemoryClassifier {
  private rules: ClassificationRule[];
  private llmThreshold: number;
  private defaultUseLLM: boolean;

  constructor(options?: {
    rules?: ClassificationRule[];
    llmThreshold?: number;
    useLLM?: boolean;
  }) {
    this.rules = options?.rules ?? CLASSIFICATION_RULES;
    this.llmThreshold = options?.llmThreshold ?? 0.7;
    this.defaultUseLLM = options?.useLLM ?? true;
  }

  /**
   * 对记忆内容进行分类
   */
  async classify(
    content: string,
    options?: ClassifyOptions
  ): Promise<ClassificationResult> {
    const useRules = options?.useRules ?? true;
    const useLLM = options?.useLLM ?? this.defaultUseLLM;
    const threshold = options?.llmThreshold ?? this.llmThreshold;

    // 步骤 1: 规则预分类
    if (useRules) {
      const ruleResult = this.ruleClassify(content);

      // 如果规则分类置信度足够高，直接返回
      if (ruleResult.confidence >= threshold) {
        log.debug('规则分类成功', {
          type: ruleResult.type,
          confidence: ruleResult.confidence,
        });
        return ruleResult;
      }

      // 如果不使用 LLM，返回规则结果
      if (!useLLM || !options?.llmProvider) {
        return ruleResult;
      }
    }

    // 步骤 2: LLM 分类
    if (useLLM && options?.llmProvider) {
      try {
        const llmResult = await this.llmClassify(
          content,
          options.llmProvider,
          options.context
        );

        log.debug('LLM 分类完成', {
          type: llmResult.type,
          confidence: llmResult.confidence,
        });

        return llmResult;
      } catch (error) {
        log.warn('LLM 分类失败，回退到规则分类', { error: String(error) });
        return this.ruleClassify(content);
      }
    }

    // 默认返回规则分类结果
    return this.ruleClassify(content);
  }

  /**
   * 批量分类
   */
  async classifyBatch(
    contents: string[],
    options?: ClassifyOptions
  ): Promise<ClassificationResult[]> {
    return Promise.all(contents.map(c => this.classify(c, options)));
  }

  /**
   * 规则分类
   */
  private ruleClassify(content: string): ClassificationResult {
    const results: Array<{
      type: MemoryType;
      confidence: number;
      matchedPatterns: string[];
    }> = [];

    for (const rule of this.rules) {
      let matchCount = 0;
      const matchedPatterns: string[] = [];

      // 关键词匹配
      for (const keyword of rule.keywords) {
        if (keyword.test(content)) {
          matchCount++;
          matchedPatterns.push(`keyword:${keyword.source.slice(0, 30)}`);
        }
      }

      // 模式匹配
      for (const pattern of rule.patterns) {
        if (pattern.test(content)) {
          matchCount++;
          matchedPatterns.push(`pattern:${pattern.source.slice(0, 30)}`);
        }
      }

      if (matchCount > 0) {
        // 基础置信度：每个匹配增加 0.25，最大 0.9
        const baseConfidence = Math.min(matchCount * 0.25, 0.9);
        // 优先级加成：最高优先级增加 0.1
        const priorityBonus = (rule.priority / 5) * 0.1;
        const confidence = Math.min(baseConfidence + priorityBonus, 1.0);

        results.push({
          type: rule.type,
          confidence,
          matchedPatterns: matchedPatterns.slice(0, 5),
        });
      }
    }

    if (results.length > 0) {
      // 按置信度排序，返回最高分
      results.sort((a, b) => b.confidence - a.confidence);
      return {
        ...results[0],
        source: 'rule',
      };
    }

    // 默认返回 'other' 类型
    return {
      type: 'other',
      confidence: 0.5,
      matchedPatterns: [],
      source: 'rule',
    };
  }

  /**
   * LLM 分类
   */
  private async llmClassify(
    content: string,
    provider: LLMProvider,
    context?: string
  ): Promise<ClassificationResult> {
    const systemPrompt = `你是一个记忆分类专家。请分析给定的记忆内容，判断其类型。

记忆类型定义：
- preference: 用户偏好、喜好、习惯（如：我喜欢...、我讨厌...）
- fact: 事实陈述、背景信息（如：我是...、我的工作是...）
- decision: 决策记录、选择结果（如：我们决定...、选择了...）
- entity: 实体信息、联系方式（如：我的电话是...、邮箱是...）
- conversation: 对话记录、问答内容
- summary: 总结、回顾、概要
- document: 文档内容、代码片段
- other: 无法归类的其他信息

请根据内容判断最合适的类型，并给出置信度分数（0-1）。`;

    const userPrompt = context
      ? `上下文：${context}\n\n记忆内容：${content}`
      : `记忆内容：${content}`;

    const response = await provider.chat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      undefined,
      undefined,
      { responseFormat: { type: 'json_object' }, temperature: 0.1 }
    );

    // 解析 LLM 响应
    const content_text =
      typeof response.content === 'string'
        ? response.content
        : JSON.stringify(response.content);

    const parsed = ClassificationSchema.safeParse(JSON.parse(content_text));

    if (!parsed.success) {
      throw new Error(`LLM 响应解析失败: ${parsed.error.message}`);
    }

    return {
      type: parsed.data.type,
      confidence: parsed.data.confidence,
      matchedPatterns: parsed.data.reasoning
        ? [`llm_reasoning:${parsed.data.reasoning.slice(0, 50)}`]
        : [],
      source: 'llm',
    };
  }
}

/**
 * 便捷函数：分类单条记忆
 */
export async function classifyMemory(
  content: string,
  options?: ClassifyOptions
): Promise<ClassificationResult> {
  const classifier = new MemoryClassifier();
  return classifier.classify(content, options);
}

/**
 * 获取记忆类型描述
 */
export function getMemoryTypeDescription(type: MemoryType): string {
  const rule = CLASSIFICATION_RULES.find(r => r.type === type);
  return rule?.description ?? '未知类型';
}

/**
 * 获取记忆类型图标
 */
export function getMemoryTypeIcon(type: MemoryType): string {
  const icons: Record<MemoryType, string> = {
    conversation: '💬',
    summary: '📝',
    preference: '❤️',
    fact: '📋',
    decision: '✅',
    entity: '👤',
    document: '📄',
    other: '📦',
  };
  return icons[type] ?? '📄';
}

/**
 * 获取所有支持的类型
 */
export function getSupportedTypes(): MemoryType[] {
  return CLASSIFICATION_RULES.map(r => r.type).filter(t => t !== 'other');
}
