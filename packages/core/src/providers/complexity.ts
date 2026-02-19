/**
 * 复杂度计算模块
 */

import type { ModelLevel, RoutingConfig } from '../config/schema';

/** 任务复杂度评分（0-100） */
export type ComplexityScore = number;

/** 复杂度级别映射 */
export const COMPLEXITY_THRESHOLDS: Record<ModelLevel, [number, number]> = {
  fast: [0, 20],
  low: [20, 40],
  medium: [40, 60],
  high: [60, 80],
  ultra: [80, 100],
};

/** 性能级别优先级 */
export const LEVEL_PRIORITY: Record<ModelLevel, number> = {
  fast: 1,
  low: 2,
  medium: 3,
  high: 4,
  ultra: 5,
};

/**
 * 计算任务复杂度（0-100）
 */
export function calculateComplexity(
  messages: Array<{ role: string; content: string }>,
  content: string,
  length: number,
  routing: RoutingConfig
): ComplexityScore {
  const cfg = routing;

  // 基础分数
  let score = cfg.baseScore;

  // 长度因素
  const lengthScore = Math.min(20, Math.floor(length / 100) * cfg.lengthWeight);
  score += lengthScore;

  // 代码块因素
  if (content.includes('```') || content.includes('`')) {
    score += cfg.codeBlockScore;
  }

  // 工具调用因素
  if (content.includes('tool') || content.includes('工具')) {
    score += cfg.toolCallScore;
  }

  // 多轮对话因素
  if (messages.length > 1) {
    score += Math.min(10, messages.length * cfg.multiTurnScore);
  }

  return Math.max(0, Math.min(100, score));
}

/**
 * 复杂度评分转性能级别
 */
export function complexityToLevel(score: ComplexityScore): ModelLevel {
  for (const [level, [min, max]] of Object.entries(COMPLEXITY_THRESHOLDS)) {
    if (score >= min && score < max) {
      return level as ModelLevel;
    }
  }
  return 'ultra';
}

/**
 * 检测是否有图片媒体
 */
export function hasImageMedia(media?: string[]): boolean {
  if (!media || media.length === 0) return false;

  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'];
  return media.some(m => {
    const lower = m.toLowerCase();
    return imageExtensions.some(ext => lower.endsWith(ext)) ||
      lower.includes('image/') ||
      lower.startsWith('data:image');
  });
}
