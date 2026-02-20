/**
 * 模型自动路由器
 */

import type { ModelConfig, ModelLevel, RoutingConfig, RoutingRule } from '../config/schema';
import { DEFAULT_ROUTING_CONFIG } from '../config/schema';
import type { LLMProvider, LLMMessage } from './base';
import {
  calculateComplexity,
  complexityToLevel,
  hasImageMedia,
  LEVEL_PRIORITY,
  type ComplexityScore,
} from './complexity';
import {
  buildIntentSystemPrompt,
  buildIntentUserPrompt,
  type IntentResult,
  type ModelInfo,
} from '../prompts';
import { getLogger } from '@logtape/logtape';

const log = getLogger(['router']);

/** 模型路由配置 */
export interface ModelRouterConfig {
  chatModel: string;
  checkModel?: string;
  auto: boolean;
  max: boolean;
  models: Map<string, ModelConfig[]>;
  routing?: RoutingConfig;
}

/** 路由结果 */
export interface RouteResult {
  model: string;
  config: ModelConfig;
  complexity: ComplexityScore;
  reason: string;
}

/**
 * 模型路由器
 */
export class ModelRouter {
  private models: Map<string, ModelConfig[]>;
  private chatModel: string;
  private checkModel: string;
  private auto: boolean;
  private max: boolean;
  private routing: RoutingConfig;
  private provider: LLMProvider | null = null;

  constructor(config: ModelRouterConfig) {
    this.models = config.models;
    this.chatModel = config.chatModel;
    this.checkModel = config.checkModel ?? config.chatModel;
    this.auto = config.auto;
    this.max = config.max;
    this.routing = config.routing ?? DEFAULT_ROUTING_CONFIG;
  }

  setProvider(provider: LLMProvider): void {
    this.provider = provider;
  }

  route(
    messages: Array<{ role: string; content: string }>,
    media?: string[]
  ): RouteResult {
    if (!this.auto) {
      return this.defaultResult();
    }

    const hasImage = hasImageMedia(media);
    const content = messages.map(m => m.content).join(' ');
    const requireTool = this.needsToolCalling(content);

    // 图片优先选择视觉模型
    if (hasImage) {
      const result = this.selectVisionModel(messages, content);
      if (result) return result;
    }

    // 性能优先模式
    if (this.max) {
      const result = this.selectModelByLevel('ultra', false, requireTool);
      if (result) return { ...result, complexity: 100, reason: '性能优先模式' };
    }

    // 复杂度路由
    const complexity = calculateComplexity(messages, content, content.length, this.routing);
    const level = complexityToLevel(complexity);
    const result = this.selectModelByLevel(level, false, requireTool);

    if (result) {
      return { ...result, complexity, reason: `复杂度评分: ${complexity}` };
    }

    return this.defaultResult(complexity);
  }

  async analyzeIntent(
    messages: Array<{ role: string; content: string }>,
    media?: string[]
  ): Promise<IntentResult> {
    if (!this.provider) {
      return this.fallbackIntent(messages, media);
    }

    const hasImage = hasImageMedia(media);
    const modelInfos = this.buildModelInfos(hasImage);
    const userContent = messages.map(m => `${m.role}: ${m.content}`).join('\n');

    const analysisMessages: LLMMessage[] = [
      { role: 'system', content: buildIntentSystemPrompt(modelInfos) },
      { role: 'user', content: buildIntentUserPrompt(userContent, hasImage) },
    ];

    try {
      // 直接传递完整模型路径，避免 gateway 重新路由
      const response = await this.provider.chat(
        analysisMessages,
        [],
        this.checkModel,
        { maxTokens: 200, temperature: 0.3 }
      );

      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as { model: string; reason: string };
        const validModel = modelInfos.find(m => m.id === parsed.model);

        if (validModel) {
          return { model: parsed.model, reason: parsed.reason };
        }
      }
    } catch (error) {
      log.warn('[Router] 意图识别失败: {error}', {
        error: error instanceof Error ? error.message : String(error)
      });
    }

