/**
 * OpenAI Embedding Provider
 */

/** Embedding 结果 */
export interface EmbeddingResult {
  /** 嵌入向量 */
  embedding: number[];
  /** Token 使用量 */
  tokenUsage?: {
    promptTokens: number;
    totalTokens: number;
  };
}

/** Embedding Provider 接口 */
export interface EmbeddingProvider {
  /** Provider 名称 */
  readonly name: string;
  /** 生成嵌入向量 */
  embed(text: string): Promise<EmbeddingResult>;
  /** 批量生成嵌入向量 */
  embedBatch(texts: string[]): Promise<EmbeddingResult[]>;
  /** 获取向量维度 */
  getDimension(): number;
  /** 检查是否可用 */
  isAvailable(): Promise<boolean>;
}

/** OpenAI Embedding 配置 */
export interface OpenAIEmbeddingConfig {
  apiKey?: string;
  baseUrl?: string;
  /** 模型名称 (默认: text-embedding-3-small) */
  model?: string;
}

/** 默认配置 */
const DEFAULT_MODEL = 'text-embedding-3-small';
const DEFAULT_BASE_URL = 'https://api.openai.com/v1';

/** 模型维度映射 */
const MODEL_DIMENSIONS: Record<string, number> = {
  'text-embedding-3-small': 1536,
  'text-embedding-3-large': 3072,
  'text-embedding-ada-002': 1536,
};

/**
 * OpenAI Embedding Provider
 */
export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'openai-embedding';
  private model: string;
  private baseUrl: string;

  constructor(private config: OpenAIEmbeddingConfig = {}) {
    this.model = config.model ?? DEFAULT_MODEL;
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
  }

  async embed(text: string): Promise<EmbeddingResult> {
    const results = await this.embedBatch([text]);
    return results[0];
  }

  async embedBatch(texts: string[]): Promise<EmbeddingResult[]> {
    if (!this.config.apiKey) {
      throw new Error('OpenAI API key is required for embedding');
    }

    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        input: texts,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI Embedding API 错误 (${response.status}): ${errorText}`);
    }

    const data = await response.json() as {
      data: Array<{ embedding: number[]; index: number }>;
      usage?: { prompt_tokens: number; total_tokens: number };
    };

    // 按索引排序
    const sorted = data.data.sort((a, b) => a.index - b.index);

    return sorted.map(item => ({
      embedding: item.embedding,
      tokenUsage: data.usage ? {
        promptTokens: data.usage.prompt_tokens,
        totalTokens: data.usage.total_tokens,
      } : undefined,
    }));
  }

  getDimension(): number {
    return MODEL_DIMENSIONS[this.model] ?? 1536;
  }

  async isAvailable(): Promise<boolean> {
    return !!this.config.apiKey;
  }
}

/**
 * 创建 OpenAI Embedding Provider
 */
export function createOpenAIEmbeddingProvider(config: OpenAIEmbeddingConfig): EmbeddingProvider {
  return new OpenAIEmbeddingProvider(config);
}
