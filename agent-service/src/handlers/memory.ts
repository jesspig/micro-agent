/**
 * 记忆系统配置处理器
 *
 * 处理记忆系统的初始化、配置和管理
 */

import { getLogger } from '../../runtime/infrastructure/logging';
import {
  SimpleMemoryManager,
  MemoryStore,
  MemorySearcher,
  FTSSearcher,
  createEmbeddingService,
  type EmbeddingService,
  type MemoryStoreAdapter,
  type MemorySearcherAdapter,
} from '../../runtime/capability/memory';
import type { LLMProvider } from '../../runtime/provider/llm';
import {
  USER_MEMORY_DIR,
} from '../../runtime/infrastructure/config';

const log = getLogger(['agent-service', 'handlers', 'memory']);

/** 记忆系统配置参数 */
export interface MemoryConfigParams {
  enabled?: boolean;
  storagePath?: string;
  embedModel?: string;
  embedBaseUrl?: string;
  embedApiKey?: string;
  mode?: string;
  searchLimit?: number;
  autoSummarize?: boolean;
  summarizeThreshold?: number;
}

/**
 * 处理配置记忆系统
 */
export async function handleConfigureMemory(
  _params: unknown,
  requestId: string,
  config: MemoryConfigParams,
  components: {
    memoryManager: SimpleMemoryManager | null;
    embeddingService: EmbeddingService | null;
    llmProvider: LLMProvider | null;
  },
  updateOrchestrator: () => void
): Promise<void> {
  // 记忆系统未启用
  if (config.enabled === false) {
    components.memoryManager = null;

    process.send?.({
      jsonrpc: '2.0',
      id: requestId,
      result: {
        success: true,
        config: { enabled: false },
      },
    });
    log.info('记忆系统已禁用');
    return;
  }

  try {
    // 确定存储路径
    const storagePath = config.storagePath ?? USER_MEMORY_DIR;

    // 创建嵌入服务（如果提供了配置）
    let embeddingService: EmbeddingService | undefined;
    if (config.embedModel && config.embedBaseUrl) {
      const slashIndex = config.embedModel.indexOf('/');
      const modelId = slashIndex > 0 ? config.embedModel.slice(slashIndex + 1) : config.embedModel;

      embeddingService = createEmbeddingService(
        modelId,
        config.embedBaseUrl,
        config.embedApiKey || ''  // apiKey 可选，本地服务不需要
      );

      // 同时存储到实例变量供知识库等复用
      components.embeddingService = embeddingService;

      log.info('记忆系统嵌入服务已创建', {
        model: config.embedModel,
        available: embeddingService.isAvailable()
      });
    }

    // 创建底层存储和检索器
    const memoryStore = new MemoryStore({ storagePath, embeddingService });

    // 创建 FTS 全文检索器
    const ftsSearcher = new FTSSearcher({
      dbPath: `${storagePath}/fts.db`,
      tableName: 'memory_fts',
    });

    const memorySearcher = new MemorySearcher(memoryStore, ftsSearcher);

    // 创建适配器包装
    const storeAdapter: MemoryStoreAdapter = {
      initialize: () => memoryStore.initialize(),
      close: () => memoryStore.close(),
      store: (entry) => memoryStore.store(entry),
      get: (id) => memoryStore.get(id),
      delete: (id) => memoryStore.delete(id),
      touch: (id) => memoryStore.touch(id),
      getRecent: (sessionKey, limit) => memoryStore.getRecent(sessionKey, limit),
      clearSession: (sessionKey) => memoryStore.clearSession(sessionKey),
      getStats: () => memoryStore.getStats(),
    };

    const searcherAdapter: MemorySearcherAdapter = {
      search: (query, options) => memorySearcher.search(query, options),
    };

    // 创建简化版记忆管理器
    components.memoryManager = new SimpleMemoryManager({
      store: storeAdapter,
      searcher: searcherAdapter,
      config: {
        storagePath,
        enabled: true,
        autoSummarize: config.autoSummarize ?? true,
        summarizeThreshold: config.summarizeThreshold ?? 20,
        searchLimit: config.searchLimit ?? 10,
      },
      embeddingService,
    });

    // 初始化存储
    await memoryStore.initialize();

    // 获取统计信息
    const stats = await memoryStore.getStats();

    process.send?.({
      jsonrpc: '2.0',
      id: requestId,
      result: {
        success: true,
        config: {
          enabled: true,
          mode: config.mode ?? 'auto',
          embedModel: config.embedModel,
          storagePath,
        },
        stats: {
          totalEntries: stats.totalEntries,
          totalSessions: stats.totalSessions,
          hasEmbedding: embeddingService?.isAvailable() ?? false,
        },
      },
    });

    log.info('记忆系统初始化完成', {
      storagePath,
      totalEntries: stats.totalEntries,
      hasEmbedding: embeddingService?.isAvailable() ?? false,
    });

    updateOrchestrator();
  } catch (error) {
    log.error('记忆系统初始化失败', { error: (error as Error).message });

    process.send?.({
      jsonrpc: '2.0',
      id: requestId,
      error: {
        code: -32004,
        message: `记忆系统初始化失败: ${(error as Error).message}`
      },
    });
  }
}