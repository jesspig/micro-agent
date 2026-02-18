/**
 * 模型自动路由器
 * 
 * 根据关键词 + 消息长度 + LLM 意图识别自动选择合适性能级别的模型：
 * - fast: 简单任务（问候、简单问答）
 * - low: 基础任务（格式化、简单翻译）
 * - medium: 常规任务（一般对话、代码补全）
 * - high: 复杂任务（代码重构、数据分析）
 * - ultra: 高难任务（复杂推理、架构设计）
 */

import type { ModelConfig, ModelLevel, RoutingConfig, RoutingRule } from '../config/schema';
import { DEFAULT_ROUTING_CONFIG } from '../config/schema';
import type { LLMProvider, LLMMessage } from './base';
import { 
  buildIntentSystemPrompt, 
  buildIntentUserPrompt, 
  type IntentResult,
  type ModelInfo,
} from '../prompts';
import { getLogger } from '@logtape/logtape';

const log = getLogger(['router']);

/** 任务复杂度评分（0-100） */
export type ComplexityScore = number;

/** 复杂度级别映射 */
const COMPLEXITY_THRESHOLDS: Record<ModelLevel, [number, number]> = {
  fast: [0, 20],      // 简单问答、实时聊天、高吞吐场景
  low: [20, 40],      // 基础指令跟随、摘要、简单逻辑
  medium: [40, 60],   // 通用任务、多数业务场景（默认）
  high: [60, 80],     // 复杂编码、数学推理、多步规划
  ultra: [80, 100],   // 科研级任务、高难度推理、架构设计
};

/** 性能级别优先级（数字越大性能越强） */
const LEVEL_PRIORITY: Record<ModelLevel, number> = {
  fast: 1,
  low: 2,
  medium: 3,
  high: 4,
  ultra: 5,
};

/** 模型路由配置 */
export interface ModelRouterConfig {
  /** 对话模型（provider/model 格式） */
  chatModel: string;
  /** 意图识别模型（provider/model 格式），默认使用 chatModel */
  checkModel?: string;
  /** 是否开启自动路由 */
  auto: boolean;
  /** 性能优先模式 */
  max: boolean;
  /** 可用模型列表（按 provider 分组） */
  models: Map<string, ModelConfig[]>;
  /** 路由规则配置 */
  routing?: RoutingConfig;
}

/** 路由结果 */
export interface RouteResult {
  /** 选中的模型 */
  model: string;
  /** 模型配置 */
  config: ModelConfig;
  /** 复杂度评分 */
  complexity: ComplexityScore;
  /** 路由原因 */
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

  /**
   * 设置 LLM Provider（用于意图识别）
   */
  setProvider(provider: LLMProvider): void {
    this.provider = provider;
  }

  /**
   * 路由到合适的模型
   * @param messages - 消息历史
   * @param media - 媒体文件列表（图片等）
   * @returns 路由结果
   */
  route(
    messages: Array<{ role: string; content: string }>,
    media?: string[]
  ): RouteResult {
    // 自动路由未开启，使用 chat 模型
    if (!this.auto) {
      const config = this.getModelConfig(this.chatModel);
      return {
        model: this.chatModel,
        config,
        complexity: 0,
        reason: '自动路由未开启，使用对话模型',
      };
    }

    // 检测是否有图片媒体
    const hasImage = this.hasImageMedia(media);

    // 合并消息内容
    const content = messages.map(m => m.content).join(' ');
    const contentLength = content.length;

    // 0. 如果有图片，优先选择视觉模型
    if (hasImage) {
      const result = this.selectVisionModel(messages, content);
      if (result) {
        log.debug('[Router] 检测到图片，选择视觉模型: {model}', { model: result.model });
        return result;
      }
      log.warn('[Router] 未找到视觉模型，使用默认模型');
    }

    // 1. 性能优先模式，选择最高性能模型
    if (this.max) {
      const result = this.selectModelByLevel('ultra');
      if (result) {
        log.debug('[Router] 性能优先模式，选择最高性能模型: {model}', { model: result.model });
        return { ...result, complexity: 100, reason: '性能优先模式' };
      }
    }

    // 2. 计算任务复杂度（快速路由）
    const complexity = this.calculateComplexity(messages, content, contentLength);
    
    // 根据复杂度选择模型
    const level = this.complexityToLevel(complexity);
    const result = this.selectModelByLevel(level);
    
    if (result) {
      log.debug('[Router] 复杂度 {score} -> {level} -> {model}', { 
        score: complexity, 
        level, 
        model: result.model 
      });
      return { ...result, complexity, reason: `复杂度评分: ${complexity}` };
    }

    // 没有找到合适模型，使用 chat 模型
    const config = this.getModelConfig(this.chatModel);
    return {
      model: this.chatModel,
      config,
      complexity,
      reason: '未找到合适模型，使用对话模型',
    };
  }

