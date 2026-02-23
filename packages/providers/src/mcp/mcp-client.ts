/**
 * MCP (Model Context Protocol) 客户端实现
 *
 * 用于连接外部 MCP 服务器，获取工具、资源和提示词。
 * @see https://modelcontextprotocol.io
 */

import type {
  MCPClientCapabilities,
  MCPClientConfig,
  MCPInitializeRequest,
  MCPInitializeResult,
  MCPToolDefinition,
  MCPToolCall,
  MCPToolResult,
  MCPResource,
  MCPResourceContents,
  MCPResourceTemplate,
  MCPPrompt,
  MCPPromptResult,
  MCPRequest,
  MCPResponse,
  MCPServerCapabilities,
  MCPLogLevel,
} from './types'
import { MCP_VERSION } from './types'

/** MCP 客户端状态 */
type MCPClientState = 'disconnected' | 'connecting' | 'connected' | 'error'

/**
 * MCP 客户端
 *
 * 用于连接外部 MCP 服务器。
 */
export class MCPClient {
  private state: MCPClientState = 'disconnected'
  private serverCapabilities: MCPServerCapabilities | null = null
  private serverInfo: { name: string; version: string } | null = null
  private instructions: string | null = null
  private readonly config: Required<Omit<MCPClientConfig, 'capabilities'>> & { capabilities: MCPClientCapabilities }
  private requestId = 0
  private pendingRequests = new Map<string | number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>()
  private process: Bun.Subprocess | null = null
  private ws: WebSocket | null = null
  private messageHandler: ((message: unknown) => void) | null = null

  constructor(config: MCPClientConfig) {
    this.config = {
      name: config.name,
      version: config.version,
      transport: config.transport,
      capabilities: config.capabilities ?? {},
      timeout: config.timeout ?? 30000,
    }
  }

  /**
   * 连接到 MCP 服务器
   */
  async connect(): Promise<MCPInitializeResult> {
    this.state = 'connecting'

    try {
      // 根据传输类型建立连接
      switch (this.config.transport.type) {
        case 'stdio':
          await this.connectStdio()
          break
        case 'websocket':
          await this.connectWebSocket()
          break
        case 'sse':
          await this.connectSSE()
          break
        default:
          throw new Error(`Unsupported transport type: ${this.config.transport.type}`)
      }

      // 发送初始化请求
      const initRequest: MCPInitializeRequest = {
        protocolVersion: MCP_VERSION,
        capabilities: this.config.capabilities,
        clientInfo: {
          name: this.config.name,
          version: this.config.version,
        },
      }

      const result = await this.sendRequest<MCPInitializeResult>('initialize', initRequest)
      this.serverCapabilities = result.capabilities
      this.serverInfo = result.serverInfo
      this.instructions = result.instructions ?? null
      this.state = 'connected'

      // 发送 initialized 通知
      await this.sendNotification('notifications/initialized')

      return result
    } catch (error) {
      this.state = 'error'
      throw error
    }
  }

  /**
   * 断开连接
   */
  async disconnect(): Promise<void> {
    if (this.process) {
      this.process.kill()
      this.process = null
    }
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.state = 'disconnected'
  }

  /**
   * 获取服务器能力
   */
  getServerCapabilities(): MCPServerCapabilities | null {
    return this.serverCapabilities
  }

  /**
   * 获取服务器信息
   */
  getServerInfo(): { name: string; version: string } | null {
    return this.serverInfo
  }

  /**
   * 获取服务器说明
   */
  getInstructions(): string | null {
    return this.instructions
  }

  /**
   * 列出可用工具
   */
  async listTools(): Promise<{ tools: MCPToolDefinition[]; nextCursor?: string }> {
    const result = await this.sendRequest<{ tools: MCPToolDefinition[]; nextCursor?: string }>('tools/list')
    return result
  }

  /**
   * 调用工具
   */
  async callTool(name: string, args: Record<string, unknown>): Promise<MCPToolResult> {
    const toolCall: MCPToolCall = { name, arguments: args }
    const result = await this.sendRequest<MCPToolResult>('tools/call', toolCall)
    return result
  }

  /**
   * 列出可用资源
   */
  async listResources(): Promise<{ resources: MCPResource[]; nextCursor?: string }> {
    const result = await this.sendRequest<{ resources: MCPResource[]; nextCursor?: string }>('resources/list')
    return result
  }

  /**
   * 读取资源
   */
  async readResource(uri: string): Promise<{ contents: MCPResourceContents[] }> {
    const result = await this.sendRequest<{ contents: MCPResourceContents[] }>('resources/read', { uri })
    return result
  }

  /**
   * 列出资源模板
   */
  async listResourceTemplates(): Promise<{ resourceTemplates: MCPResourceTemplate[]; nextCursor?: string }> {
    const result = await this.sendRequest<{ resourceTemplates: MCPResourceTemplate[]; nextCursor?: string }>('resources/templates/list')
    return result
  }

