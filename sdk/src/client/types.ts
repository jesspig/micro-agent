/**
 * SDK 公共类型定义
 */

/** 传输类型 */
export type TransportType = 'ipc' | 'http' | 'websocket';

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

/** 会话键类型 */
export type SessionKey = `${string}:${string}`;

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
  /** 分块大小 */
  chunkSize?: number;
  /** 分块重叠 */
  chunkOverlap?: number;
  /** 检索数量限制 */
  searchLimit?: number;
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

/** LLM 消息 */
export interface LLMMessage {
  /** 角色 */
  role: 'system' | 'user' | 'assistant' | 'tool';
  /** 内容 */
  content: string;
  /** 时间戳 */
  timestamp?: Date;
  /** 工具调用 */
  toolCalls?: ToolCall[];
}

/** 工具调用 */
export interface ToolCall {
  /** 调用 ID */
  id: string;
  /** 工具名称 */
  name: string;
  /** 参数 */
  arguments: Record<string, unknown>;
  /** 结果 */
  result?: unknown;
}