  /**
   * 使用 check 模型进行意图识别
   * 返回推荐的模型
   * 
   * 注意：check 模型使用配置中指定的 models.check 或 models.chat，
   * 不受自动路由影响，确保意图识别的稳定性
   */
  async analyzeIntent(
    messages: Array<{ role: string; content: string }>,
    media?: string[]
  ): Promise<IntentResult> {
    // 如果没有 provider，回退到规则路由
    if (!this.provider) {
      log.warn('[Router] 未设置 LLM Provider，使用规则路由');
      return this.fallbackIntent(messages, media);
    }

    // 检测是否有图片
    const hasImage = this.hasImageMedia(media);

    // 构建可用模型列表
    const modelInfos = this.buildModelInfos(hasImage);
    
    // 构建分析消息
    const userContent = messages.map(m => `${m.role}: ${m.content}`).join('\n');
    const analysisMessages: LLMMessage[] = [
      { role: 'system', content: buildIntentSystemPrompt(modelInfos) },
      { role: 'user', content: buildIntentUserPrompt(userContent, hasImage) },
    ];

    try {
      // 使用 check 模型分析（配置中的模型，不受路由影响）
      const response = await this.provider.chat(
        analysisMessages,
        [], // 不传递工具
        this.checkModel.includes('/') ? this.checkModel.split('/')[1] : this.checkModel,
        { maxTokens: 200, temperature: 0.3 } // 低温度确保稳定输出
      );

      // 解析 JSON 结果
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as { model: string; reason: string };
        
        // 验证模型是否在可用列表中
        const validModel = modelInfos.find(m => m.id === parsed.model);
        if (!validModel) {
          log.warn('[Router] 推荐的模型不在可用列表中: {model}', { model: parsed.model });
          // 使用 chat 模型作为默认
          return { model: this.chatModel, reason: '推荐模型不可用，使用默认模型' };
        }

        log.debug('[Router] 意图识别: model={model}, reason={reason}, checkModel={checkModel}', {
          model: parsed.model,
          reason: parsed.reason,
          checkModel: this.checkModel,
        });

        return { model: parsed.model, reason: parsed.reason };
      }
    } catch (error) {
      log.warn('[Router] 意图识别失败: {error}', { 
        error: error instanceof Error ? error.message : String(error) 
      });
    }

