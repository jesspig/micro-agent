/**
 * 偏好检测器
 *
 * 检测用户消息中的偏好陈述，自动识别用户喜好、厌恶、习惯等。
 * 支持中英文偏好识别，返回置信度分数。
 */

import { z } from 'zod';
import { getLogger } from '@logtape/logtape';

const log = getLogger(['memory', 'preference-classifier']);

/** 偏好类型 */
export type PreferenceType =
  | 'like'      // 喜欢
  | 'dislike'   // 不喜欢
  | 'want'      // 想要/需要
  | 'avoid'     // 避免/讨厌
  | 'habit'     // 习惯
  | 'style';    // 风格偏好

/** 偏好检测结果 */
export const PreferenceDetectionResultSchema = z.object({
  /** 是否检测到偏好 */
  detected: z.boolean(),
  /** 偏好类型 */
  type: z.enum(['like', 'dislike', 'want', 'avoid', 'habit', 'style']).optional(),
  /** 偏好主题（用户偏好的对象） */
  subject: z.string().optional(),
  /** 偏好内容（完整描述） */
  content: z.string().optional(),
  /** 置信度 (0-1) */
  confidence: z.number().min(0).max(1),
  /** 匹配的模式 */
  matchedPattern: z.string().optional(),
  /** 原始文本 */
  originalText: z.string(),
});

export type PreferenceDetectionResult = z.infer<typeof PreferenceDetectionResultSchema>;

/** 批量检测结果 */
export interface BatchDetectionResult {
  results: PreferenceDetectionResult[];
  detectedCount: number;
  averageConfidence: number;
}

/** 偏好模式规则 */
interface PreferencePattern {
  /** 偏好类型 */
  type: PreferenceType;
  /** 正则模式 */
  pattern: RegExp;
  /** 提取主题的捕获组索引 */
  subjectGroup: number;
  /** 语言 */
  language: 'zh' | 'en' | 'both';
  /** 基础置信度 */
  baseConfidence: number;
}

/**
 * 偏好模式规则库
 *
 * 包含中英文偏好表达模式的识别规则
 * 注意：风格类型模式放在前面，优先级更高
 */
