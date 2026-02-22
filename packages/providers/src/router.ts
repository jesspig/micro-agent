/**
 * 模型路由器
 *
 * 基于任务类型选择模型：
 * - vision：图片识别任务
 * - coder：编程任务
 * - chat：常规对话
 */

import type { ModelConfig } from '@microbot/config';
import type { LLMProvider, LLMMessage } from './base';
import { hasImageMedia } from './complexity';
import type { TaskTypeResult, ModelInfo, IntentPromptBuilder, UserPromptBuilder } from './prompts';
import { getLogger } from '@logtape/logtape';

const log = getLogger(['router']);

/** 任务类型 */
export type TaskType = 'vision' | 'coder' | 'chat';

/** 模型路由配置 */
export interface ModelRouterConfig {
  chatModel: string;
  visionModel?: string;
  coderModel?: string;
  intentModel?: string;
  models: Map<string, ModelConfig[]>;
  /** 意图识别 System Prompt 构建函数 */
  buildIntentPrompt?: IntentPromptBuilder;
  /** 用户 Prompt 构建函数 */
  buildUserPrompt?: UserPromptBuilder;
}

/** 路由结果 */
export interface RouteResult {
  model: string;
  config: ModelConfig;
  reason: string;
  /** 是否为视觉任务（需要保留图片内容） */
  isVision: boolean;
}

/**
 * 模型路由器
 */
export class ModelRouter {
  private models: Map<string, ModelConfig[]>;
  private chatModel: string;
  private visionModel?: string;
  private coderModel?: string;
  private intentModel: string;
  private buildIntentPrompt?: IntentPromptBuilder;
  private buildUserPrompt?: UserPromptBuilder;
  private provider: LLMProvider | null = null;

  constructor(config: ModelRouterConfig) {
    this.models = config.models;
    this.chatModel = config.chatModel;
    this.visionModel = config.visionModel;
    this.coderModel = config.coderModel;
    this.intentModel = config.intentModel ?? config.chatModel;
    this.buildIntentPrompt = config.buildIntentPrompt;
    this.buildUserPrompt = config.buildUserPrompt;
  }

  setProvider(provider: LLMProvider): void {
    this.provider = provider;
  }

  /**
   * 分析任务类型（图片识别/编写代码/常规对话）
   */
  async analyzeTaskType(messages: Array<{ role: string; content: string }>, media?: string[]): Promise<TaskTypeResult> {
    const hasImage = hasImageMedia(media);
    const content = messages.map(m => m.content).join(' ');

    log.info('[Router] 任务类型分析', { hasImage, contentLength: content.length });

    // 有图片直接判定为图片识别任务
    if (hasImage) {
      log.info('[Router] 检测到图片输入，使用视觉模型');
      return { type: 'vision', reason: '检测到图片输入' };
    }

    // 无图片时使用LLM进行任务类型识别
    if (this.provider && this.buildIntentPrompt && this.buildUserPrompt) {
      const modelInfos = this.buildModelInfos();
      const userContent = messages.map(m => `${m.role}: ${m.content}`).join('\n');

      const analysisMessages: LLMMessage[] = [
        { role: 'system', content: this.buildIntentPrompt(modelInfos) },
        { role: 'user', content: this.buildUserPrompt(userContent, hasImage) },
      ];

      try {
        const response = await this.provider.chat(analysisMessages, [], this.intentModel, { maxTokens: 200, temperature: 0.3 });
        const jsonMatch = response.content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]) as { type: string; reason: string };
          const validTypes: TaskType[] = ['vision', 'coder', 'chat'];
          if (validTypes.includes(parsed.type as TaskType)) {
            log.info('[Router] LLM 任务类型识别', { type: parsed.type, reason: parsed.reason });
            return { type: parsed.type as TaskType, reason: parsed.reason };
          }
        }
      } catch (error) {
        log.warn('[Router] 任务类型识别失败: {error}', { error: error instanceof Error ? error.message : String(error) });
      }
    }

    // 默认回退到常规对话
    log.info('[Router] 任务类型识别失败，默认使用常规对话');
    return { type: 'chat', reason: '默认对话类型' };
  }

  /**
   * 根据任务类型选择模型
   */
  selectByTaskType(type: TaskType): RouteResult {
    switch (type) {
      case 'vision':
        return this.selectVisionModel();
      case 'coder':
        return this.selectCoderModel();
      case 'chat':
      default:
        return this.selectChatModel();
    }
  }

  /**
   * 选择视觉模型
   */
  private selectVisionModel(): RouteResult {
    if (this.visionModel) {
      const config = this.getModelConfig(this.visionModel);
      return { model: this.visionModel, config, reason: '使用视觉模型', isVision: true };
    }

    // 无视觉模型时使用对话模型
    log.warn('[Router] 未配置视觉模型，使用对话模型代替');
    return this.selectChatModel();
  }

  /**
   * 选择编程模型
   */
  private selectCoderModel(): RouteResult {
    if (this.coderModel) {
      const config = this.getModelConfig(this.coderModel);
      return { model: this.coderModel, config, reason: '使用编程模型', isVision: false };
    }

    // 无专用编程模型时使用对话模型
    log.info('[Router] 未配置专用编程模型，使用对话模型');
    return this.selectChatModel();
  }

  /**
   * 选择对话模型
   */
  private selectChatModel(): RouteResult {
    const config = this.getModelConfig(this.chatModel);
    return { model: this.chatModel, config, reason: '使用对话模型', isVision: false };
  }

  updateConfig(config: Partial<ModelRouterConfig>): void {
    if (config.chatModel !== undefined) this.chatModel = config.chatModel;
    if (config.visionModel !== undefined) this.visionModel = config.visionModel;
    if (config.coderModel !== undefined) this.coderModel = config.coderModel;
    if (config.intentModel !== undefined) this.intentModel = config.intentModel;
    if (config.models !== undefined) this.models = config.models;
  }

  getStatus(): { chatModel: string; visionModel?: string; coderModel?: string; intentModel: string } {
    return {
      chatModel: this.chatModel,
      visionModel: this.visionModel,
      coderModel: this.coderModel,
      intentModel: this.intentModel,
    };
  }

  private buildModelInfos(): ModelInfo[] {
    const infos: ModelInfo[] = [];
    for (const [provider, models] of this.models) {
      for (const config of models) {
        infos.push({ id: `${provider}/${config.id}` });
      }
    }
    log.info('[Router] 可用模型列表', { count: infos.length });
    return infos;
  }

  private getModelConfig(modelId: string): ModelConfig {
    const [provider, id] = modelId.includes('/') ? modelId.split('/') : [null, modelId];
    if (provider) {
      const models = this.models.get(provider);
      const found = models?.find(m => m.id === id);
      if (found) return found;
    }
    return { id: id || modelId };
  }
}

export { hasImageMedia };
