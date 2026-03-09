/**
 * 默认配置定义
 *
 * 集中管理所有默认配置值，路径常量从 agent-service 重导出
 */

// ============================================================
// 路径常量（从 agent-service 重导出）
// ============================================================
export {
  USER_CONFIG_DIR_NAME,
  USER_CONFIG_DIR,
  USER_DATA_DIR,
  USER_LOGS_DIR,
  USER_KNOWLEDGE_DIR,
  USER_MEMORY_DIR,
  USER_WORKSPACE_DIR,
  USER_SESSIONS_DIR,
  USER_SKILLS_DIR,
  USER_EXTENSIONS_DIR,
  KNOWLEDGE_VECTORS_PATH,
  KNOWLEDGE_FTS_DB_PATH,
  SESSIONS_DB_PATH,
  MEMORY_DB_PATH,
  TODO_STORAGE_PATH,
  MEMORY_LOGS_DIR,
} from '@micro-agent/runtime/infrastructure/config/paths';

import { USER_MEMORY_DIR, USER_WORKSPACE_DIR } from '@micro-agent/runtime/infrastructure/config/paths';

// ============================================================
// 默认配置值
// ============================================================

/** 默认生成配置 */
export const DEFAULT_GENERATION_CONFIG = {
  maxTokens: 512,
  temperature: 0.7,
  topK: 50,
  topP: 0.7,
  frequencyPenalty: 0.5,
} as const;

/** 默认执行器配置 */
export const DEFAULT_EXECUTOR_CONFIG = {
  maxIterations: 20,
} as const;

/** 默认记忆配置 */
export const DEFAULT_MEMORY_CONFIG = {
  enabled: true,
  autoSummarize: true,
  summarizeThreshold: 20,
  idleTimeout: 300000,
  shortTermRetentionDays: 7,
  searchLimit: 10,
} as const;

/** 默认多嵌入模型配置 */
export const DEFAULT_MULTI_EMBED_CONFIG = {
  enabled: true,
  maxModels: 3,
  autoMigrate: true,
  batchSize: 50,
  migrateInterval: 0,
} as const;

/** 默认上下文预算配置 */
export const DEFAULT_CONTEXT_BUDGET = {
  historyTokenBudget: 4000,
  summaryTokenBudget: 500,
} as const;

// ============================================================
// 配置对象
// ============================================================

/**
 * 获取内置默认配置
 */
export function getBuiltinDefaults(): Record<string, unknown> {
  return {
    agents: {
      workspace: USER_WORKSPACE_DIR,
      ...DEFAULT_GENERATION_CONFIG,
      executor: { ...DEFAULT_EXECUTOR_CONFIG },
      memory: {
        ...DEFAULT_MEMORY_CONFIG,
        storagePath: USER_MEMORY_DIR,
        multiEmbed: { ...DEFAULT_MULTI_EMBED_CONFIG },
      },
    },
    providers: {},
    channels: {},
  };
}