const PREFERENCE_PATTERNS: PreferencePattern[] = [
  // ========== 风格偏好类型（优先级最高） ==========
  // 中文
  {
    type: 'style',
    pattern: /我(比较|更)?喜欢(简洁|详细|正式|随意|专业|轻松|幽默|严肃)的?(风格|方式|语气|回答)/,
    subjectGroup: 0,
    language: 'zh',
    baseConfidence: 0.95,
  },
  {
    type: 'style',
    pattern: /请(用|使用|以)([^，。！？\n]+)(的)?(风格|方式|语气|回复|回答)/,
    subjectGroup: 2,
    language: 'zh',
    baseConfidence: 0.9,
  },
  {
    type: 'style',
    pattern: /请(用|使用)([^，。！？\n]+)回复/,
    subjectGroup: 2,
    language: 'zh',
    baseConfidence: 0.88,
  },
  // 英文
  {
    type: 'style',
    pattern: /I\s+prefer\s+(a\s+)?(concise|detailed|formal|casual|professional|friendly)\s+(style|tone|format)/i,
    subjectGroup: 0,
    language: 'en',
    baseConfidence: 0.95,
  },
  {
    type: 'style',
    pattern: /Please\s+(use|write\s+in|reply\s+in)\s+(a\s+)?([^.!?\n]+)\s+(style|tone)/i,
    subjectGroup: 3,
    language: 'en',
    baseConfidence: 0.9,
  },
  {
    type: 'style',
    pattern: /Please\s+(use|reply\s+in)\s+([^.!?\n]+)/i,
    subjectGroup: 2,
    language: 'en',
    baseConfidence: 0.88,
  },

  // ========== 喜欢类型 ==========
  // 中文
  {
    type: 'like',
    pattern: /我(比较|特别|很|非常)?(喜欢|喜爱|爱|钟爱|偏爱)([^，。！？\n]+)/,
    subjectGroup: 3,
    language: 'zh',
    baseConfidence: 0.9,
  },
  {
    type: 'like',
    pattern: /我最?喜欢的是([^，。！？\n]+)/,
    subjectGroup: 1,
    language: 'zh',
    baseConfidence: 0.95,
  },
  {
    type: 'like',
    pattern: /(.*?)是我(最)?喜欢的/,
    subjectGroup: 1,
    language: 'zh',
    baseConfidence: 0.9,
  },
  // 英文
  {
    type: 'like',
    pattern: /I\s+(really\s+)?(like|love|enjoy|prefer|adore)\s+([^.!?\n]+)/i,
    subjectGroup: 3,
    language: 'en',
    baseConfidence: 0.9,
  },
  {
    type: 'like',
    pattern: /My\s+favorite\s+([^.!?\n]+)/i,
    subjectGroup: 1,
    language: 'en',
    baseConfidence: 0.95,
  },
  {
    type: 'like',
    pattern: /I'm\s+(a\s+)?(big\s+)?fan\s+of\s+([^.!?\n]+)/i,
    subjectGroup: 3,
    language: 'en',
    baseConfidence: 0.85,
  },

  // ========== 不喜欢类型 ==========
  // 中文
  {
    type: 'dislike',
    pattern: /我(比较|特别|很|非常)?(不喜欢|讨厌|厌恶|反感|不太喜欢)([^，。！？\n]+)/,
    subjectGroup: 3,
    language: 'zh',
    baseConfidence: 0.9,
  },
  {
    type: 'dislike',
    pattern: /我(最)?(讨厌|不喜欢)的是([^，。！？\n]+)/,
    subjectGroup: 3,
    language: 'zh',
    baseConfidence: 0.95,
  },
  // 英文
  {
    type: 'dislike',
    pattern: /I\s+(really\s+)?(don'?t\s+like|dislike|hate|can'?t\s+stand)\s+([^.!?\n]+)/i,
    subjectGroup: 3,
    language: 'en',
    baseConfidence: 0.9,
  },
  {
    type: 'dislike',
    pattern: /I'm\s+not\s+(a\s+)?fan\s+of\s+([^.!?\n]+)/i,
    subjectGroup: 2,
    language: 'en',
    baseConfidence: 0.85,
  },

  // ========== 想要/需要类型 ==========
  // 中文
  {
    type: 'want',
    pattern: /我(想|想要|希望|需要)([^，。！？\n]+)/,
    subjectGroup: 2,
    language: 'zh',
    baseConfidence: 0.85,
  },
  {
    type: 'want',
    pattern: /请(帮我|给我|为我)([^，。！？\n]+)/,
    subjectGroup: 2,
    language: 'zh',
    baseConfidence: 0.8,
  },
  // 英文
  {
    type: 'want',
    pattern: /I\s+(want|need|would\s+like)\s+(to\s+)?([^.!?\n]+)/i,
    subjectGroup: 3,
    language: 'en',
    baseConfidence: 0.85,
  },
  {
    type: 'want',
    pattern: /I'd\s+like\s+(to\s+)?([^.!?\n]+)/i,
    subjectGroup: 2,
    language: 'en',
    baseConfidence: 0.85,
  },

  // ========== 避免/讨厌类型 ==========
  // 中文
  {
    type: 'avoid',
    pattern: /(请)?不要([^，。！？\n]+)/,
    subjectGroup: 2,
    language: 'zh',
    baseConfidence: 0.8,
  },
  {
    type: 'avoid',
    pattern: /我(尽量|尽可能)?避免([^，。！？\n]+)/,
    subjectGroup: 2,
    language: 'zh',
    baseConfidence: 0.85,
  },
  // 英文
  {
    type: 'avoid',
    pattern: /(Please\s+)?don'?t\s+([^.!?\n]+)/i,
    subjectGroup: 2,
    language: 'en',
    baseConfidence: 0.8,
  },
  {
    type: 'avoid',
    pattern: /I\s+avoid\s+([^.!?\n]+)/i,
    subjectGroup: 1,
    language: 'en',
    baseConfidence: 0.85,
  },

  // ========== 习惯类型 ==========
  // 中文
  {
    type: 'habit',
    pattern: /我(通常|一般|经常|总是|习惯)([^，。！？\n]+)/,
    subjectGroup: 2,
    language: 'zh',
    baseConfidence: 0.85,
  },
  {
    type: 'habit',
    pattern: /我的习惯是([^，。！？\n]+)/,
    subjectGroup: 1,
    language: 'zh',
    baseConfidence: 0.9,
  },
  // 英文
  {
    type: 'habit',
    pattern: /I\s+(usually|always|often|typically)\s+([^.!?\n]+)/i,
    subjectGroup: 2,
    language: 'en',
    baseConfidence: 0.85,
  },
  {
    type: 'habit',
    pattern: /My\s+(usual\s+)?habit\s+is\s+([^.!?\n]+)/i,
    subjectGroup: 2,
    language: 'en',
    baseConfidence: 0.9,
  },
];


/** 否定词（用于降低置信度） */
const NEGATION_WORDS = ['不是', '并没有', "don't mean", 'just kidding', '开玩笑'];

/**
 * 偏好检测器
 *
 * 使用规则引擎检测用户消息中的偏好陈述
 */