    return this.fallbackIntent(messages, media);
  }

  selectModelByIntent(intent: IntentResult): RouteResult {
    const config = this.getModelConfig(intent.model);
    return {
      model: intent.model,
      config,
      complexity: 0,
      reason: `意图识别: ${intent.reason}`,
    };
  }

  updateConfig(config: Partial<ModelRouterConfig>): void {
    if (config.chatModel !== undefined) this.chatModel = config.chatModel;
    if (config.checkModel !== undefined) this.checkModel = config.checkModel;
    if (config.auto !== undefined) this.auto = config.auto;
    if (config.max !== undefined) this.max = config.max;
    if (config.models !== undefined) this.models = config.models;
    if (config.routing !== undefined) this.routing = config.routing;
  }

  getRoutingConfig(): RoutingConfig {
    return this.routing;
  }

  getStatus(): { auto: boolean; max: boolean; rulesCount: number; chatModel: string; checkModel: string } {
    return {
      auto: this.auto,
      max: this.max,
      rulesCount: this.routing.rules.length,
      chatModel: this.chatModel,
      checkModel: this.checkModel,
    };
  }

  private defaultResult(complexity: ComplexityScore = 0): RouteResult {
    const config = this.getModelConfig(this.chatModel);
    return {
      model: this.chatModel,
      config,
      complexity,
      reason: '使用对话模型',
    };
  }

  private buildModelInfos(requireVision: boolean): ModelInfo[] {
    const infos: ModelInfo[] = [];

    for (const [provider, models] of this.models) {
      for (const config of models) {
        if (requireVision && !config.vision) continue;
        infos.push({
          id: `${provider}/${config.id}`,
          level: config.level,
          vision: config.vision,
          think: config.think,
          tool: config.tool ?? true,
        });
      }
    }

    return infos;
  }

  private fallbackIntent(
    messages: Array<{ role: string; content: string }>,
    media?: string[]
  ): IntentResult {
    const content = messages.map(m => m.content).join(' ');
    const hasImage = hasImageMedia(media);
    const requireTool = this.needsToolCalling(content);

    // 规则匹配
    if (this.routing.enabled && this.routing.rules.length > 0) {
      const matchedRule = this.matchRule(content, content.length);
      if (matchedRule) {
        const result = this.selectModelByLevel(matchedRule.level, hasImage, requireTool);
        if (result) return { model: result.model, reason: '关键词匹配' };
      }
    }

    // 复杂度计算
    const complexity = calculateComplexity(messages, content, content.length, this.routing);
    const level = complexityToLevel(complexity);
    const result = this.selectModelByLevel(level, hasImage, requireTool);

    if (result) return { model: result.model, reason: `复杂度评分: ${complexity}` };
    return { model: this.chatModel, reason: '回退到默认模型' };
  }

  /** 检测用户请求是否需要工具调用 */
  private needsToolCalling(content: string): boolean {
    const toolKeywords = [
      // 系统操作
      'CPU', '内存', '磁盘', '网络', '进程', '状态', '占用', '负载',
      '查看', '获取', '读取', '写入', '删除', '列出', '执行', '运行',
      // 文件操作
      '文件', '目录', '路径', '创建', '修改',
      // 网络操作
      '搜索', '网页', '请求', '下载', '上传',
      // 工具相关
      '工具', '命令', '脚本', 'shell', 'bash',
    ];
    const contentLower = content.toLowerCase();
    return toolKeywords.some(k => contentLower.includes(k.toLowerCase()));
  }

  private matchRule(content: string, length: number): RoutingRule | null {
    const contentLower = content.toLowerCase();
    const sortedRules = [...this.routing.rules].sort((a, b) => b.priority - a.priority);

    for (const rule of sortedRules) {
      if (rule.minLength !== undefined && length < rule.minLength) continue;
      if (rule.maxLength !== undefined && length > rule.maxLength) continue;
      if (rule.keywords.length === 0) continue;

      const matched = rule.keywords.some(k => contentLower.includes(k.toLowerCase()));
      if (matched) return rule;
    }

    return null;
  }

  private selectVisionModel(
    messages: Array<{ role: string; content: string }>,
    content: string
  ): RouteResult | null {
    const visionModels = this.collectVisionModels();
    if (visionModels.length === 0) return null;

    const complexity = calculateComplexity(messages, content, content.length, this.routing);
    const targetLevel = complexityToLevel(complexity);
    const targetPriority = LEVEL_PRIORITY[targetLevel];

    // 排序并选择最接近的视觉模型
    const sorted = visionModels.sort((a, b) => {
      const diff = LEVEL_PRIORITY[b.config.level] - LEVEL_PRIORITY[a.config.level];
      return this.max ? diff : -diff;
    });

    let best: { provider: string; config: ModelConfig; diff: number } | null = null;
    for (const { provider, config } of sorted) {
      const diff = Math.abs(LEVEL_PRIORITY[config.level] - targetPriority);
      if (!best || diff < best.diff) {
        best = { provider, config, diff };
      }
    }

    if (best) {
      return {
        model: `${best.provider}/${best.config.id}`,
        config: best.config,
        complexity,
        reason: '图片消息，使用视觉模型',
      };
    }

    return null;
  }

  private collectVisionModels(): Array<{ provider: string; config: ModelConfig }> {
    const models: Array<{ provider: string; config: ModelConfig }> = [];
    for (const [provider, configs] of this.models) {
      for (const config of configs) {
        if (config.vision) models.push({ provider, config });
      }
    }
    return models;
  }

  private selectModelByLevel(targetLevel: ModelLevel, visionOnly = false, requireTool = false): RouteResult | null {
    const candidates = this.findCandidates(targetLevel, visionOnly, requireTool);

    if (candidates.length === 0) {
      return this.selectNearestModel(targetLevel, visionOnly, requireTool);
    }

    const selected = candidates[0];
    return {
      model: `${selected.provider}/${selected.config.id}`,
      config: selected.config,
      complexity: 0,
      reason: '',
    };
  }

  private findCandidates(
    targetLevel: ModelLevel,
    visionOnly: boolean,
    requireTool: boolean
  ): Array<{ provider: string; config: ModelConfig }> {
    const candidates: Array<{ provider: string; config: ModelConfig }> = [];

    for (const [provider, models] of this.models) {
      for (const config of models) {
        if (config.level !== targetLevel) continue;
        if (visionOnly && !config.vision) continue;
        if (requireTool && !config.tool) continue;
        candidates.push({ provider, config });
      }
    }

    return candidates;
  }

  private selectNearestModel(targetLevel: ModelLevel, visionOnly = false, requireTool = false): RouteResult | null {
    const targetPriority = LEVEL_PRIORITY[targetLevel];
    const candidates = this.buildCandidates(visionOnly, targetPriority, requireTool);

    if (candidates.length === 0) return null;

    const filtered = this.filterByMode(candidates, targetPriority);
    const selected = filtered.sort((a, b) => Math.abs(a.diff) - Math.abs(b.diff))[0];

    return {
      model: `${selected.provider}/${selected.config.id}`,
      config: selected.config,
      complexity: 0,
      reason: `使用最接近级别的模型 (${selected.config.level})`,
    };
  }

  private buildCandidates(
    visionOnly: boolean,
    targetPriority: number,
    requireTool: boolean
  ): Array<{ provider: string; config: ModelConfig; diff: number; priority: number }> {
    const candidates: Array<{ provider: string; config: ModelConfig; diff: number; priority: number }> = [];

    for (const [provider, models] of this.models) {
      for (const config of models) {
        if (visionOnly && !config.vision) continue;
        if (requireTool && !config.tool) continue;
        const priority = LEVEL_PRIORITY[config.level];
        candidates.push({ provider, config, diff: priority - targetPriority, priority });
      }
    }

    return candidates;
  }

  private filterByMode(
    candidates: Array<{ provider: string; config: ModelConfig; diff: number; priority: number }>,
    targetPriority: number
  ): Array<{ provider: string; config: ModelConfig; diff: number; priority: number }> {
    if (this.max) {
      const filtered = candidates.filter(c => c.diff >= 0);
      return filtered.length > 0 ? filtered : candidates.sort((a, b) => b.priority - a.priority).slice(0, 1);
    }

    const filtered = candidates.filter(c => c.diff <= 0);
    return filtered.length > 0 ? filtered : candidates.sort((a, b) => a.priority - b.priority).slice(0, 1);
  }

  private getModelConfig(modelId: string): ModelConfig {
    const [provider, id] = modelId.includes('/') ? modelId.split('/') : [null, modelId];

    if (provider) {
      const models = this.models.get(provider);
      const found = models?.find(m => m.id === id);
      if (found) return found;
    }

    return {
      id: id || modelId,
      vision: false,
      think: false,
      tool: true,
      level: 'medium',
    };
  }
}

// 导出复杂度相关
export { calculateComplexity, complexityToLevel, hasImageMedia, LEVEL_PRIORITY, type ComplexityScore };