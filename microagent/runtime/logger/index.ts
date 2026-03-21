/**
 * Runtime Logger 模块
 *
 * 提供日志接口定义、辅助函数和脱敏工具。
 * Runtime 层使用这些模块，Applications 层提供完整的日志实现。
 */

export type { LogLevel } from "./logger.js";
export type { Logger, LogSink } from "./logger.js";
export { createDefaultLogger, setRuntimeLogSink, getRuntimeLogSink } from "./logger.js";
export type { MethodCallLogData, MethodReturnLogData, MethodErrorLogData } from "./types.js";
export { createTimer } from "./types.js";
export type { ILogger, ILoggerFactory, ILogHelper, ISanitize, ITruncateText } from "./contracts.js";
export { logMethodCall, logMethodReturn, logMethodError } from "./log-helpers.js";
export { sanitize, sanitizeObject, sanitizeString, maskToken, truncateText } from "./sanitizer.js";

export {
  MICRO_AGENT_DIR,
  LOGS_DIR,
  DEFAULT_LOG_LEVEL,
  DEFAULT_LOG_MAX_FILE_SIZE_MB,
  MIN_LOG_FILE_SIZE_MB,
  MAX_LOG_FILE_SIZE_MB,
  DEFAULT_LOG_GRANULARITY,
  LOG_RETENTION_DAYS,
  DEFAULT_LOG_SANITIZE,
} from "./constants.js";
