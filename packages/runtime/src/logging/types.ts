/**
 * 日志系统类型定义
 */

/** 日志级别 */
export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

/** 日志配置 */
export interface LoggingConfig {
  /** 是否启用控制台输出 */
  console: boolean;
  /** 是否启用文件输出 */
  file: boolean;
  /** 日志文件目录 */
  logDir: string;
  /** 日志文件名前缀 */
  logFilePrefix: string;
  /** 最低日志级别（文件日志） */
  level: LogLevel;
  /** 控制台最低日志级别（默认 warn，只显示警告和错误） */
  consoleLevel?: LogLevel;
  /** 是否启用调用链追踪 */
  traceEnabled: boolean;
  /** 是否记录方法入参 */
  logInput: boolean;
  /** 是否记录方法输出 */
  logOutput: boolean;
  /** 是否记录执行耗时 */
  logDuration: boolean;
  /** 敏感字段列表（自动脱敏） */
  sensitiveFields: string[];
  /** 最大日志文件大小（字节） */
  maxFileSize: number;
  /** 最大日志文件数量 */
  maxFiles: number;
}

/** 默认日志配置 */
export const DEFAULT_LOGGING_CONFIG: LoggingConfig = {
  console: true,
  file: true,
  logDir: '~/.micro-agent/logs',
  logFilePrefix: 'app',
  level: 'info',
  consoleLevel: 'warn', // 控制台只显示警告和错误
  traceEnabled: true,
  logInput: true,
  logOutput: true,
  logDuration: true,
  sensitiveFields: ['password', 'token', 'secret', 'apiKey', 'api_key', 'authorization'],
  maxFileSize: 10 * 1024 * 1024, // 10MB
  maxFiles: 30,
};

/** 调用链上下文 */
export interface TraceContext {
  /** 调用链 ID */
  traceId: string;
  /** 父调用 ID */
  parentSpanId?: string;
  /** 当前调用 ID */
  spanId: string;
  /** 文件名 */
  file?: string;
  /** 方法名 */
  method?: string;
  /** 类名（可选） */
  className?: string;
  /** 调用层级 */
  depth?: number;
  /** 开始时间 */
  startTime?: number;
}

/** 日志类型标识 */
export type LogType = 
  | 'method_call'
  | 'llm_call'
  | 'tool_call'
  | 'event'
  | 'service_lifecycle'
  | 'session_lifecycle'
  | 'memory_op'
  | 'knowledge_op'
  | 'ipc_message'
  | 'error'
  | 'metric';

/** 基础日志条目 */
export interface BaseLogEntry {
  /** 日志类型 */
  _type?: LogType;
  /** 时间戳 */
  timestamp: string;
  /** 日志级别 */
  level?: LogLevel;
  /** 日志分类 */
  category?: string;
  /** 消息 */
  message?: string | string[];
  /** 调用链上下文 */
  trace?: TraceContext;
  /** 属性 */
  properties?: Record<string, unknown>;
}

/** 方法调用日志 */
export interface MethodCallLog extends BaseLogEntry {
  _type: 'method_call';
  trace: TraceContext;
  input?: Record<string, unknown>;
  output?: unknown;
  duration?: number;
  success: boolean;
  error?: string;
  stack?: string;
}

/** LLM 调用日志 */
export interface LLMCallLog extends BaseLogEntry {
  _type: 'llm_call';
  trace: TraceContext;
  model: string;
  provider: string;
  messageCount: number;
  toolCount: number;
  promptTokens?: number;
  completionTokens?: number;
  duration: number;
  success: boolean;
  error?: string;
  content?: string;
  hasToolCalls?: boolean;
}

/** 工具调用日志 */
export interface ToolCallLog extends BaseLogEntry {
  _type: 'tool_call';
  trace: TraceContext;
  tool: string;
  input?: unknown;
  output?: string;
  duration: number;
  success: boolean;
  error?: string;
}

/** 事件日志 */
export interface EventLog extends BaseLogEntry {
  _type: 'event';
  trace?: TraceContext;
  event: string;
  payload: unknown;
}

/** 统一日志条目类型 */
export type LogEntry = 
  | BaseLogEntry 
  | MethodCallLog 
  | LLMCallLog 
  | ToolCallLog 
  | EventLog;

/** 追踪器选项 */
export interface TracerOptions {
  /** 是否启用追踪 */
  enabled: boolean;
  /** 敏感字段列表 */
  sensitiveFields: string[];
  /** 最大深度 */
  maxDepth: number;
}

/** 日志事件监听器 */
export type LogEventListener = (entry: Record<string, unknown>) => void;