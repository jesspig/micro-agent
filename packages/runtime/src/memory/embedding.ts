/**
 * 嵌入服务实现
 */

import type { EmbeddingService } from './types';
import { getLogger } from '@logtape/logtape';

const log = getLogger(['memory', 'embedding']);

/**
 * OpenAI 兼容嵌入服务
 */
export class OpenAIEmbedding implements EmbeddingService {
  private client: {
    embeddings: {
      create: (params: { model: string; input: string | string[] }) => Promise<{
        data: Array<{ embedding: number[] }>;
      }>;
    };
  };

  /**
   * 创建 OpenAI 嵌入服务实例
   * @param model 嵌入模型 ID
   * @param baseUrl API 基础 URL
   * @param apiKey API 密钥
   */
  constructor(
    private model: string,
    baseUrl: string,
    apiKey: string
  ) {
    // 使用 fetch 直接调用 API
    this.client = {
      embeddings: {
        create: async (params: { model: string; input: string | string[] }) => {
          const response = await fetch(`${baseUrl}/embeddings`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify(params),
          });

          if (!response.ok) {
            throw new Error(`Embedding API 错误: ${response.status}`);
          }

          const data = await response.json() as { data: Array<{ embedding: number[] }> };
          return data;
        },
      },
    };
  }

  isAvailable(): boolean {
    return true;
  }

  async embed(text: string): Promise<number[]> {
    const response = await this.client.embeddings.create({
      model: this.model,
      input: text,
    });
    return response.data[0].embedding;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const response = await this.client.embeddings.create({
      model: this.model,
      input: texts,
    });
    return response.data.map(d => d.embedding);
  }
}

/**
 * 无嵌入服务（降级方案）
 * 当没有配置嵌入模型时使用
 */
export class NoEmbedding implements EmbeddingService {
  isAvailable(): boolean {
    return false;
  }

  embed(): Promise<number[]> {
    throw new Error('未配置嵌入模型，无法生成向量');
  }

  embedBatch(): Promise<number[][]> {
    throw new Error('未配置嵌入模型，无法生成向量');
  }
}

/**
 * 创建嵌入服务实例
 * @param modelId 模型 ID
 * @param baseUrl API 基础 URL
 * @param apiKey API 密钥
 * @returns 嵌入服务实例
 */
export function createEmbeddingService(
  modelId: string | null | undefined,
  baseUrl: string,
  apiKey: string
): EmbeddingService {
  if (!modelId) {
    log.info('未配置嵌入模型，使用降级方案');
    return new NoEmbedding();
  }

  log.info('创建嵌入服务', { model: modelId });
  return new OpenAIEmbedding(modelId, baseUrl, apiKey);
}