  /**
   * 列出可用提示词
   */
  async listPrompts(): Promise<{ prompts: MCPPrompt[]; nextCursor?: string }> {
    const result = await this.sendRequest<{ prompts: MCPPrompt[]; nextCursor?: string }>('prompts/list')
    return result
  }

  /**
   * 获取提示词
   */
  async getPrompt(name: string, args?: Record<string, string>): Promise<MCPPromptResult> {
    const result = await this.sendRequest<MCPPromptResult>('prompts/get', { name, arguments: args })
    return result
  }

  /**
   * 设置日志级别
   */
  async setLogLevel(level: MCPLogLevel): Promise<void> {
    await this.sendRequest('logging/setLevel', { level })
  }

  /**
   * 发送请求
   */
  private async sendRequest<T>(method: string, params?: unknown): Promise<T> {
    const id = ++this.requestId
    const request: MCPRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params: params as Record<string, unknown> | undefined,
    }

    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id)
        reject(new Error(`Request timeout: ${method}`))
      }, this.config.timeout)

      this.pendingRequests.set(id, {
        resolve: (value: unknown) => {
          clearTimeout(timeout)
          resolve(value as T)
        },
        reject: (error: Error) => {
          clearTimeout(timeout)
          reject(error)
        },
      })

      this.sendMessage(request)
    })
  }

  /**
   * 发送通知
   */
  private async sendNotification(method: string, params?: Record<string, unknown>): Promise<void> {
    const notification = {
      jsonrpc: '2.0' as const,
      method,
      params,
    }
    this.sendMessage(notification)
  }

  /**
   * 发送消息
   */
  private sendMessage(message: unknown): void {
    const json = JSON.stringify(message)

    switch (this.config.transport.type) {
      case 'stdio':
        if (this.process?.stdin && typeof this.process.stdin !== 'number') {
          this.process.stdin.write(json + '\n')
        }
        break
      case 'websocket':
        if (this.ws) {
          this.ws.send(json)
        }
        break
      case 'sse':
        // SSE 是单向的，使用 POST 发送请求
        if (this.config.transport.url) {
          fetch(this.config.transport.url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: json,
          }).catch(() => {})
        }
        break
    }
  }

  /**
   * 处理响应
   */
  private handleResponse(data: string): void {
    try {
      const message = JSON.parse(data) as MCPResponse

      if ('id' in message) {
        const pending = this.pendingRequests.get(message.id)
        if (pending) {
          this.pendingRequests.delete(message.id)
          if (message.error) {
            pending.reject(new Error(`MCP Error ${message.error.code}: ${message.error.message}`))
          } else {
            pending.resolve(message.result)
          }
        }
      } else if ('method' in message) {
        // 处理通知
        this.messageHandler?.(message)
      }
    } catch {
      // 忽略解析错误
    }
  }

  /**
   * 连接 stdio 传输
   */
  private async connectStdio(): Promise<void> {
    const { command, args, env } = this.config.transport
    if (!command) {
      throw new Error('stdio transport requires command')
    }

    // 使用 Bun 的 subprocess API
    this.process = Bun.spawn([command, ...(args ?? [])], {
      env: { ...process.env, ...env },
      stdin: 'pipe',
      stdout: 'pipe',
      stderr: 'pipe',
    })

    // 读取 stdout
    const stdout = this.process.stdout
    if (!stdout) {
      throw new Error('stdout is undefined')
    }
    if (typeof stdout === 'number') {
      throw new Error('stdout is a file descriptor, expected ReadableStream')
    }
    const reader = stdout.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    const readLoop = async () => {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (line.trim()) {
            this.handleResponse(line)
          }
        }
      }
    }

    readLoop().catch(() => {})
  }

  /**
   * 连接 WebSocket 传输
   */
  private async connectWebSocket(): Promise<void> {
    const { url } = this.config.transport
    if (!url) {
      throw new Error('websocket transport requires url')
    }

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url)

      this.ws.onopen = () => resolve()
      this.ws.onerror = (error) => reject(new Error('WebSocket error'))
      this.ws.onmessage = (event) => {
        if (typeof event.data === 'string') {
          this.handleResponse(event.data)
        }
      }
    })
  }

  /**
   * 连接 SSE 传输
   */
  private async connectSSE(): Promise<void> {
    const { url, headers } = this.config.transport
    if (!url) {
      throw new Error('sse transport requires url')
    }

    // 使用 fetch 处理 SSE
    const response = await fetch(url, {
      headers: {
        Accept: 'text/event-stream',
        ...headers,
      },
    })

    if (!response.ok) {
      throw new Error(`SSE connection failed: ${response.status}`)
    }

    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error('No response body')
    }

    const decoder = new TextDecoder()
    let buffer = ''

    // 异步读取 SSE 流
    const readLoop = async () => {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            this.handleResponse(line.slice(6))
          }
        }
      }
    }

    readLoop().catch(() => {})
  }
}

/**
 * 创建 MCP 客户端
 */
export function createMCPClient(config: MCPClientConfig): MCPClient {
  return new MCPClient(config)
}
