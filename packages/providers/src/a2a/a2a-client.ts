/**
 * A2A (Agent-to-Agent) 客户端实现
 *
 * 用于连接和调用外部 Agent，遵循 Google A2A 规范。
 * @see https://github.com/google/A2A
 */

import type { AgentCard, AgentSkill, AgentEndpoint, AgentAuthentication } from './agent-card'
import { parseAgentCard } from './agent-card'

/** A2A 消息角色 */
export type A2ARole = 'user' | 'agent'

/** A2A 消息 */
export interface A2AMessage {
  role: A2ARole
  parts: A2APart[]
  metadata?: Record<string, unknown>
}

/** A2A 消息部分 */
export type A2APart =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string }
  | { type: 'file'; data: string; mimeType: string; filename?: string }
  | { type: 'data'; data: Record<string, unknown> }

/** A2A 任务状态 */
export type A2ATaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'canceled'

/** A2A 任务 */
export interface A2ATask {
  id: string
  status: A2ATaskStatus
  messages: A2AMessage[]
  artifacts?: A2AArtifact[]
  metadata?: Record<string, unknown>
}

/** A2A 产物 */
export interface A2AArtifact {
  name: string
  description?: string
  parts: A2APart[]
  index: number
}

/** A2A 客户端配置 */
export interface A2AClientConfig {
  /** Agent Card URL 或对象 */
  agentCard: string | AgentCard
  /** 认证信息 */
  authentication?: AgentAuthentication
  /** 请求超时（毫秒） */
  timeout?: number
  /** 自定义 headers */
  headers?: Record<string, string>
}

/** A2A JSON-RPC 请求 */
interface JSONRPCRequest {
  jsonrpc: '2.0'
  id: string | number
  method: string
  params?: Record<string, unknown>
}

/** A2A JSON-RPC 响应 */
interface JSONRPCResponse<T = unknown> {
  jsonrpc: '2.0'
  id: string | number
  result?: T
  error?: {
    code: number
    message: string
    data?: unknown
  }
}

/** A2A 客户端配置（内部使用） */
interface InternalA2AConfig {
  agentCard: string | AgentCard
  authentication?: AgentAuthentication
  timeout: number
  headers: Record<string, string>
}

/**
 * A2A 客户端
 *
 * 用于连接和调用外部 Agent。
 */
export class A2AClient {
  private agentCard: AgentCard | null = null
  private endpoint: AgentEndpoint | null = null
  private readonly config: InternalA2AConfig

  constructor(config: A2AClientConfig) {
    this.config = {
      agentCard: config.agentCard,
      authentication: config.authentication,
      timeout: config.timeout ?? 30000,
      headers: config.headers ?? {},
    }
  }

  /**
   * 初始化客户端，获取并验证 Agent Card
   */
  async initialize(): Promise<AgentCard> {
    // 获取或使用 Agent Card
    let cardData: unknown
    if (typeof this.config.agentCard === 'string') {
      const response = await this.fetch(this.config.agentCard)
      cardData = await response.json()
    } else {
      cardData = this.config.agentCard
    }

    // 验证 Agent Card
    const result = parseAgentCard(cardData)
    if (!result.valid || !result.card) {
      throw new Error(`Invalid Agent Card: ${result.errors?.join(', ')}`)
    }

    this.agentCard = result.card

    // 选择首选端点
    this.endpoint = this.agentCard.endpoints.find(e => e.transport === 'jsonrpc') ?? this.agentCard.endpoints[0]
    if (!this.endpoint) {
      throw new Error('No valid endpoint found in Agent Card')
    }

    return this.agentCard
  }

  /**
   * 获取 Agent Card
   */
  getAgentCard(): AgentCard {
    if (!this.agentCard) {
      throw new Error('Client not initialized. Call initialize() first.')
    }
    return this.agentCard
  }

  /**
   * 获取 Agent 技能列表
   */
  getSkills(): AgentSkill[] {
    return this.getAgentCard().skills
  }

  /**
   * 发送消息并创建任务
   */
  async sendMessage(params: {
    message: A2AMessage
    skillId?: string
    metadata?: Record<string, unknown>
  }): Promise<A2ATask> {
    const response = await this.sendRequest('tasks/send', {
      message: params.message,
      skillId: params.skillId,
      metadata: params.metadata,
    })
    return response as A2ATask
  }

  /**
   * 流式发送消息
   */
  async *sendMessageStream(params: {
    message: A2AMessage
    skillId?: string
    metadata?: Record<string, unknown>
  }): AsyncGenerator<A2ATask | A2AMessage> {
    if (!this.endpoint) {
      throw new Error('Client not initialized')
    }

    const response = await this.fetch(this.endpoint.url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: crypto.randomUUID(),
        method: 'tasks/sendSubscribe',
        params: {
          message: params.message,
          skillId: params.skillId,
          metadata: params.metadata,
        },
      }),
    })

    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error('No response body')
    }

    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = JSON.parse(line.slice(6))
          if (data.result?.type === 'task') {
            yield data.result.task as A2ATask
          } else if (data.result?.type === 'message') {
            yield data.result.message as A2AMessage
          }
        }
      }
    }
  }

  /**
   * 获取任务状态
   */
  async getTask(taskId: string): Promise<A2ATask> {
    const response = await this.sendRequest('tasks/get', { taskId })
    return response as A2ATask
  }

  /**
   * 取消任务
   */
  async cancelTask(taskId: string): Promise<A2ATask> {
    const response = await this.sendRequest('tasks/cancel', { taskId })
    return response as A2ATask
  }

  /**
   * 发送 JSON-RPC 请求
   */
  private async sendRequest(method: string, params?: Record<string, unknown>): Promise<unknown> {
    if (!this.endpoint) {
      throw new Error('Client not initialized')
    }

    const request: JSONRPCRequest = {
      jsonrpc: '2.0',
      id: crypto.randomUUID(),
      method,
      params,
    }

    const response = await this.fetch(this.endpoint.url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(request),
    })

    const json = await response.json() as JSONRPCResponse

    if (json.error) {
      throw new Error(`A2A Error ${json.error.code}: ${json.error.message}`)
    }

    return json.result
  }

  /**
   * 获取请求 headers
   */
  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.config.headers,
    }

    // 添加认证
    if (this.config.authentication?.credentials) {
      const scheme = this.config.authentication.schemes[0] ?? 'Bearer'
      headers['Authorization'] = `${scheme} ${this.config.authentication.credentials}`
    }

    return headers
  }

  /**
   * 封装 fetch，添加超时控制
   */
  private async fetch(url: string, init?: RequestInit): Promise<Response> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.config.timeout)

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
      })
      return response
    } finally {
      clearTimeout(timeout)
    }
  }
}

/**
 * 创建 A2A 客户端
 */
export function createA2AClient(config: A2AClientConfig): A2AClient {
  return new A2AClient(config)
}