    // 回退到规则路由
    return this.fallbackIntent(messages, media);
  }

  /**
   * 构建模型信息列表（用于提示词）
   */
  private buildModelInfos(requireVision: boolean): ModelInfo[] {
    const infos: ModelInfo[] = [];

    for (const [provider, models] of this.models) {
      for (const config of models) {
        // 如果需要视觉但模型不支持，跳过
        if (requireVision && !config.vision) continue;
        
        infos.push({
          id: `${provider}/${config.id}`,
          level: config.level,
          vision: config.vision,
          think: config.think,
        });
      }
    }

    return infos;
  }

  /**
   * 回退意图识别（规则 + 复杂度计算）
   */
  private fallbackIntent(
    messages: Array<{ role: string; content: string }>,
    media?: string[]
  ): IntentResult {
    const content = messages.map(m => m.content).join(' ');
    const contentLength = content.length;
    const hasImage = this.hasImageMedia(media);

    // 先尝试规则匹配
    if (this.routing.enabled && this.routing.rules.length > 0) {
      const matchedRule = this.matchRule(content, contentLength);
      if (matchedRule) {
        // 根据规则级别选择模型
        const result = this.selectModelByLevel(matchedRule.level, hasImage);
        if (result) {
          return { model: result.model, reason: `关键词匹配` };
        }
      }
    }

    // 计算复杂度
    const complexity = this.calculateComplexity(messages, content, contentLength);
    const level = this.complexityToLevel(complexity);

    // 根据复杂度选择模型
    const result = this.selectModelByLevel(level, hasImage);
    if (result) {
      return { model: result.model, reason: `复杂度评分: ${complexity}` };
    }

    // 使用 chat 模型
    return { model: this.chatModel, reason: '回退到默认模型' };
  }

  /**
   * 根据意图识别结果选择模型
   */
  selectModelByIntent(intent: IntentResult): RouteResult {
    const config = this.getModelConfig(intent.model);
    return {
      model: intent.model,
      config,
      complexity: 0,
      reason: `意图识别: ${intent.reason}`,
    };
  }

  /**
   * 检测是否有图片媒体
   */
  private hasImageMedia(media?: string[]): boolean {
    if (!media || media.length === 0) return false;
    
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'];
    return media.some(m => {
      const lower = m.toLowerCase();
      return imageExtensions.some(ext => lower.endsWith(ext)) ||
             lower.includes('image/') ||
             lower.startsWith('data:image');
    });
  }

  /**
   * 选择视觉模型
   * 优先选择支持 vision 的模型，同时考虑复杂度
   */
  private selectVisionModel(
    messages: Array<{ role: string; content: string }>,
    content: string
  ): RouteResult | null {
    // 收集所有支持视觉的模型
    const visionModels: Array<{ provider: string; config: ModelConfig }> = [];

    for (const [provider, models] of this.models) {
      for (const config of models) {
        if (config.vision) {
          visionModels.push({ provider, config });
        }
      }
    }

    if (visionModels.length === 0) return null;

    // 计算复杂度决定使用哪个级别的视觉模型
    const complexity = this.calculateComplexity(messages, content, content.length);
    const targetLevel = this.complexityToLevel(complexity);

    // 按级别优先级排序
    const sortedByLevel = visionModels.sort((a, b) => {
      const priorityDiff = LEVEL_PRIORITY[b.config.level] - LEVEL_PRIORITY[a.config.level];
      if (this.max) {
        return priorityDiff; // 性能优先：高级别在前
      }
      return -priorityDiff; // 速度优先：低级别在前
    });

    // 找最接近目标级别的视觉模型
    const targetPriority = LEVEL_PRIORITY[targetLevel];
    let best: { provider: string; config: ModelConfig; diff: number } | null = null;

    for (const { provider, config } of sortedByLevel) {
      const priority = LEVEL_PRIORITY[config.level];
      const diff = Math.abs(priority - targetPriority);
      
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

  /**
   * 匹配路由规则
   * @param content - 消息内容
   * @param length - 消息长度
   * @returns 匹配的规则，无匹配返回 null
   */
  private matchRule(content: string, length: number): RoutingRule | null {
    const contentLower = content.toLowerCase();
    
    // 按优先级排序规则
    const sortedRules = [...this.routing.rules].sort((a, b) => b.priority - a.priority);

    for (const rule of sortedRules) {
      // 检查长度条件
      if (rule.minLength !== undefined && length < rule.minLength) continue;
      if (rule.maxLength !== undefined && length > rule.maxLength) continue;

      // 检查关键词
      if (rule.keywords.length === 0) continue;
      
      const matched = rule.keywords.some(keyword => 
        contentLower.includes(keyword.toLowerCase())
      );

      if (matched) {
        return rule;
      }
    }

    return null;
  }

  /**
   * 计算任务复杂度（0-100）
   */
  private calculateComplexity(
    messages: Array<{ role: string; content: string }>,
    content: string,
    length: number
  ): ComplexityScore {
    const cfg = this.routing;
    
    // 基础分数
    let score = cfg.baseScore;

    // 1. 长度因素
    const lengthScore = Math.min(20, Math.floor(length / 100) * cfg.lengthWeight);
    score += lengthScore;

    // 2. 代码块因素
    if (content.includes('```') || content.includes('`')) {
      score += cfg.codeBlockScore;
    }

    // 3. 工具调用因素
    if (content.includes('tool') || content.includes('工具')) {
      score += cfg.toolCallScore;
    }

    // 4. 多轮对话因素
    if (messages.length > 1) {
      score += Math.min(10, messages.length * cfg.multiTurnScore);
    }

    // 限制在 0-100 范围
    return Math.max(0, Math.min(100, score));
  }

  /**
   * 复杂度评分转性能级别
   */
  private complexityToLevel(score: ComplexityScore): ModelLevel {
    for (const [level, [min, max]] of Object.entries(COMPLEXITY_THRESHOLDS)) {
      if (score >= min && score < max) {
        return level as ModelLevel;
      }
    }
    return 'ultra';
  }

  /**
   * 根据性能级别选择模型
   * @param targetLevel - 目标级别
   * @param visionOnly - 是否只选择视觉模型
   */
  private selectModelByLevel(targetLevel: ModelLevel, visionOnly = false): RouteResult | null {
    // 查找所有匹配级别的模型
    const candidates: Array<{ provider: string; config: ModelConfig }> = [];

    for (const [provider, models] of this.models) {
      for (const config of models) {
        // 级别匹配
        if (config.level !== targetLevel) continue;
        // 视觉筛选
        if (visionOnly && !config.vision) continue;
        candidates.push({ provider, config });
      }
    }

    if (candidates.length === 0) {
      // 没有精确匹配，找最接近的级别
      return this.selectNearestModel(targetLevel, visionOnly);
    }

    // 返回第一个匹配的模型
    const selected = candidates[0];
    return {
      model: `${selected.provider}/${selected.config.id}`,
      config: selected.config,
      complexity: 0,
      reason: '',
    };
  }

  /**
   * 选择最接近目标级别的模型
   * 
   * 速度优先模式：选择低于或等于目标级别的模型
   * 性能优先模式：选择高于或等于目标级别的模型
   */
  private selectNearestModel(targetLevel: ModelLevel, visionOnly = false): RouteResult | null {
    const targetPriority = LEVEL_PRIORITY[targetLevel];
    
    // 收集所有可用模型及其差异
    const candidates: Array<{ provider: string; config: ModelConfig; diff: number; priority: number }> = [];

    for (const [provider, models] of this.models) {
      for (const config of models) {
        // 视觉筛选
        if (visionOnly && !config.vision) continue;
        const priority = LEVEL_PRIORITY[config.level];
        const diff = priority - targetPriority; // 正数表示更高级别，负数表示更低级别
        candidates.push({ provider, config, diff, priority });
      }
    }

    if (candidates.length === 0) return null;

    // 根据模式筛选候选模型
    let filtered: Array<{ provider: string; config: ModelConfig; diff: number; priority: number }>;
    
    if (this.max) {
      // 性能优先：选择高于或等于目标级别的模型
      filtered = candidates.filter(c => c.diff >= 0);
      if (filtered.length === 0) {
        // 没有更高级别的，选择当前可用的最高级别
        filtered = candidates.sort((a, b) => b.priority - a.priority).slice(0, 1);
      }
    } else {
      // 速度优先：选择低于或等于目标级别的模型
      filtered = candidates.filter(c => c.diff <= 0);
      if (filtered.length === 0) {
        // 没有更低级别的，选择当前可用的最低级别
        filtered = candidates.sort((a, b) => a.priority - b.priority).slice(0, 1);
      }
    }

    // 在筛选后的候选中选择差异最小的（最接近目标级别）
    const selected = filtered.sort((a, b) => Math.abs(a.diff) - Math.abs(b.diff))[0];

    return {
      model: `${selected.provider}/${selected.config.id}`,
      config: selected.config,
      complexity: 0,
      reason: `使用最接近级别的模型 (${selected.config.level})`,
    };
  }

  /**
   * 获取模型配置
   */
  private getModelConfig(modelId: string): ModelConfig {
    const [provider, id] = modelId.includes('/') 
      ? modelId.split('/') 
      : [null, modelId];

    if (provider) {
      const models = this.models.get(provider);
      if (models) {
        const found = models.find(m => m.id === id);
        if (found) return found;
      }
    }

    // 返回默认配置
    return {
      id: id || modelId,
      vision: false,
      think: false,
      tool: true,
      level: 'medium',
    };
  }

  /**
   * 更新路由配置
   */
  updateConfig(config: Partial<ModelRouterConfig>): void {
    if (config.chatModel !== undefined) this.chatModel = config.chatModel;
    if (config.checkModel !== undefined) this.checkModel = config.checkModel;
    if (config.auto !== undefined) this.auto = config.auto;
    if (config.max !== undefined) this.max = config.max;
    if (config.models !== undefined) this.models = config.models;
    if (config.routing !== undefined) this.routing = config.routing;
  }

  /**
   * 获取当前路由配置
   */
  getRoutingConfig(): RoutingConfig {
    return this.routing;
  }

  /**
   * 获取路由状态信息
   */
  getStatus(): { auto: boolean; max: boolean; rulesCount: number; chatModel: string; checkModel: string } {
    return {
      auto: this.auto,
      max: this.max,
      rulesCount: this.routing.rules.length,
      chatModel: this.chatModel,
      checkModel: this.checkModel,
    };
  }
}
