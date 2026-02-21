/**
 * MCP (Model Context Protocol) 类型定义
 *
 * MCP 是 Anthropic 定义的用于连接 LLM 与外部工具/资源的协议。
 * @see https://modelcontextprotocol.io
 */

/** MCP 协议版本 */
export const MCP_VERSION = '2024-11-05'

/** MCP 实现信息 */
export interface MCPImplementation {
  name: string
  version: string
}

/** MCP 能力（客户端） */
export interface MCPClientCapabilities {
  experimental?: Record<string, unknown>
  roots?: {
    listChanged?: boolean
  }
  sampling?: object
}

/** MCP 能力（服务端） */
export interface MCPServerCapabilities {
  experimental?: Record<string, unknown>
  logging?: object
  prompts?: {
    listChanged?: boolean
  }
  resources?: {
    subscribe?: boolean
    listChanged?: boolean
  }
  tools?: {
    listChanged?: boolean
  }
}

/** MCP 初始化请求 */
export interface MCPInitializeRequest {
  protocolVersion: string
  capabilities: MCPClientCapabilities
  clientInfo: MCPImplementation
}

/** MCP 初始化响应 */
export interface MCPInitializeResult {
  protocolVersion: string
  capabilities: MCPServerCapabilities
  serverInfo: MCPImplementation
  instructions?: string
}

/** MCP 工具定义 */
export interface MCPToolDefinition {
  name: string
  description?: string
  inputSchema: {
    type: 'object'
    properties?: Record<string, unknown>
    required?: string[]
  }
}

/** MCP 工具调用 */
export interface MCPToolCall {
  name: string
  arguments: Record<string, unknown>
}

/** MCP 工具结果内容 */
export type MCPToolResultContent =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string }
  | { type: 'resource'; resource: MCPResourceContents }

/** MCP 工具结果 */
export interface MCPToolResult {
  content: MCPToolResultContent[]
  isError?: boolean
}

/** MCP 资源 */
export interface MCPResource {
  uri: string
  name: string
  description?: string
  mimeType?: string
}

/** MCP 资源内容 */
export type MCPResourceContents = {
  uri: string
  mimeType?: string
} & (
    | { text: string }
    | { blob: string }
  )

/** MCP 资源模板 */
export interface MCPResourceTemplate {
  uriTemplate: string
  name: string
  description?: string
  mimeType?: string
}

/** MCP 提示词 */
export interface MCPPrompt {
  name: string
  description?: string
  arguments?: Array<{
    name: string
    description?: string
    required?: boolean
  }>
}

/** MCP 提示词结果 */
export interface MCPPromptResult {
  description?: string
  messages: Array<{
    role: 'user' | 'assistant'
    content: MCPToolResultContent
  }>
}

/** MCP 日志级别 */
export type MCPLogLevel = 'debug' | 'info' | 'notice' | 'warning' | 'error' | 'critical' | 'alert' | 'emergency'

/** MCP 通知 */
export interface MCPNotification {
  method: string
  params?: Record<string, unknown>
}

/** MCP JSON-RPC 请求 */
export interface MCPRequest {
  jsonrpc: '2.0'
  id: string | number
  method: string
  params?: Record<string, unknown>
}

/** MCP JSON-RPC 响应 */
export interface MCPResponse<T = unknown> {
  jsonrpc: '2.0'
  id: string | number
  result?: T
  error?: {
    code: number
    message: string
    data?: unknown
  }
}

/** MCP 传输配置 */
export interface MCPTransportConfig {
  type: 'stdio' | 'sse' | 'websocket'
  /** stdio 传输配置 */
  command?: string
  args?: string[]
  env?: Record<string, string>
  /** sse/websocket 传输配置 */
  url?: string
  headers?: Record<string, string>
}

/** MCP 客户端配置 */
export interface MCPClientConfig {
  name: string
  version: string
  transport: MCPTransportConfig
  capabilities?: MCPClientCapabilities
  timeout?: number
}
