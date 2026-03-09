/**
 * 检索模式选择器
 *
 * 根据嵌入模型配置自动选择检索模式。
 * - 未配置 embed 模型：使用全文检索
 * - 配置 embed 模型：使用混合检索
 */

import { getLogger } from '@logtape/logtape';

const log = getLogger(['memory', 'mode-selector']);

/** 检索模式 */
export type RetrievalMode = 'hybrid' | 'vector' | 'fulltext' | 'auto';

/** 模式选择器配置 */
export interface ModeSelectorConfig {
  /** 嵌入模型是否可用 */
  embeddingAvailable: boolean;
  /** 向量检索是否健康 */
  vectorHealthy?: boolean;
  /** 用户配置的检索模式 */
  configuredMode?: RetrievalMode;
}

/**
 * 检索模式选择器
 *
 * 自动选择最优检索模式：
 * 1. 用户显式配置模式 → 使用配置模式
 * 2. 嵌入模型不可用 → 全文检索
 * 3. 嵌入模型可用 → 混合检索
 */
export class RetrievalModeSelector {
  private embeddingAvailable: boolean;
  private vectorHealthy: boolean;
  private configuredMode: RetrievalMode | undefined;

  constructor(config: ModeSelectorConfig) {
    this.embeddingAvailable = config.embeddingAvailable;
    this.vectorHealthy = config.vectorHealthy ?? true;
    this.configuredMode = config.configuredMode;
  }

  /**
   * 选择检索模式
   * @returns 检索模式
   */
  selectMode(): RetrievalMode {
    // 用户显式配置模式
    if (this.configuredMode && this.configuredMode !== 'auto') {
      // 验证配置是否可行
      if (this.configuredMode === 'vector' && !this.embeddingAvailable) {
        log.warn('配置为向量检索模式，但嵌入模型不可用，降级为全文检索');
        return 'fulltext';
      }
      if (this.configuredMode === 'hybrid' && !this.embeddingAvailable) {
        log.warn('配置为混合检索模式，但嵌入模型不可用，降级为全文检索');
        return 'fulltext';
      }
      return this.configuredMode;
    }

    // 自动选择
    if (!this.embeddingAvailable) {
      log.debug('嵌入模型不可用，使用全文检索');
      return 'fulltext';
    }

    if (!this.vectorHealthy) {
      log.debug('向量检索不健康，使用全文检索');
      return 'fulltext';
    }

    log.debug('嵌入模型可用，使用混合检索');
    return 'hybrid';
  }

  /**
   * 更新嵌入模型可用状态
   */
  setEmbeddingAvailable(available: boolean): void {
    this.embeddingAvailable = available;
    log.debug('嵌入模型可用状态已更新', { available });
  }

  /**
   * 更新向量检索健康状态
   */
  setVectorHealthy(healthy: boolean): void {
    this.vectorHealthy = healthy;
    log.debug('向量检索健康状态已更新', { healthy });
  }

  /**
   * 更新配置的检索模式
   */
  setConfiguredMode(mode: RetrievalMode | undefined): void {
    this.configuredMode = mode;
    log.debug('配置的检索模式已更新', { mode });
  }

  /**
   * 获取当前状态
   */
  getStatus(): {
    embeddingAvailable: boolean;
    vectorHealthy: boolean;
    configuredMode: RetrievalMode | undefined;
    currentMode: RetrievalMode;
  } {
    return {
      embeddingAvailable: this.embeddingAvailable,
      vectorHealthy: this.vectorHealthy,
      configuredMode: this.configuredMode,
      currentMode: this.selectMode(),
    };
  }
}

/**
 * 根据配置快速选择模式
 * @param embeddingAvailable - 嵌入模型是否可用
 * @param configuredMode - 用户配置的模式
 * @returns 检索模式
 */
export function selectRetrievalMode(
  embeddingAvailable: boolean,
  configuredMode?: RetrievalMode
): RetrievalMode {
  if (configuredMode && configuredMode !== 'auto') {
    if (
      (configuredMode === 'vector' || configuredMode === 'hybrid') &&
      !embeddingAvailable
    ) {
      return 'fulltext';
    }
    return configuredMode;
  }

  return embeddingAvailable ? 'hybrid' : 'fulltext';
}
