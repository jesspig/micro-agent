/**
 * 遗忘模块入口
 *
 * 提供记忆清理相关功能：
 * - 遗忘引擎：基于艾宾浩斯遗忘曲线计算保持率
 * - 遗忘调度器：定期执行清理任务
 * - 保护管理器：保护重要记忆不被清理
 */

// 遗忘引擎 (T040)
export {
  ForgettingEngine,
  ForgettingEngineConfigSchema,
  createForgettingEngine,
  type ForgettingEngineConfig,
  type ForgettingCandidate,
  type ForgettingResult,
  type MemoryStoreAdapter,
  type ProtectionManagerAdapter,
} from './forgetting-engine';

// 遗忘调度器 (T041)
export {
  ForgettingScheduler,
  ForgettingSchedulerConfigSchema,
  createForgettingScheduler,
  type ForgettingSchedulerConfig,
  type SchedulerStatus,
  type ExecutionRecord,
  type SchedulerState,
} from './forgetting-scheduler';

// 保护管理器 (T042)
export {
  ProtectionManager,
  ProtectionManagerConfigSchema,
  createProtectionManager,
  isStatusProtected,
  type ProtectionReason,
  type ProtectionRecord,
  type ProtectionManagerConfig,
  type ProtectionEvent,
  type ProtectionEventHandler,
} from './protection-manager';
