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
  /** 最低日志级别 */
  level: LogLevel;
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
  traceEnabled: true,
  logInput: true,
  logOutput: true,
  logDuration: true,
  sensitiveFields: ['password', 'token', 'secret', 'apiKey', 'api_key', 'authorization'],
  maxFileSize: 10 * 1024 * 1024, // 10MB
  maxFiles: 5,
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
  file: string;
  /** 方法名 */
  method: string;
  /** 类名（可选） */
  className?: string;
  /** 调用层级 */
  depth: number;
  /** 开始时间 */
  startTime: number;
}

/** 方法调用日志 */
export interface MethodCallLog {
  /** 日志类型 */
  _type: 'method_call';
  /** 调用链上下文 */
  trace: TraceContext;
  /** 时间戳 */
  timestamp: string;
  /** 输入参数 */
  input?: Record<string, unknown>;
  /** 输出结果 */
  output?: unknown;
  /** 执行耗时（毫秒） */
  duration?: number;
  /** 是否成功 */
  success: boolean;
  /** 错误信息 */
  error?: string;
  /** 错误堆栈 */
  stack?: string;
}

/** LLM 调用日志 */
export interface LLMCallLog {
  /** 日志类型 */
  _type: 'llm_call';
  /** 调用链上下文 */
  trace: TraceContext;
  /** 时间戳 */
  timestamp: string;
  /** 模型名称 */
  model: string;
  /** Provider 名称 */
  provider: string;
  /** 输入消息数量 */
  messageCount: number;
  /** 工具数量 */
  toolCount: number;
  /** 输出 Token 数 */
  promptTokens?: number;
  /** 输入 Token 数 */
  completionTokens?: number;
  /** 执行耗时（毫秒） */
  duration: number;
  /** 是否成功 */
  success: boolean;
  /** 错误信息 */
  error?: string;
  /** 响应内容 */
  content?: string;
  /** 是否有工具调用 */
  hasToolCalls?: boolean;
}

/** 工具调用日志 */
export interface ToolCallLog {
  /** 日志类型 */
  _type: 'tool_call';
  /** 调用链上下文 */
  trace: TraceContext;
  /** 时间戳 */
  timestamp: string;
  /** 工具名称 */
  tool: string;
  /** 输入参数 */
  input?: unknown;
  /** 输出结果 */
  output?: string;
  /** 执行耗时（毫秒） */
  duration: number;
  /** 是否成功 */
  success: boolean;
  /** 错误信息 */
  error?: string;
}

/** 事件日志 */
export interface EventLog {
  /** 日志类型 */
  _type: 'event';
  /** 调用链上下文 */
  trace?: TraceContext;
  /** 时间戳 */
  timestamp: string;
  /** 事件名称 */
  event: string;
  /** 事件数据 */
  payload: unknown;
}

/** 统一日志条目类型 */
export type LogEntry = MethodCallLog | LLMCallLog | ToolCallLog | EventLog;

/** 追踪器选项 */
export interface TracerOptions {
  /** 是否启用追踪 */
  enabled: boolean;
  /** 敏感字段列表 */
  sensitiveFields: string[];
  /** 最大深度 */
  maxDepth: number;
}
