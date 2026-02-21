/**
 * 模型自动路由器
 */

import type { ModelConfig, ModelLevel, RoutingConfig } from '@microbot/config';
import { DEFAULT_ROUTING_CONFIG } from '@microbot/config';
import type { LLMProvider, LLMMessage } from './base';
import {
  calculateComplexity,
  complexityToLevel,
  hasImageMedia,
  LEVEL_PRIORITY,
  type ComplexityScore,
} from './complexity';
import { matchRule, collectVisionModels } from './router-utils';
import type { IntentResult, ModelInfo, IntentPromptBuilder, UserPromptBuilder } from './prompts';
import { getLogger } from '@logtape/logtape';

const log = getLogger(['router']);

/** 模型路由配置 */
export interface ModelRouterConfig {
  chatModel: string;
  intentModel?: string;
  auto: boolean;
  max: boolean;
  models: Map<string, ModelConfig[]>;
  routing?: RoutingConfig;
  /** 意图识别 System Prompt 构建函数 */
  buildIntentPrompt?: IntentPromptBuilder;
  /** 用户 Prompt 构建函数 */
  buildUserPrompt?: UserPromptBuilder;
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
  private intentModel: string;
  private auto: boolean;
  private max: boolean;
  private routing: RoutingConfig;
  private buildIntentPrompt?: IntentPromptBuilder;
  private buildUserPrompt?: UserPromptBuilder;
  private provider: LLMProvider | null = null;

  constructor(config: ModelRouterConfig) {
    this.models = config.models;
    this.chatModel = config.chatModel;
    this.intentModel = config.intentModel ?? config.chatModel;
    this.auto = config.auto;
    this.max = config.max;
    this.routing = config.routing ?? DEFAULT_ROUTING_CONFIG;
    this.buildIntentPrompt = config.buildIntentPrompt;
    this.buildUserPrompt = config.buildUserPrompt;
  }

  setProvider(provider: LLMProvider): void {
    this.provider = provider;
  }

  route(messages: Array<{ role: string; content: string }>, media?: string[]): RouteResult {
    if (!this.auto) return this.defaultResult();

    const hasImage = hasImageMedia(media);
    const content = messages.map(m => m.content).join(' ');

    if (hasImage) {
      const result = this.selectVisionModel(messages, content);
      if (result) return result;
    }

    const complexity = calculateComplexity(messages, content, content.length, this.routing);
    const level = complexityToLevel(complexity);
    const result = this.selectModelByLevel(level, false);

    if (result) {
      const mode = this.max ? '性能优先' : '速度优先';
      return { ...result, complexity, reason: `${mode}, 复杂度: ${complexity}` };
    }
    return this.defaultResult(complexity);
  }

  async analyzeIntent(messages: Array<{ role: string; content: string }>, media?: string[]): Promise<IntentResult> {
    if (!this.provider) return this.fallbackIntent(messages, media);

    const hasImage = hasImageMedia(media);
    const modelInfos = this.buildModelInfos(hasImage);
    const userContent = messages.map(m => `${m.role}: ${m.content}`).join('\n');

    log.info('[Router] 意图分析', { hasImage, contentLength: userContent.length });

    if (!this.buildIntentPrompt || !this.buildUserPrompt) {
      log.warn('[Router] 未配置提示词构建函数，回退到默认路由');
      return this.fallbackIntent(messages, media);
    }

    const analysisMessages: LLMMessage[] = [
      { role: 'system', content: this.buildIntentPrompt(modelInfos) },
      { role: 'user', content: this.buildUserPrompt(userContent, hasImage) },
    ];

    try {
      const response = await this.provider.chat(analysisMessages, [], this.intentModel, { maxTokens: 200, temperature: 0.3 });
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as { model: string; reason: string };
        log.info('[Router] LLM 选择', { model: parsed.model, reason: parsed.reason });
        const selectedModel = modelInfos.find(m => m.id === parsed.model);
        if (selectedModel) {
          if (hasImage && !selectedModel.vision) {
            log.warn('[Router] LLM 选择了不支持视觉的模型，自动纠正');
            return this.fallbackIntent(messages, media);
          }
          return { model: parsed.model, reason: parsed.reason };
        }
        log.warn('[Router] LLM 选择的模型不在可用列表中', { model: parsed.model });
      }
    } catch (error) {
      log.warn('[Router] 意图识别失败: {error}', { error: error instanceof Error ? error.message : String(error) });
    }