export class PreferenceClassifier {
  private minConfidence: number;

  constructor(options?: { minConfidence?: number }) {
    this.minConfidence = options?.minConfidence ?? 0.7;
  }

  /**
   * 检测单条消息中的偏好
   *
   * @param text - 用户消息文本
   * @returns 偏好检测结果
   */
  detect(text: string): PreferenceDetectionResult {
    const trimmedText = text.trim();

    // 空文本检测
    if (!trimmedText) {
      return {
        detected: false,
        confidence: 0,
        originalText: trimmedText,
      };
    }

    // 检查否定词，降低置信度
    const hasNegation = NEGATION_WORDS.some(word =>
      trimmedText.toLowerCase().includes(word.toLowerCase())
    );

    // 遍历所有模式进行匹配
    let bestMatch: PreferenceDetectionResult | null = null;

    for (const pattern of PREFERENCE_PATTERNS) {
      const match = trimmedText.match(pattern.pattern);

      if (match) {
        // 提取主题
        let subject = '';
        if (pattern.subjectGroup > 0 && match[pattern.subjectGroup]) {
          subject = match[pattern.subjectGroup].trim();
        } else if (pattern.subjectGroup === 0) {
          // 整体匹配作为主题
          subject = match[0].trim();
        }

        // 计算置信度
        let confidence = pattern.baseConfidence;
        if (hasNegation) {
          confidence *= 0.5; // 否定词降低置信度
        }

        // 主题长度调整（过短可能不准确）
        if (subject.length < 2) {
          confidence *= 0.8;
        }

        const result: PreferenceDetectionResult = {
          detected: confidence >= this.minConfidence,
          type: pattern.type,
          subject: subject || undefined,
          content: this.buildPreferenceContent(pattern.type, subject),
          confidence: Math.min(confidence, 1),
          matchedPattern: pattern.pattern.source.slice(0, 50),
          originalText: trimmedText,
        };

        // 更新最佳匹配
        if (!bestMatch || result.confidence > bestMatch.confidence) {
          bestMatch = result;
        }
      }
    }

    if (bestMatch) {
      log.debug('偏好检测成功', {
        type: bestMatch.type,
        subject: bestMatch.subject,
        confidence: bestMatch.confidence,
      });
      return bestMatch;
    }

    return {
      detected: false,
      confidence: 0,
      originalText: trimmedText,
    };
  }

  /**
   * 批量检测偏好
   *
   * @param texts - 文本数组
   * @returns 批量检测结果
   */
  detectBatch(texts: string[]): BatchDetectionResult {
    const results = texts.map(text => this.detect(text));
    const detectedResults = results.filter(r => r.detected);

    return {
      results,
      detectedCount: detectedResults.length,
      averageConfidence: detectedResults.length > 0
        ? detectedResults.reduce((sum, r) => sum + r.confidence, 0) / detectedResults.length
        : 0,
    };
  }

  /**
   * 从对话消息中检测偏好
   *
   * @param messages - 对话消息列表
   * @returns 检测到的偏好列表
   */
  detectFromMessages(messages: Array<{ role: string; content: string }>): PreferenceDetectionResult[] {
    // 只处理用户消息
    const userMessages = messages.filter(m => m.role === 'user');
    const results: PreferenceDetectionResult[] = [];

    for (const message of userMessages) {
      const result = this.detect(message.content);
      if (result.detected) {
        results.push(result);
      }
    }

    return results;
  }

  /**
   * 设置最小置信度阈值
   */
  setMinConfidence(threshold: number): void {
    this.minConfidence = Math.max(0, Math.min(1, threshold));
  }

  /**
   * 获取最小置信度阈值
   */
  getMinConfidence(): number {
    return this.minConfidence;
  }

  /**
   * 构建偏好内容描述
   */
  private buildPreferenceContent(type: PreferenceType, subject: string): string {
    if (!subject) return '';

    const typeLabels: Record<PreferenceType, string> = {
      like: '喜欢',
      dislike: '不喜欢',
      want: '想要',
      avoid: '避免',
      habit: '习惯',
      style: '偏好风格',
    };

    return `${typeLabels[type]}: ${subject}`;
  }
}

// ========== 导出便捷函数 ==========

/** 默认检测器实例 */
const defaultClassifier = new PreferenceClassifier();

/**
 * 检测文本中的偏好
 */
export function detectPreference(text: string): PreferenceDetectionResult {
  return defaultClassifier.detect(text);
}

/**
 * 批量检测偏好
 */
export function detectPreferencesBatch(texts: string[]): BatchDetectionResult {
  return defaultClassifier.detectBatch(texts);
}
