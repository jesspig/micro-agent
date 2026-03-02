/**
 * 记忆系统初始化模块
 *
 * 负责初始化记忆系统的各个组件
 */

import type { OpenAIEmbedding, NoEmbedding, MemoryStore, ConversationSummarizer, KnowledgeBaseManager, LLMGateway, Config } from '@micro-agent/sdk';
import { OpenAIEmbedding as OpenAIEmbeddingImpl, NoEmbedding as NoEmbeddingImpl, MemoryStore as MemoryStoreImpl, ConversationSummarizer as ConversationSummarizerImpl, KnowledgeBaseManager as KnowledgeBaseManagerImpl } from '@micro-agent/sdk';
import { expandPath, parseModelConfigs, type ModelConfig } from '@micro-agent/config';
import { resolve } from 'path';
import { homedir } from 'os';
import { getLogger } from '@logtape/logtape';

const log = getLogger(['app', 'memory-init']);

/** 启动信息收集器（用于打印启动信息） */
export interface StartupInfoCollector {
  models: {
    chat?: string;
    vision?: string;
    embed?: string;
    coder?: string;
    intent?: string;
  };
  memory: {
    mode: string;
    embedModel?: string;
    autoSummarize?: boolean;
    summarizeThreshold?: number;
  };
  infoMessages: string[];
  warningMessages: string[];
}

/** 记忆系统初始化结果 */
export interface MemorySystemInitResult {
  memoryStore: MemoryStore | null;
  summarizer: ConversationSummarizer | null;
  knowledgeBaseManager: KnowledgeBaseManager | null;
}

/**
 * 初始化记忆系统
 */
export async function initMemorySystem(
  config: Config,
  llmGateway: LLMGateway,
  startupInfo: StartupInfoCollector
): Promise<MemorySystemInitResult> {
  const memoryConfig = config.agents.memory;

  if (memoryConfig?.enabled === false) {
    startupInfo.infoMessages.push('记忆系统已禁用');
    return {
      memoryStore: null,
      summarizer: null,
      knowledgeBaseManager: null
    };
  }

  try {
    return await initializeMemoryComponents(config, llmGateway, startupInfo);
  } catch (error) {
    handleMemoryInitError(error, startupInfo);
    return {
      memoryStore: null,
      summarizer: null,
      knowledgeBaseManager: null
    };
  }
}

/**
 * 初始化记忆系统组件
 */
async function initializeMemoryComponents(
  config: Config,
  llmGateway: LLMGateway,
  startupInfo: StartupInfoCollector
): Promise<MemorySystemInitResult> {
  collectModelInfo(config, startupInfo);
  const embeddingService = await initEmbeddingService(config, startupInfo);
  const memoryStore = await initMemoryStore(config, embeddingService);
  await checkAndStartMigration(memoryStore, startupInfo);
  const summarizer = await initSummarizer(config, llmGateway, memoryStore, startupInfo);
  const knowledgeBaseManager = await initKnowledgeBase(config, memoryStore, startupInfo);

  return {
    memoryStore,
    summarizer,
    knowledgeBaseManager
  };
}

/**
 * 处理记忆系统初始化错误
 */
function handleMemoryInitError(error: unknown, startupInfo: StartupInfoCollector): void {
  const errorMessage = error instanceof Error ? error.message : String(error);
  log.error('记忆系统初始化失败', { error: errorMessage });
  startupInfo.warningMessages.push('记忆系统初始化失败');
}

/**
 * 收集模型信息
 */
function collectModelInfo(config: Config, startupInfo: StartupInfoCollector): void {
  startupInfo.models.chat = config.agents.models?.chat;
  startupInfo.models.vision = config.agents.models?.vision;
  startupInfo.models.embed = config.agents.models?.embed;
  startupInfo.models.coder = config.agents.models?.coder;
  startupInfo.models.intent = config.agents.models?.intent;
}

/**
 * 初始化嵌入服务
 */
async function initEmbeddingService(
  config: Config,
  startupInfo: StartupInfoCollector
): Promise<OpenAIEmbedding | NoEmbedding> {
  const embedModel = config.agents.models?.embed;

  if (!embedModel) {
    startupInfo.memory.mode = 'fulltext';
    return new NoEmbeddingImpl();
  }

  const slashIndex = embedModel.indexOf('/');
  const providerName = slashIndex > 0 ? embedModel.slice(0, slashIndex) : Object.keys(config.providers)[0];
  const modelName = slashIndex > 0 ? embedModel.slice(slashIndex + 1) : embedModel;
  const providerConfig = config.providers[providerName || ''];

  if (providerConfig?.baseUrl) {
    startupInfo.memory.mode = 'vector';
    startupInfo.memory.embedModel = embedModel;
    return new OpenAIEmbeddingImpl(modelName, providerConfig.baseUrl, providerConfig.apiKey || '');
  }

  startupInfo.memory.mode = 'fulltext';
  startupInfo.warningMessages.push('嵌入模型配置缺少 baseUrl，使用全文检索');
  return new NoEmbeddingImpl();
}

