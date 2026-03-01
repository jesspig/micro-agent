/**
 * 模型路由器
 *
 * 基于任务类型选择模型：
 * - vision：图片识别任务
 * - coder：编程任务
 * - chat：常规对话
 */

import type { ModelConfig } from '@micro-agent/config';
import type { LLMProvider } from './base';
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
  private provider: LLMProvider | null = null;

  constructor(config: ModelRouterConfig) {
    this.models = config.models;
    this.chatModel = config.chatModel;
    this.visionModel = config.visionModel;
    this.coderModel = config.coderModel;
    this.intentModel = config.intentModel ?? config.chatModel;
  }

  setProvider(provider: LLMProvider): void {
    this.provider = provider;
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