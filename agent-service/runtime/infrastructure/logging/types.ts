/**
 * 日志系统类型定义
 * 
 * 定义结构化日志的所有类型，便于 CLI 端解析和处理。
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
  logFilePrefix: 'agent',
  level: 'info',
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
  /** 当前调用 ID */
  spanId: string;
  /** 父调用 ID */
  parentSpanId?: string;
}

// ============================================================
// 结构化日志类型定义
// ============================================================

/** 日志类型标识 */
export type LogType = 
  | 'service_lifecycle'   // 服务生命周期
  | 'session_lifecycle'   // 会话生命周期
  | 'llm_call'            // LLM 调用
  | 'tool_call'           // 工具调用
  | 'memory_op'           // 内存操作
  | 'knowledge_op'        // 知识库操作
  | 'ipc_message'         // IPC 消息
  | 'error'               // 错误
  | 'metric';             // 指标

/** 基础日志条目 */
export interface BaseLogEntry {
  /** 日志类型 */
  _type: LogType;
  /** 时间戳 */
  timestamp: string;
  /** 日志级别 */
  level: LogLevel;
  /** 日志分类 */
  category: string;
  /** 消息 */
  message: string;
  /** 调用链上下文 */
  trace?: TraceContext;
}

/** 服务生命周期日志 */
export interface ServiceLifecycleLog extends BaseLogEntry {
  _type: 'service_lifecycle';
  /** 事件类型 */
  event: 'start' | 'stop' | 'ready' | 'error';
  /** 服务信息 */
  service?: {
    version?: string;
    mode?: 'ipc' | 'standalone';
    pid?: number;
  };
  /** 错误信息 */
  error?: string;
}

/** 会话生命周期日志 */
export interface SessionLifecycleLog extends BaseLogEntry {
  _type: 'session_lifecycle';
  /** 事件类型 */
  event: 'create' | 'activate' | 'deactivate' | 'destroy';
  /** 会话 ID */
  sessionId: string;
  /** 用户信息 */
  user?: {
    id?: string;
    channel?: string;
  };
}

/** LLM 调用日志 */
export interface LLMCallLog extends BaseLogEntry {
  _type: 'llm_call';
  /** 模型名称 */
  model: string;
  /** Provider 名称 */
  provider: string;
  /** 消息数量 */
  messageCount: number;
  /** 工具数量 */
  toolCount: number;
  /** 执行耗时（毫秒） */
  duration: number;
  /** 是否���功 */
  success: boolean;
  /** Token 消耗 */
  tokens?: {
    prompt: number;
    completion: number;
    total: number;
  };
  /** 错误信息 */
  error?: string;
  /** 是否有工具调用 */
  hasToolCalls?: boolean;
  /** 响应内容预览 */
  contentPreview?: string;
}

/** 工具调用日志 */
export interface ToolCallLog extends BaseLogEntry {
  _type: 'tool_call';
  /** 工具名称 */
  tool: string;
  /** 输入参数 */
  input?: Record<string, unknown>;
  /** 输出结果预览 */
  outputPreview?: string;
  /** 执行耗时（毫秒） */
  duration: number;
  /** 是否成功 */
  success: boolean;
  /** 错误信息 */
  error?: string;
}

/** 内存操作日志 */
export interface MemoryOpLog extends BaseLogEntry {
  _type: 'memory_op';
  /** 操作类型 */
  operation: 'store' | 'retrieve' | 'search' | 'delete' | 'clear';
  /** 内存类型 */
  memoryType?: 'short_term' | 'long_term' | 'episodic';
  /** 查询内容 */
  query?: string;
  /** 结果数量 */
  resultCount?: number;
  /** 执行耗时（毫秒） */
  duration?: number;
}

/** 知识库操作日志 */
export interface KnowledgeOpLog extends BaseLogEntry {
  _type: 'knowledge_op';
  /** 操作类型 */
  operation: 'index' | 'search' | 'delete' | 'update';
  /** 知识库 ID */
  knowledgeBaseId?: string;
  /** 文档 ID */
  documentId?: string;
  /** 查询内容 */
  query?: string;
  /** 结果数量 */
  resultCount?: number;
  /** 执行耗时（毫秒） */
  duration?: number;
}

/** IPC 消息日志 */
export interface IPCMessageLog extends BaseLogEntry {
  _type: 'ipc_message';
  /** 方向 */
  direction: 'in' | 'out';
  /** 方法名 */
  method: string;
  /** 请求 ID */
  requestId?: string;
  /** 会话 ID */
  sessionId?: string;
  /** 消息大小（字节） */
  size?: number;
}

/** 错误日志 */
export interface ErrorLog extends BaseLogEntry {
  _type: 'error';
  /** 错误类型 */
  errorType: string;
  /** 错误消息 */
  errorMessage: string;
  /** 错误堆栈 */
  stack?: string;
  /** 上下文数据 */
  context?: Record<string, unknown>;
}

/** 指标日志 */
export interface MetricLog extends BaseLogEntry {
  _type: 'metric';
  /** 指标名称 */
  metric: string;
  /** 指标值 */
  value: number;
  /** 单位 */
  unit?: string;
  /** 标签 */
  tags?: Record<string, string>;
}

/** 统一日志条目类型 */
export type LogEntry = 
  | ServiceLifecycleLog
  | SessionLifecycleLog
  | LLMCallLog
  | ToolCallLog
  | MemoryOpLog
  | KnowledgeOpLog
  | IPCMessageLog
  | ErrorLog
  | MetricLog;

/** 日志事件监听器 */
export type LogEventListener = (entry: LogEntry) => void;