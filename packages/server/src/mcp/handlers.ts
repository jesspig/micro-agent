/**
 * MCP Server 处理器
 *
 * 提供 MCP 协议方法的处理器注册和调用。
 */

import type { MCPToolDefinition, MCPToolResult, MCPResource, MCPResourceContents, MCPPrompt, MCPPromptResult } from '@micro-agent/providers/mcp'
import type { ToolHandler, ResourceHandler, PromptHandler } from './types'

/** 处理器注册表 */
export class MCPHandlers {
  private tools = new Map<string, { definition: MCPToolDefinition; handler: ToolHandler }>()
  private resources = new Map<string, { resource: MCPResource; handler: ResourceHandler }>()
  private prompts = new Map<string, { prompt: MCPPrompt; handler: PromptHandler }>()
  private defaultToolHandler: ToolHandler | null = null
  private defaultResourceHandler: ResourceHandler | null = null

  /**
   * 注册工具
   */
  registerTool(definition: MCPToolDefinition, handler: ToolHandler): void {
    this.tools.set(definition.name, { definition, handler })
  }

  /**
   * 注册资源
   */
  registerResource(resource: MCPResource, handler: ResourceHandler): void {
    this.resources.set(resource.uri, { resource, handler })
  }

  /**
   * 注册提示词
   */
  registerPrompt(prompt: MCPPrompt, handler: PromptHandler): void {
    this.prompts.set(prompt.name, { prompt, handler })
  }

  /**
   * 设置默认工具处理器
   */
  setDefaultToolHandler(handler: ToolHandler): void {
    this.defaultToolHandler = handler
  }

  /**
   * 设置默认资源处理器
   */
  setDefaultResourceHandler(handler: ResourceHandler): void {
    this.defaultResourceHandler = handler
  }

  /**
   * 列出工具
   */
  async listTools(): Promise<MCPToolDefinition[]> {
    return Array.from(this.tools.values()).map(t => t.definition)
  }

  /**
   * 调用工具
   */
  async callTool(name: string, args: Record<string, unknown>): Promise<MCPToolResult> {
    const tool = this.tools.get(name)
    if (tool) {
      return tool.handler(name, args)
    }
    if (this.defaultToolHandler) {
      return this.defaultToolHandler(name, args)
    }
    return {
      content: [{ type: 'text', text: `Unknown tool: ${name}` }],
      isError: true,
    }
  }

  /**
   * 列出资源
   */
  async listResources(): Promise<MCPResource[]> {
    return Array.from(this.resources.values()).map(r => r.resource)
  }

  /**
   * 读取资源
   */
  async readResource(uri: string): Promise<{ contents: MCPResourceContents[] }> {
    const resource = this.resources.get(uri)
    if (resource) {
      return resource.handler(uri)
    }
    if (this.defaultResourceHandler) {
      return this.defaultResourceHandler(uri)
    }
    return { contents: [] }
  }

  /**
   * 列出提示词
   */
  async listPrompts(): Promise<MCPPrompt[]> {
    return Array.from(this.prompts.values()).map(p => p.prompt)
  }

  /**
   * 获取提示词
   */
  async getPrompt(name: string, args?: Record<string, string>): Promise<MCPPromptResult> {
    const prompt = this.prompts.get(name)
    if (prompt) {
      return prompt.handler(name, args)
    }
    return {
      messages: [{ role: 'user', content: { type: 'text', text: `Unknown prompt: ${name}` } }],
    }
  }

  /**
   * 清除所有处理器
   */
  clear(): void {
    this.tools.clear()
    this.resources.clear()
    this.prompts.clear()
    this.defaultToolHandler = null
    this.defaultResourceHandler = null
  }
}

/**
 * 创建处理器注册表
 */
export function createMCPHandlers(): MCPHandlers {
  return new MCPHandlers()
}
