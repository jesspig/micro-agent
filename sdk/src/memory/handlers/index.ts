/**
 * 处理器模块入口
 *
 * 提供记忆处理的高级封装功能。
 */

export {
  PreferenceHandler,
  createPreferenceHandler,
  PreferenceHandlerConfigSchema,
  type PreferenceStoreAdapter,
  type PreferenceRecord,
  type PreferenceHandlerConfig,
  type HandleResult,
  type BatchHandleResult,
} from './preference-handler';
