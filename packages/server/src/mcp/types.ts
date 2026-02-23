/**
 * MCP Server 类型定义
 */

import type { MCPServerCapabilities, MCPImplementation, MCPToolDefinition, MCPToolResult, MCPResource, MCPResourceContents, MCPPrompt, MCPPromptResult, MCPLogLevel } from '@microbot/providers/mcp'

/** MCP 服务器配置 */
export interface MCPServerConfig {
  /** 服务器信息 */
  serverInfo: MCPImplementation
  /** 服务器能力 */
  capabilities?: Partial<MCPServerCapabilities>
  /** 说明文本 */
  instructions?: string
}

/** 工具处理器 */
export type ToolHandler = (name: string, args: Record<string, unknown>) => Promise<MCPToolResult>

/** 资源处理器 */
export type ResourceHandler = (uri: string) => Promise<{ contents: MCPResourceContents[] }>

/** 提示词处理器 */
export type PromptHandler = (name: string, args?: Record<string, string>) => Promise<MCPPromptResult>

/** MCP 服务器接口 */
export interface MCPServerLike {
  /** 获取服务器能力 */
  getCapabilities(): MCPServerCapabilities
  /** 获取服务器信息 */
  getServerInfo(): MCPImplementation
  /** 列出工具 */
  listTools(): Promise<MCPToolDefinition[]>
  /** 调用工具 */
  callTool(name: string, args: Record<string, unknown>): Promise<MCPToolResult>
  /** 列出资源 */
  listResources(): Promise<MCPResource[]>
  /** 读取资源 */
  readResource(uri: string): Promise<{ contents: MCPResourceContents[] }>
  /** 列出提示词 */
  listPrompts(): Promise<MCPPrompt[]>
  /** 获取提示词 */
  getPrompt(name: string, args?: Record<string, string>): Promise<MCPPromptResult>
}
