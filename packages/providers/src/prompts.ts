/**
 * 意图识别类型定义
 *
 * 支持分阶段意图识别：
 * 1. 预处理阶段：决定是否检索记忆
 * 2. 模型选择阶段：决定使用哪个模型
 */

// ============================================================================
// 阶段 1: 预处理
// ============================================================================

/** 记忆类型（字符串形式，避免循环依赖） */
export type MemoryTypeString =
  | 'preference'
  | 'fact'
  | 'decision'
  | 'entity'
  | 'conversation'
  | 'summary'
  | 'document'
  | 'other';

/** 预处理结果 */
export interface PreflightResult {
  /** 是否需要检索记忆 */
  needMemory: boolean;
  /** 需要检索的记忆类型（空数组表示不限制） */
  memoryTypes: MemoryTypeString[];
  /** 预处理理由 */
  reason: string;
}

/** 预处理提示词构建函数 */
export type PreflightPromptBuilder = (content: string, hasImage: boolean) => string;

// ============================================================================
// 阶段 2: 模型选择
// ============================================================================

/** 任务类型 */
export type TaskType = 'vision' | 'coder' | 'chat';

/** 模型信息（用于提示词） */
export interface ModelInfo {
  id: string;
}

/** 模型选择结果 */
export interface RoutingResult {
  type: TaskType;
  reason: string;
}

// ============================================================================
// 管道整合
// ============================================================================

/** 完整意图识别结果 */
export interface IntentResult {
  /** 预处理结果 */
  preflight: PreflightResult;
  /** 模型选择结果 */
  routing: RoutingResult;
}