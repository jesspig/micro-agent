/**
 * 路由器工具函数
 */

import type { RoutingRule, RoutingConfig, ModelConfig } from '@microbot/config';

/**
 * 匹配路由规则
 */
export function matchRule(content: string, length: number, routing: RoutingConfig): RoutingRule | null {
  const contentLower = content.toLowerCase();
  const sortedRules = [...routing.rules].sort((a, b) => b.priority - a.priority);

  for (const rule of sortedRules) {
    if (rule.minLength !== undefined && length < rule.minLength) continue;
    if (rule.maxLength !== undefined && length > rule.maxLength) continue;
    if (rule.keywords.length === 0) continue;

    const matched = rule.keywords.some(k => contentLower.includes(k.toLowerCase()));
    if (matched) return rule;
  }

  return null;
}

/**
 * 收集视觉模型
 */
export function collectVisionModels(
  models: Map<string, ModelConfig[]>
): Array<{ provider: string; config: ModelConfig }> {
  const result: Array<{ provider: string; config: ModelConfig }> = [];
  for (const [provider, configs] of models) {
    for (const config of configs) {
      if (config.vision) result.push({ provider, config });
    }
  }
  return result;
}