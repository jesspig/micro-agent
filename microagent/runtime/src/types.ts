/**
 * 核心类型定义
 * 
 * 定义 MicroAgent 运行时所需的基础类型
 */

// ============================================================================
// 通用类型
// ============================================================================

/**
 * JSON Schema 类型
 * 用于定义工具参数和数据结构
 */
export type JSONSchema = Record<string, unknown>;

/**
 * Provider 规格信息
 */
export interface ProviderSpec {
  /** Provider 名称 */
  name: string;
  /** API 基础 URL */
  baseUrl?: string;
  /** 支持的模型列表 */
  models?: string[];
  /** 默认模型 */
  defaultModel?: string;
  /** 模型关键词（用于模型匹配） */
  keywords?: string[];
  /** 环境变量键名 */
  envKey?: string;
  /** 是否支持提示词缓存 */
  supportsPromptCaching?: boolean;
  /** 是否为网关服务 */
  isGateway?: boolean;
}

// ============================================================================
// Provider 相关类型
// ============================================================================

/**
 * 聊天请求
 */
export interface ChatRequest {
  /** 模型标识符 */
  model: string;
  /** 消息列表 */
  messages: Message[];
  /** 可用工具定义 */
  tools?: ToolDefinition[];
  /** 温度参数（0-1） */
  temperature?: number;
  /** 最大输出 token 数 */
  maxTokens?: number;
}

/**
 * 聊天响应
 */
export interface ChatResponse {
  /** 响应文本 */
  text: string;
  /** 是否有工具调用 */
  hasToolCall: boolean;
  /** 工具调用列表 */
  toolCalls?: ToolCall[];
  /** 使用统计 */
  usage?: UsageStats;
  /** 原始响应数据 */
  raw?: unknown;
}

/**
 * 工具调用
 */
export interface ToolCall {
  /** 工具调用 ID */
  id: string;
  /** 工具名称 */
  name: string;
  /** 调用参数 */
  arguments: Record<string, unknown>;
}

/**
 * 使用统计
 */
export interface UsageStats {
  /** 输入 token 数 */
  inputTokens: number;
  /** 输出 token 数 */
  outputTokens: number;
}

// ============================================================================
// Tool 相关类型
// ============================================================================

/**
 * 工具定义
 */
export interface ToolDefinition {
  /** 工具名称 */
  name: string;
  /** 工具描述 */
  description: string;
  /** 参数 schema（JSON Schema 格式） */
  parameters: ToolParameterSchema;
}

/**
 * 工具参数 schema
 */
export interface ToolParameterSchema {
  /** 参数类型 */
  type: "object";
  /** 属性定义 */
  properties: Record<string, ToolPropertySchema>;
  /** 必需属性列表 */
  required?: string[];
}

/**
 * 工具属性 schema
 */
export interface ToolPropertySchema {
  /** 属性类型 */
  type: string;
  /** 属性描述 */
  description?: string;
  /** 枚举值 */
  enum?: string[];
  /** 默认值 */
  default?: unknown;
}

// ============================================================================
// Skill 相关类型
// ============================================================================

/**
 * Skill 元数据
 */
export interface SkillMeta {
  /** Skill 名称 */
  name: string;
  /** Skill 描述 */
  description: string;
  /** Skill 版本 */
  version: string;
  /** 依赖列表 */
  dependencies?: string[];
  /** 标签列表 */
  tags?: string[];
}

// ============================================================================
// Channel 相关类型
// ============================================================================

/**
 * Channel 能力标识
 */
export interface ChannelCapabilities {
  /** 支持文本消息 */
  text: boolean;
  /** 支持媒体消息 */
  media: boolean;
  /** 支持回复引用 */
  reply: boolean;
  /** 支持消息编辑 */
  edit: boolean;
  /** 支持消息删除 */
  delete: boolean;
}

/**
 * Channel 配置
 */
export interface ChannelConfig {
  /** 认证 token */
  token: string;
  /** Webhook URL */
  webhookUrl?: string;
  /** 其他配置项 */
  [key: string]: unknown;
}

/**
 * 出站消息
 */
export interface OutboundMessage {
  /** 目标标识 */
  to: string;
  /** 消息文本 */
  text: string;
  /** 媒体 URL */
  mediaUrl?: string;
  /** 回复的消息 ID */
  replyTo?: string;
}

/**
 * 发送结果
 */
export interface SendResult {
  /** 是否成功 */
  success: boolean;
  /** 消息 ID */
  messageId?: string;
  /** 错误信息 */
  error?: string;
}

/**
 * 入站消息
 */
export interface InboundMessage {
  /** 来源标识 */
  from: string;
  /** 消息文本 */
  text: string;
  /** 媒体 URL 列表 */
  mediaUrls?: string[];
  /** 时间戳 */
  timestamp: number;
  /** 回复的消息 ID */
  replyTo?: string;
}

/**
 * 消息处理器
 */
export type MessageHandler = (message: InboundMessage) => void | Promise<void>;

// ============================================================================
// Memory 相关类型
// ============================================================================

/**
 * 消息
 */
export interface Message {
  /** 消息角色 */
  role: MessageRole;
  /** 消息内容 */
  content: string;
  /** 工具调用列表（仅 assistant 消息） */
  toolCalls?: ToolCall[];
  /** 工具调用 ID（仅 tool 消息） */
  toolCallId?: string;
  /** 工具名称（仅 tool 消息） */
  name?: string;
  /** 时间戳 */
  timestamp?: number;
}

/**
 * 消息角色
 */
export type MessageRole = "system" | "user" | "assistant" | "tool";

// ============================================================================
// Session 相关类型
// ============================================================================

/**
 * Session 元数据
 */
export interface SessionMetadata {
  /** Session 标识 */
  id: string;
  /** 创建时间 */
  createdAt: number;
  /** 最后更新时间 */
  updatedAt: number;
  /** 关联的 channel 标识 */
  channelId?: string;
  /** 关联的用户标识 */
  userId?: string;
  /** 自定义属性 */
  [key: string]: unknown;
}