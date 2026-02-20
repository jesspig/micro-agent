/**
 * 路由器工具函数
 */

import type { RoutingRule, RoutingConfig, ModelConfig, ModelLevel } from '../../config/schema';
import { LEVEL_PRIORITY } from './complexity';

/** 工具调用关键词 */
const TOOL_KEYWORDS = [
  'CPU', '内存', '磁盘', '网络', '进程', '状态', '占用', '负载',
  '查看', '获取', '读取', '写入', '删除', '列出', '执行', '运行',
  '文件', '目录', '路径', '创建', '修改',
  '搜索', '网页', '请求', '下载', '上传',
  '工具', '命令', '脚本', 'shell', 'bash',
];

/**
 * 检测用户请求是否需要工具调用
 */
export function needsToolCalling(content: string): boolean {
  const contentLower = content.toLowerCase();
  return TOOL_KEYWORDS.some(k => contentLower.includes(k.toLowerCase()));
}

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

/** 模型选择参数 */
export interface SelectParams {
  targetLevel: ModelLevel;
  visionOnly: boolean;
  requireTool: boolean;
  max: boolean;
  models: Map<string, ModelConfig[]>;
}

/**
 * 查找候选模型
 */
export function findCandidates(params: SelectParams): Array<{ provider: string; config: ModelConfig }> {
  const { targetLevel, visionOnly, requireTool, models } = params;
  const candidates: Array<{ provider: string; config: ModelConfig }> = [];

  for (const [provider, configs] of models) {
    for (const config of configs) {
      if (config.level !== targetLevel) continue;
      if (visionOnly && !config.vision) continue;
      if (requireTool && !config.tool) continue;
      candidates.push({ provider, config });
    }
  }

  return candidates;
}

/**
 * 构建候选模型列表
 */
export function buildCandidates(
  visionOnly: boolean,
  targetPriority: number,
  requireTool: boolean,
  models: Map<string, ModelConfig[]>
): Array<{ provider: string; config: ModelConfig; diff: number; priority: number }> {
  const candidates: Array<{ provider: string; config: ModelConfig; diff: number; priority: number }> = [];

  for (const [provider, configs] of models) {
    for (const config of configs) {
      if (visionOnly && !config.vision) continue;
      if (requireTool && !config.tool) continue;
      const priority = LEVEL_PRIORITY[config.level];
      candidates.push({ provider, config, diff: priority - targetPriority, priority });
    }
  }

  return candidates;
}