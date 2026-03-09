/**
 * SDK 公共类型定义
 *
 * 设计原则：
 * 1. 类型定义单一来源 - 核心类型从 agent-service 重导出
 * 2. SDK 特有类型 - 仅在此定义传输层、配置等 SDK 专属类型
 */

// ============================================================
// 从 agent-service 重导出的核心类型
// 避免重复定义，保持类型一致性
// ============================================================

// 会话类型
export type { SessionKey } from '../runtime';

// 消息类型
export type { LLMMessage, MessageRole, MessageContent } from '../runtime';

// 工具类型
export type { ToolCall } from '../runtime';

// 记忆类型
export type {
  MemoryEntry,
  MemoryType,
  MemoryStatus,
  MemoryMetadata,
  MemorySearchResult,
  MemorySearchOptions,
  MemoryFilter,
  MemoryStats,
} from '../runtime';

// 执行上下文类型
export type {
  ExecutionContext,
  ExecutionContextConfig,
  ExecutionContextState,
  ExecutionContextSnapshot,
} from '../runtime';

// ============================================================
// SDK 特有类型 - 传输层、配置等
// ============================================================

/** 传输类型 */
export type TransportType = 'ipc' | 'http' | 'websocket';

/** 日志输出类型 */
export type LogOutputType = 'stdout' | 'stderr';

/** 日志处理器 */
export type LogHandler = (text: string, type: LogOutputType) => void;

/** IPC 配置 */
export interface IPCConfig {
  /** Agent Service 路径（Bun IPC 模式） */
  servicePath?: string;
  /** TCP 端口（TCP Loopback 模式，Windows） */
  port?: number;
  /** Socket 路径（Unix Socket 模式，Linux/macOS） */
  path?: string;
  /** 超时时间（毫秒） */
  timeout?: number;
  /** 序列化方式（Bun IPC） */
  serialization?: 'advanced' | 'json';
  /** 日志处理器（用于处理子进程输出） */
  logHandler?: LogHandler;
}

/** HTTP 配置 */
export interface HTTPConfig {
  /** 服务地址 */
  baseUrl: string;
  /** 超时时间（毫秒） */
  timeout?: number;
  /** 请求头 */
  headers?: Record<string, string>;
}

/** WebSocket 配置 */
export interface WebSocketConfig {
  /** WebSocket URL */
  url: string;
  /** 重连间隔（毫秒） */
  reconnectInterval?: number;
  /** 最大重连次数 */
  maxReconnectAttempts?: number;
}

/** SDK 客户端配置 */
export interface SDKClientConfig {
  /** 传输类型 */
  transport: TransportType;
  /** IPC 配置 */
  ipc?: IPCConfig;
  /** HTTP 配置 */
  http?: HTTPConfig;
  /** WebSocket 配置 */
  websocket?: WebSocketConfig;
}

/** 流式响应块 */
export interface StreamChunk {
  /** 消息类型 */
  type: 'text' | 'tool_call' | 'thinking' | 'error' | 'done';
  /** 内容 */
  content: string;
  /** 时间戳 */
  timestamp: Date;
  /** 元数据 */
  metadata?: Record<string, unknown>;
}

/** 流式处理器 */
export type StreamHandler = (chunk: StreamChunk) => void;

/** 工具配置 */
export interface ToolConfig {
  /** 工具名称 */
  name: string;
  /** 工具描述 */
  description?: string;
  /** 是否启用 */
  enabled?: boolean;
  /** 工具参数 schema */
  inputSchema?: Record<string, unknown>;
  /** 工具元数据 */
  metadata?: Record<string, unknown>;
}

/** 技能配置 */
export interface SkillConfig {
  /** 技能名称 */
  name: string;
  /** 技能描述 */
  description?: string;
  /** 是否启用 */
  enabled?: boolean;
  /** 技能路径 */
  path?: string;
  /** 是否自动加载 */
  always?: boolean;
  /** 预批准工具列表 */
  allowedTools?: string[];
  /** 技能元数据 */
  metadata?: Record<string, unknown>;
}

/** 记忆系统配置 */
export interface MemoryConfig {
  /** 是否启用 */
  enabled?: boolean;
  /** 存储路径 */
  storagePath?: string;
  /** 嵌入模型 */
  embedModel?: string;
  /** 嵌入服务 Base URL */
  embedBaseUrl?: string;
  /** 嵌入服务 API Key */
  embedApiKey?: string;
  /** 检索模式 */
  mode?: 'fulltext' | 'vector' | 'hybrid' | 'auto';
  /** 检索数量限制 */
  searchLimit?: number;
  /** 自动摘要 */
  autoSummarize?: boolean;
  /** 摘要阈值 */
  summarizeThreshold?: number;
}

/** 知识库配置 */
export interface KnowledgeConfig {
  /** 是否启用 */
  enabled?: boolean;
  /** 知识库路径 */
  basePath?: string;
  /** 嵌入模型 */
  embedModel?: string;
  /** 嵌入服务 Base URL */
  embedBaseUrl?: string;
  /** 嵌入服务 API Key */
  embedApiKey?: string;
  /** 分块大小 */
  chunkSize?: number;
  /** 分块重叠 */
  chunkOverlap?: number;
  /** 检索数量限制 */
  searchLimit?: number;
  /** 最大搜索结果数 */
  maxSearchResults?: number;
  /** 最小相似度阈值 */
  minSimilarityScore?: number;
}

/** 运行时配置 */
export interface RuntimeConfig {
  /** 工作目录 */
  workspace?: string;
  /** 模型配置 */
  models?: {
    chat?: string;
    tool?: string;
    embed?: string;
    vision?: string;
    coder?: string;
    intent?: string;
  };
  /** 最大 Token 数 */
  maxTokens?: number;
  /** 温度 */
  temperature?: number;
  /** 最大迭代次数 */
  maxIterations?: number;
  /** 系统提示词 */
  systemPrompt?: string;
  /** 工具列表 */
  tools?: ToolConfig[];
  /** 技能列表 */
  skills?: SkillConfig[];
  /** 记忆系统配置 */
  memory?: MemoryConfig;
  /** 知识库配置 */
  knowledge?: KnowledgeConfig;
}

/** 提示词模板 */
export interface PromptTemplate {
  /** 模板 ID */
  id: string;
  /** 模板名称 */
  name: string;
  /** 模板内容 */
  content: string;
  /** 变量定义 */
  variables?: Record<string, {
    description?: string;
    default?: unknown;
    required?: boolean;
  }>;
}

/** 任务状态 */
export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

/** SDK 请求 */
export interface SDKRequest {
  /** 请求 ID */
  id: string;
  /** 方法名 */
  method: string;
  /** 参数 */
  params?: unknown;
  /** 时间戳 */
  timestamp?: Date;
}

/** SDK 响应 */
export interface SDKResponse {
  /** 请求 ID */
  id: string;
  /** 是否成功 */
  success: boolean;
  /** 结果 */
  result?: unknown;
  /** 错误信息 */
  error?: {
    code: string;
    message: string;
    data?: unknown;
  };
  /** 时间戳 */
  timestamp?: Date;
}