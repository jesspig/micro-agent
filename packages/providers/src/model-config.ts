/**
 * 模型配置服务
 * 管理 chat/tool/embed 三层模型配置
 */

import type { LLMGateway } from './gateway';
import type { ModelsConfig } from '@microbot/config';

/** 模型验证错误 */
export interface ModelValidationError {
  /** 模型 ID */
  model: string;
  /** 模型类型 */
  type: 'chat' | 'tool' | 'embed';
  /** 错误消息 */
  message: string;
}

/** 模型验证结果 */
export interface ModelValidationResult {
  /** 是否验证通过 */
  valid: boolean;
  /** 错误列表 */
  errors: ModelValidationError[];
}

/**
 * 模型配置服务
 * 
 * 职责：
 * - 管理 chat/tool/embed 模型配置
 * - 提供模型选择逻辑
 * - 验证模型配置有效性
 */
export class ModelConfigService {
  constructor(
    private config: ModelsConfig,
    private gateway?: LLMGateway
  ) {}

  /**
   * 获取对话模型
   */
  getChatModel(): string {
    return this.config.chat ?? '';
  }

  /**
   * 获取工具调用模型
   * 默认使用 chat 模型
   */
  getToolModel(): string {
    return this.config.tool ?? this.config.chat ?? '';
  }

  /**
   * 获取嵌入模型
   * 返回 null 表示未配置
   */
  getEmbedModel(): string | null {
    return this.config.embed ?? null;
  }

  /**
   * 检查是否配置了嵌入模型
   */
  hasEmbedModel(): boolean {
    return !!this.config.embed;
  }

  /**
   * 获取视觉模型
   */
  getVisionModel(): string | null {
    return this.config.vision ?? null;
  }

  /**
   * 检查是否配置了视觉模型
   */
  hasVisionModel(): boolean {
    return !!this.config.vision;
  }

  /**
   * 获取编程模型
   */
  getCoderModel(): string | null {
    return this.config.coder ?? null;
  }

  /**
   * 检查是否配置了编程模型
   */
  hasCoderModel(): boolean {
    return !!this.config.coder;
  }

  /**
   * 验证模型配置
   */
  async validate(): Promise<ModelValidationResult> {
    const errors: ModelValidationError[] = [];

    // 验证 chat 模型
    if (!this.config.chat) {
      errors.push({
        model: '',
        type: 'chat',
        message: 'chat 模型必须配置',
      });
    }

    // 可选：验证模型是否可用
    if (this.gateway) {
      const availableModels = await this.gateway.listModels();
      if (availableModels) {
        if (this.config.chat && !this.isModelAvailable(this.config.chat, availableModels)) {
          errors.push({
            model: this.config.chat,
            type: 'chat',
            message: `chat 模型 "${this.config.chat}" 不可用`,
          });
        }
        if (this.config.tool && !this.isModelAvailable(this.config.tool, availableModels)) {
          errors.push({
            model: this.config.tool,
            type: 'tool',
            message: `tool 模型 "${this.config.tool}" 不可用`,
          });
        }
        if (this.config.embed && !this.isModelAvailable(this.config.embed, availableModels)) {
          errors.push({
            model: this.config.embed,
            type: 'embed',
            message: `embed 模型 "${this.config.embed}" 不可用`,
          });
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * 检查模型是否在可用列表中
   */
  private isModelAvailable(modelId: string, availableModels: string[]): boolean {
    // 支持带 provider 前缀的模型 ID
    const plainModelId = modelId.includes('/') ? modelId.split('/')[1] : modelId;
    return availableModels.some(m => m === modelId || m === plainModelId || m.endsWith(`/${plainModelId}`));
  }

  /**
   * 获取完整配置
   */
  getConfig(): Readonly<ModelsConfig> {
    return { ...this.config };
  }
}
