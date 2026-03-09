/**
 * 嵌入服务实现
 */

import type { EmbeddingService } from './types';
import { getLogger } from '@logtape/logtape';

// 重新导出类型供外部使用
export type { EmbeddingService } from './types';

const log = getLogger(['memory', 'embedding']);

/**
 * OpenAI 兼容嵌入服务
 */
export class OpenAIEmbedding implements EmbeddingService {
  constructor(
    private model: string,
    private baseUrl: string,
    private apiKey: string
  ) {}

  isAvailable(): boolean {
    // 本地服务（如 ollama）不需要 apiKey，只需要 baseUrl
    return !!this.baseUrl;
  }

  async embed(text: string): Promise<number[]> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    // 本地服务可能不需要 Authorization
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: this.model,
        input: text,
      }),
    });

    if (!response.ok) {
      throw new Error(`Embedding API 错误: ${response.status}`);
    }

    const data = await response.json() as { data: Array<{ embedding: number[] }> };
    return data.data[0].embedding;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    // 本地服务可能不需要 Authorization
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: this.model,
        input: texts,
      }),
    });

    if (!response.ok) {
      throw new Error(`Embedding API 错误: ${response.status}`);
    }

    const data = await response.json() as { data: Array<{ embedding: number[] }> };
    return data.data.map(d => d.embedding);
  }
}

/**
 * 无嵌入服务（降级方案）
 */
export class NoEmbedding implements EmbeddingService {
  isAvailable(): boolean {
    return false;
  }

  async embed(): Promise<number[]> {
    throw new Error('未配置嵌入模型，无法生成向量');
  }

  async embedBatch(): Promise<number[][]> {
    throw new Error('未配置嵌入模型，无法生成向量');
  }
}

/**
 * 创建嵌入服务实例
 */
export function createEmbeddingService(
  modelId: string | null | undefined,
  baseUrl: string,
  apiKey: string
): EmbeddingService {
  // 本地服务（如 ollama）不需要 apiKey，只需要 modelId 和 baseUrl
  if (!modelId || !baseUrl) {
    log.debug('未配置嵌入模型，使用降级方案');
    return new NoEmbedding();
  }

  log.debug('创建嵌入服务', { model: modelId, baseUrl, hasApiKey: !!apiKey });
  return new OpenAIEmbedding(modelId, baseUrl, apiKey);
}