    return this.fallbackIntent(messages, media);
  }

  selectModelByIntent(intent: IntentResult): RouteResult {
    return { model: intent.model, config: this.getModelConfig(intent.model), complexity: 0, reason: `意图识别: ${intent.reason}` };
  }

  updateConfig(config: Partial<ModelRouterConfig>): void {
    if (config.chatModel !== undefined) this.chatModel = config.chatModel;
    if (config.intentModel !== undefined) this.intentModel = config.intentModel;
    if (config.auto !== undefined) this.auto = config.auto;
    if (config.max !== undefined) this.max = config.max;
    if (config.models !== undefined) this.models = config.models;
    if (config.routing !== undefined) this.routing = config.routing;
  }

  getRoutingConfig(): RoutingConfig { return this.routing; }

  getStatus(): { auto: boolean; max: boolean; rulesCount: number; chatModel: string; intentModel: string } {
    return { auto: this.auto, max: this.max, rulesCount: this.routing.rules.length, chatModel: this.chatModel, intentModel: this.intentModel };
  }

  private defaultResult(complexity: ComplexityScore = 0): RouteResult {
    return { model: this.chatModel, config: this.getModelConfig(this.chatModel), complexity, reason: '使用对话模型' };
  }

  private buildModelInfos(requireVision: boolean): ModelInfo[] {
    const infos: ModelInfo[] = [];
    for (const [provider, models] of this.models) {
      for (const config of models) {
        if (requireVision && !config.vision) continue;
        infos.push({ id: `${provider}/${config.id}`, level: config.level, vision: config.vision, think: config.think });
      }
    }
    log.info('[Router] 可用模型列表', { count: infos.length });
    return infos;
  }

  private fallbackIntent(messages: Array<{ role: string; content: string }>, media?: string[]): IntentResult {
    const content = messages.map(m => m.content).join(' ');
    const hasImage = hasImageMedia(media);

    log.info('[Router] Fallback 路由', { hasImage });

    if (this.routing.rules.length > 0) {
      const matchedRule = matchRule(content, content.length, this.routing);
      if (matchedRule) {
        const result = this.selectModelByLevel(matchedRule.level, hasImage);
        if (result) {
          log.info('[Router] 规则匹配', { level: matchedRule.level, model: result.model });
          return { model: result.model, reason: '关键词匹配' };
        }
      }
    }

    const complexity = calculateComplexity(messages, content, content.length, this.routing);
    const level = complexityToLevel(complexity);
    const result = this.selectModelByLevel(level, hasImage);
    if (result) {
      log.info('[Router] 复杂度匹配', { level, model: result.model, complexity });
      return { model: result.model, reason: `复杂度评分: ${complexity}` };
    }

    log.warn('[Router] 回退到默认模型', { model: this.chatModel });
    return { model: this.chatModel, reason: '回退到默认模型' };
  }

  private selectVisionModel(messages: Array<{ role: string; content: string }>, content: string): RouteResult | null {
    const visionModels = collectVisionModels(this.models);
    if (visionModels.length === 0) return null;

    const complexity = calculateComplexity(messages, content, content.length, this.routing);
    const targetPriority = LEVEL_PRIORITY[complexityToLevel(complexity)];

    const sorted = visionModels.sort((a, b) => {
      const diff = LEVEL_PRIORITY[b.config.level] - LEVEL_PRIORITY[a.config.level];
      return this.max ? diff : -diff;
    });

    let best: { provider: string; config: ModelConfig; diff: number } | null = null;
    for (const { provider, config } of sorted) {
      const diff = Math.abs(LEVEL_PRIORITY[config.level] - targetPriority);
      if (!best || diff < best.diff) best = { provider, config, diff };
    }

    if (best) return { model: `${best.provider}/${best.config.id}`, config: best.config, complexity, reason: '图片消息，使用视觉模型' };
    return null;
  }

  private selectModelByLevel(targetLevel: ModelLevel, visionOnly = false): RouteResult | null {
    const candidates: Array<{ provider: string; config: ModelConfig }> = [];

    for (const [provider, configs] of this.models) {
      for (const config of configs) {
        if (config.level !== targetLevel) continue;
        if (visionOnly && !config.vision) continue;
        candidates.push({ provider, config });
      }
    }

    if (candidates.length > 0) {
      const selected = candidates[0];
      return { model: `${selected.provider}/${selected.config.id}`, config: selected.config, complexity: 0, reason: '' };
    }

    return this.selectNearestModel(targetLevel, visionOnly);
  }

  private selectNearestModel(targetLevel: ModelLevel, visionOnly = false): RouteResult | null {
    const targetPriority = LEVEL_PRIORITY[targetLevel];
    const candidates: Array<{ provider: string; config: ModelConfig; diff: number; priority: number }> = [];

    for (const [provider, configs] of this.models) {
      for (const config of configs) {
        if (visionOnly && !config.vision) continue;
        const priority = LEVEL_PRIORITY[config.level];
        candidates.push({ provider, config, diff: priority - targetPriority, priority });
      }
    }

    if (candidates.length === 0) return null;

    const filtered = this.filterByMode(candidates, targetPriority);
    const selected = filtered.sort((a, b) => Math.abs(a.diff) - Math.abs(b.diff))[0];
    return { model: `${selected.provider}/${selected.config.id}`, config: selected.config, complexity: 0, reason: `使用最接近级别的模型 (${selected.config.level})` };
  }

  private filterByMode(candidates: Array<{ provider: string; config: ModelConfig; diff: number; priority: number }>, targetPriority: number): Array<{ provider: string; config: ModelConfig; diff: number; priority: number }> {
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
    return { id: id || modelId, vision: false, think: false, level: 'medium' };
  }
}

export { calculateComplexity, complexityToLevel, hasImageMedia, LEVEL_PRIORITY, type ComplexityScore };