/**
 * 初始化记忆存储
 */
async function initMemoryStore(
  config: Config,
  embeddingService: OpenAIEmbedding | NoEmbedding
): Promise<MemoryStore> {
  const memoryConfig = config.agents.memory;
  const embedModel = config.agents.models?.embed;
  const storagePath = memoryConfig?.storagePath
    ? expandPath(memoryConfig.storagePath)
    : resolve(homedir(), '.micro-agent/memory');

  const memoryStore = new MemoryStoreImpl({
    storagePath,
    embeddingService,
    embedModel,
    defaultSearchLimit: memoryConfig?.searchLimit ?? 10,
    shortTermRetentionDays: memoryConfig?.shortTermRetentionDays ?? 7,
  });

  await memoryStore.initialize();
  log.debug('记忆存储已初始化', { path: storagePath, embedModel });

  return memoryStore;
}

/**
 * 检查并启动模型迁移
 */
async function checkAndStartMigration(memoryStore: MemoryStore, startupInfo: StartupInfoCollector): Promise<void> {
  const modelChange = await memoryStore.detectModelChange();

  if (!modelChange.needMigration) return;

  if (modelChange.hasOldModelVectors) {
    await startMigration(memoryStore, modelChange, startupInfo);
  } else {
    log.info('嵌入模型已变更，无旧向量需要迁移', {
      oldModel: modelChange.oldModel,
      newModel: modelChange.newModel,
    });
  }
}

/**
 * 启动模型迁移
 */
async function startMigration(
  memoryStore: MemoryStore,
  modelChange: { oldModel?: string; newModel?: string },
  startupInfo: StartupInfoCollector
): Promise<void> {
  log.info('🔄 检测到嵌入模型变更，启动后台迁移', {
    oldModel: modelChange.oldModel,
    newModel: modelChange.newModel,
  });

  try {
    const result = await memoryStore.migrateToModel(modelChange.newModel!, { autoStart: true });
    if (result.success) {
      startupInfo.infoMessages.push(`嵌入模型迁移已启动：${modelChange.oldModel || '未知'} → ${modelChange.newModel}`);
    } else {
      startupInfo.warningMessages.push(`嵌入模型迁移启动失败：${result.error}`);
    }
  } catch (error) {
    log.error('嵌入模型迁移启动异常', { error: String(error) });
    startupInfo.warningMessages.push(`嵌入模型已从 ${modelChange.oldModel || '未知'} 变更为 ${modelChange.newModel}，迁移启动失败`);
  }
}

/**
 * 初始化摘要器
 */
async function initSummarizer(
  config: Config,
  llmGateway: LLMGateway,
  memoryStore: MemoryStore | null,
  startupInfo: StartupInfoCollector
): Promise<ConversationSummarizer | null> {
  const memoryConfig = config.agents.memory;

  if (memoryConfig?.autoSummarize === false || !memoryStore) return null;

  const threshold = memoryConfig?.summarizeThreshold ?? 20;
  const summarizer = new ConversationSummarizerImpl(
    llmGateway,
    memoryStore,
    {
      minMessages: threshold,
      maxLength: 2000,
      idleTimeout: memoryConfig?.idleTimeout ?? 300000,
    }
  );
  startupInfo.memory.autoSummarize = true;
  startupInfo.memory.summarizeThreshold = threshold;

  return summarizer;
}

/**
 * 初始化知识库
 */
async function initKnowledgeBase(
  config: Config,
  memoryStore: MemoryStore | null,
  startupInfo: StartupInfoCollector
): Promise<KnowledgeBaseManager | null> {
  if (!memoryStore) return null;

  const embedModel = config.agents.models?.embed;
  const knowledgePath = resolve(homedir(), '.micro-agent/knowledge');

  try {
    const knowledgeBaseManager = new KnowledgeBaseManagerImpl(
      {
        basePath: knowledgePath,
        embedModel: embedModel || undefined,
      },
      memoryStore
    );
    await knowledgeBaseManager.initialize();
    startupInfo.infoMessages.push('知识库系统已启用');
    log.info('📚 知识库系统已初始化', { path: knowledgePath });

    return knowledgeBaseManager;
  } catch (error) {
    log.warn('知识库初始化失败', { error: error instanceof Error ? error.message : String(error) });
    return null;
  }
}