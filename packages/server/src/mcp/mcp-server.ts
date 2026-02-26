/**
 * MCP (Model Context Protocol) 服务器实现
 *
 * 暴露 MicroAgent 的工具、资源和提示词给 MCP 客户端（如 Claude Desktop）。
 * @see https://modelcontextprotocol.io
 */

import type { MCPServerCapabilities, MCPImplementation, MCPToolDefinition, MCPToolResult, MCPResource, MCPResourceContents, MCPPrompt, MCPPromptResult, MCPLogLevel } from '@micro-agent/providers/mcp'
import { MCP_VERSION } from '@micro-agent/providers/mcp'
import { MCPHandlers } from './handlers'
import type { MCPServerConfig, ToolHandler, ResourceHandler, PromptHandler, MCPServerLike } from './types'

/** 默认服务器能力 */
const DEFAULT_CAPABILITIES: MCPServerCapabilities = {
  tools: { listChanged: true },
  resources: { subscribe: false, listChanged: true },
  prompts: { listChanged: true },
  logging: {},
}

/**
 * MCP 服务器
 *
 * 实现 MCP 协议，暴露工具、资源和提示词。
 */
export class MCPServer implements MCPServerLike {
  private readonly config: Required<MCPServerConfig>
  private readonly handlers: MCPHandlers
  private initialized = false

  constructor(config: MCPServerConfig) {
    this.config = {
      serverInfo: config.serverInfo,
      capabilities: config.capabilities ?? {},
      instructions: config.instructions ?? '',
    }
    this.handlers = new MCPHandlers()
  }

  /**
   * 获取服务器能力
   */
  getCapabilities(): MCPServerCapabilities {
    return {
      ...DEFAULT_CAPABILITIES,
      ...this.config.capabilities,
    }
  }

  /**
   * 获取服务器信息
   */
  getServerInfo(): MCPImplementation {
    return this.config.serverInfo
  }

  /**
   * 获取说明文本
   */
  getInstructions(): string {
    return this.config.instructions
  }

  /**
   * 处理初始化请求
   */
  async handleInitialize(params: { protocolVersion: string; capabilities: unknown; clientInfo: MCPImplementation }): Promise<{
    protocolVersion: string
    capabilities: MCPServerCapabilities
    serverInfo: MCPImplementation
    instructions?: string
  }> {
    this.initialized = true
    return {
      protocolVersion: MCP_VERSION,
      capabilities: this.getCapabilities(),
      serverInfo: this.config.serverInfo,
      instructions: this.config.instructions || undefined,
    }
  }

  /**
   * 注册工具
   */
  registerTool(definition: MCPToolDefinition, handler: ToolHandler): void {
    this.handlers.registerTool(definition, handler)
  }

  /**
   * 注册资源
   */
  registerResource(resource: MCPResource, handler: ResourceHandler): void {
    this.handlers.registerResource(resource, handler)
  }

  /**
   * 注册提示词
   */
  registerPrompt(prompt: MCPPrompt, handler: PromptHandler): void {
    this.handlers.registerPrompt(prompt, handler)
  }

  /**
   * 设置默认工具处理器
   */
  setDefaultToolHandler(handler: ToolHandler): void {
    this.handlers.setDefaultToolHandler(handler)
  }

  /**
   * 设置默认资源处理器
   */
  setDefaultResourceHandler(handler: ResourceHandler): void {
    this.handlers.setDefaultResourceHandler(handler)
  }

  /**
   * 列出工具
   */
  async listTools(): Promise<MCPToolDefinition[]> {
    return this.handlers.listTools()
  }

  /**
   * 调用工具
   */
  async callTool(name: string, args: Record<string, unknown>): Promise<MCPToolResult> {
    return this.handlers.callTool(name, args)
  }

  /**
   * 列出资源
   */
  async listResources(): Promise<MCPResource[]> {
    return this.handlers.listResources()
  }

  /**
   * 读取资源
   */
  async readResource(uri: string): Promise<{ contents: MCPResourceContents[] }> {
    return this.handlers.readResource(uri)
  }

  /**
   * 列出提示词
   */
  async listPrompts(): Promise<MCPPrompt[]> {
    return this.handlers.listPrompts()
  }

  /**
   * 获取提示词
   */
  async getPrompt(name: string, args?: Record<string, string>): Promise<MCPPromptResult> {
    return this.handlers.getPrompt(name, args)
  }

  /**
   * 处理 JSON-RPC 请求
   */
  async handleRequest(request: { jsonrpc: string; id?: string | number; method: string; params?: Record<string, unknown> }): Promise<{
    jsonrpc: '2.0'
    id: string | number
    result?: unknown
    error?: { code: number; message: string; data?: unknown }
  }> {
    const { id, method, params } = request

    try {
      let result: unknown

      switch (method) {
        case 'initialize':
          result = await this.handleInitialize(params as { protocolVersion: string; capabilities: unknown; clientInfo: MCPImplementation })
          break

        case 'tools/list':
          result = { tools: await this.listTools() }
          break

        case 'tools/call': {
          const { name, arguments: args } = params as { name: string; arguments: Record<string, unknown> }
          result = await this.callTool(name, args ?? {})
          break
        }

        case 'resources/list':
          result = { resources: await this.listResources() }
          break

        case 'resources/read': {
          const { uri } = params as { uri: string }
          result = await this.readResource(uri)
          break
        }

        case 'resources/templates/list':
          result = { resourceTemplates: [] }
          break

        case 'prompts/list':
          result = { prompts: await this.listPrompts() }
          break

        case 'prompts/get': {
          const { name, arguments: args } = params as { name: string; arguments: Record<string, string> | undefined }
          result = await this.getPrompt(name, args)
          break
        }

        case 'logging/setLevel':
          // 日志级别设置 - 可以扩展为实际日志控制
          break

        case 'ping':
          result = {}
          break

        default:
          return {
            jsonrpc: '2.0',
            id: id ?? 0,
            error: { code: -32601, message: `Method not found: ${method}` },
          }
      }

      return {
        jsonrpc: '2.0',
        id: id ?? 0,
        result,
      }
    } catch (error) {
      return {
        jsonrpc: '2.0',
        id: id ?? 0,
        error: {
          code: -32603,
          message: error instanceof Error ? error.message : 'Internal error',
        },
      }
    }
  }

  /**
   * 启动 stdio 传输模式
   *
   * 从 stdin 读取请求，向 stdout 写入响应。
   */
  async startStdio(): Promise<void> {
    const decoder = new TextDecoder()
    let buffer = ''

    // 读取 stdin
    const reader = Bun.stdin.stream().getReader()

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        if (!line.trim()) continue

        try {
          const request = JSON.parse(line)
          const response = await this.handleRequest(request)
          console.log(JSON.stringify(response))
        } catch {
          // 忽略解析错误
        }
      }
    }
  }
}

/**
 * 创建 MCP 服务器
 */
export function createMCPServer(config: MCPServerConfig): MCPServer {
  return new MCPServer(config)
}
