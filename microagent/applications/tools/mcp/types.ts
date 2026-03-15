/**
 * MCP 类型定义
 *
 * 定义 MCP 服务器配置和工具相关类型
 */

// ============================================================================
// MCP 服务器配置
// ============================================================================

/**
 * MCP 传输类型
 */
export type MCPTransportType = "stdio" | "sse" | "streamableHttp";

/**
 * 单个 MCP 服务器配置
 */
export interface MCPServerConfig {
  /** 是否禁用 */
  disabled?: boolean;
  /** 传输类型（自动检测：有 command 为 stdio，有 url 为 sse/streamableHttp） */
  type?: MCPTransportType;
  /** stdio 模式：启动命令 */
  command?: string;
  /** stdio 模式：命令行参数 */
  args?: string[];
  /** stdio 模式：环境变量 */
  env?: Record<string, string>;
  /** sse/streamableHttp 模式：服务器 URL */
  url?: string;
  /** sse/streamableHttp 模式：HTTP 请求头 */
  headers?: Record<string, string>;
  /** 工具调用超时时间（毫秒），默认 30000 */
  toolTimeout?: number;
  /** 服务器描述 */
  description?: string;
}

/**
 * MCP 全局配置
 */
export interface MCPGlobalSettings {
  /** 默认超时时间（毫秒） */
  timeout?: number;
  /** 重试次数 */
  retryCount?: number;
  /** 日志级别 */
  logLevel?: "debug" | "info" | "warn" | "error";
}

/**
 * MCP 配置文件结构
 */
export interface MCPConfig {
  /** MCP 服务器配置 */
  mcpServers: Record<string, MCPServerConfig>;
  /** 全局设置 */
  globalSettings?: MCPGlobalSettings;
}

// ============================================================================
// MCP 工具定义
// ============================================================================

/**
 * MCP 工具参数 Schema
 */
export interface MCPToolInputSchema {
  type: "object";
  properties?: Record<string, unknown>;
  required?: string[];
  [key: string]: unknown;
}

/**
 * MCP 工具定义（从 MCP 服务器获取）
 */
export interface MCPToolDefinition {
  /** 工具名称 */
  name: string;
  /** 工具描述 */
  description?: string;
  /** 输入参数 Schema */
  inputSchema: MCPToolInputSchema;
}

/**
 * MCP 工具执行结果
 */
export interface MCPToolResult {
  /** 内容块列表 */
  content: Array<{ type: string; text?: string }>;
  /** 是否错误 */
  isError?: boolean;
}

// ============================================================================
// MCP 客户端状态
// ============================================================================

/**
 * MCP 服务器连接状态
 */
export type MCPServerStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";

/**
 * MCP 服务器信息
 */
export interface MCPServerInfo {
  /** 服务器名称 */
  name: string;
  /** 连接状态 */
  status: MCPServerStatus;
  /** 已注册工具数量 */
  toolCount: number;
  /** 错误信息 */
  error?: string;
  /** 连接时间 */
  connectedAt?: number;
}
