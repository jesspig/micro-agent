/**
 * 知识库配置处理器
 *
 * 处理知识库的初始化、配置和管理
 */

import { getLogger } from '../../runtime/infrastructure/logging';
import {
  KnowledgeRetriever,
  createDocumentScanner,
  createDocumentIndexer,
  createRetriever,
  type KnowledgeBaseConfig,
  type RetrieverConfig,
} from '../../runtime/capability/knowledge';
import { USER_KNOWLEDGE_DIR } from '../../runtime/infrastructure/config';
import type { EmbeddingService } from '../../runtime/capability/memory';
import type { SimpleKnowledgeBaseManager } from '../types';

const log = getLogger(['agent-service', 'handlers', 'knowledge']);

/** 知识库配置参数 */
export interface KnowledgeConfigParams {
  enabled?: boolean;
  basePath?: string;
  embedModel?: string;
  chunkSize?: number;
  chunkOverlap?: number;
  maxSearchResults?: number;
  minSimilarityScore?: number;
  backgroundBuild?: {
    enabled?: boolean;
    interval?: number;
    batchSize?: number;
    idleDelay?: number;
  };
  embedBaseUrl?: string;
  embedApiKey?: string;
}

/**
 * 处理配置知识库
 */
export async function handleConfigureKnowledge(
  _params: unknown,
  requestId: string,
  config: KnowledgeConfigParams,
  components: {
    knowledgeBaseManager: SimpleKnowledgeBaseManager | null;
    knowledgeRetriever: KnowledgeRetriever | null;
    knowledgeConfig: KnowledgeBaseConfig | null;
    embeddingService: EmbeddingService | null;
  },
  embeddingServiceFactory: (model: string, baseUrl: string, apiKey: string) => EmbeddingService,
  updateOrchestrator: () => void
): Promise<void> {
  // 知识库未启用
  if (config.enabled === false) {
    components.knowledgeBaseManager = null;
    components.knowledgeRetriever = null;
    components.knowledgeConfig = null;

    process.send?.({
      jsonrpc: '2.0',
      id: requestId,
      result: {
        success: true,
        config: { enabled: false },
      },
    });
    log.info('知识库已禁用');
    return;
  }

  try {
    // 构建知识库配置
    const knowledgeConfig: KnowledgeBaseConfig = {
      enabled: config.enabled ?? true,
      basePath: config.basePath ?? USER_KNOWLEDGE_DIR,
      embedModel: config.embedModel,
      chunkSize: config.chunkSize ?? 1000,
      chunkOverlap: config.chunkOverlap ?? 200,
      maxSearchResults: config.maxSearchResults ?? 5,
      minSimilarityScore: config.minSimilarityScore ?? 0.6,
      backgroundBuild: {
        enabled: config.backgroundBuild?.enabled ?? true,
        interval: config.backgroundBuild?.interval ?? 60000,
        batchSize: config.backgroundBuild?.batchSize ?? 3,
        idleDelay: config.backgroundBuild?.idleDelay ?? 5000,
      },
    };

    // 复用或创建嵌入服务
    let effectiveEmbeddingService = components.embeddingService;

    if (config.embedModel && config.embedBaseUrl) {
      const existingService = components.embeddingService;
      const needsNewService = !existingService || !existingService.isAvailable();

      if (needsNewService) {
        const slashIndex = config.embedModel.indexOf('/');
        const modelId = slashIndex > 0 ? config.embedModel.slice(slashIndex + 1) : config.embedModel;

        components.embeddingService = embeddingServiceFactory(
          modelId,
          config.embedBaseUrl,
          config.embedApiKey || ''  // apiKey 可选，本地服务不需要
        );
        effectiveEmbeddingService = components.embeddingService;

        log.info('知识库嵌入服务已创建', {
          model: config.embedModel,
          available: components.embeddingService.isAvailable()
        });
      } else if (existingService) {
        log.info('复用已有嵌入服务', {
          available: existingService.isAvailable()
        });
      }
    }

    // 创建知识库管理器（使用内部简化版）
    const { SimpleKnowledgeBaseManager } = await import('../types');
    components.knowledgeBaseManager = new SimpleKnowledgeBaseManager(knowledgeConfig);

    // 初始化知识库
    await components.knowledgeBaseManager.initialize();

    // 扫描文档目录
    const scanner = createDocumentScanner(
      components.knowledgeBaseManager.getDocumentMap(),
      knowledgeConfig.basePath,
      (type, doc) => {
        log.debug('文档变更', { type, path: doc.path });
      }
    );

    await scanner.scanDocuments();

    // 创建索引构建器
    const indexer = createDocumentIndexer(
      {
        chunkSize: knowledgeConfig.chunkSize,
        chunkOverlap: knowledgeConfig.chunkOverlap,
      },
      components.embeddingService ?? undefined,
      (doc, chunkCount) => {
        log.info('文档索引完成', { path: doc.path, chunkCount });
      },
      (doc, error) => {
        log.error('文档索引失败', { path: doc.path, error: String(error) });
      }
    );

    // 处理待索引文档
    const pendingDocs = components.knowledgeBaseManager.getDocuments()
      .filter(d => d.status === 'pending');

    for (const doc of pendingDocs) {
      await indexer.buildDocumentIndex(doc);
      components.knowledgeBaseManager.setDocument(doc.path, doc);
    }

    // 存储配置
    components.knowledgeConfig = knowledgeConfig;

    // 创建知识库检索器
    const retrieverConfig: RetrieverConfig = {
      maxResults: knowledgeConfig.maxSearchResults,
      minScore: knowledgeConfig.minSimilarityScore,
    };

    components.knowledgeRetriever = createRetriever(
      components.knowledgeBaseManager.getDocumentMap(),
      effectiveEmbeddingService ?? undefined,
      retrieverConfig
    );

    log.info('知识库检索器已创建', {
      maxResults: retrieverConfig.maxResults,
      minScore: retrieverConfig.minScore,
      hasEmbedding: effectiveEmbeddingService?.isAvailable() ?? false,
    });

    const stats = components.knowledgeBaseManager.getStats();

    process.send?.({
      jsonrpc: '2.0',
      id: requestId,
      result: {
        success: true,
        config: {
          enabled: true,
          basePath: knowledgeConfig.basePath,
          embedModel: knowledgeConfig.embedModel,
        },
        stats: {
          totalDocuments: stats.totalDocuments,
          indexedDocuments: stats.indexedDocuments,
          pendingDocuments: stats.pendingDocuments,
          hasRetriever: components.knowledgeRetriever !== null,
        },
      },
    });

    log.info('知识库初始化完成', {
      basePath: knowledgeConfig.basePath,
      totalDocs: stats.totalDocuments,
      indexedDocs: stats.indexedDocuments,
      hasEmbedding: components.embeddingService?.isAvailable() ?? false,
    });

    updateOrchestrator();
  } catch (error) {
    log.error('知识库初始化失败', { error: (error as Error).message });

    process.send?.({
      jsonrpc: '2.0',
      id: requestId,
      error: {
        code: -32003,
        message: `知识库初始化失败: ${(error as Error).message}`
      },
    });
  }
}