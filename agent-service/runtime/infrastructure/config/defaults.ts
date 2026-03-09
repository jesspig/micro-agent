/**
 * 默认配置定义
 *
 * Agent Service 内部使用的默认配置值
 */

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

/** 默认上下文预算配置 */
export const DEFAULT_CONTEXT_BUDGET = {
  historyTokenBudget: 4000,
  summaryTokenBudget: 500,
} as const;
