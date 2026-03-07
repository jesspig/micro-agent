/**
 * 日志模块入口
 * 
 * 提供结构化日志、调用链追踪和事件订阅。
 */

// Types
export type {
  LogLevel,
  LoggingConfig,
  TraceContext,
  LogType,
  BaseLogEntry,
  ServiceLifecycleLog,
  SessionLifecycleLog,
  LLMCallLog,
  ToolCallLog,
  MemoryOpLog,
  KnowledgeOpLog,
  IPCMessageLog,
  ErrorLog,
  MetricLog,
  LogEntry,
  LogEventListener,
} from './types';

export { DEFAULT_LOGGING_CONFIG } from './types';

// Config
export {
  initLogging,
  closeLogging,
  isLoggingInitialized,
  getLogFilePath,
  createTraceContext,
  withTraceContext,
  createModuleLogger,
  subscribeToLogs,
} from './config';

// Re-export from logtape for convenience
export { getLogger, withContext } from '@logtape/logtape';

// Tracer
export { Tracer, getTracer, setTracer } from './tracer';