/**
 * 日志模块入口
 * 
 * 提供结构化日志、调用链追踪和方法入参/输出记录。
 */

// Types
export type {
  LogLevel,
  LoggingConfig,
  TraceContext,
  LogType,
  BaseLogEntry,
  MethodCallLog,
  LLMCallLog,
  ToolCallLog,
  EventLog,
  LogEntry,
  TracerOptions,
  LogEventListener,
} from './types';

export { DEFAULT_LOGGING_CONFIG } from './types';

// Config
export {
  initLogging,
  closeLogging,
  isLoggingInitialized,
  getLogFilePath,
  createModuleLogger,
  subscribeToLogs,
} from './config';

// Tracer
export {
  Tracer,
  getTracer,
  setTracer,
  traceMethod,
  traced,
} from './tracer';