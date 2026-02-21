/**
 * A2A (Agent-to-Agent) Agent Card 类型定义
 *
 * Agent Card 是描述 Agent 能力的 JSON 文档，遵循 Google A2A 规范。
 * @see https://github.com/google/A2A
 */

/** Agent 能力 */
export interface AgentCapabilities {
  /** 支持流式响应 */
  streaming?: boolean
  /** 支持推送通知 */
  pushNotifications?: boolean
  /** 支持状态转换历史 */
  stateTransitionHistory?: boolean
}

/** Agent 技能 */
export interface AgentSkill {
  /** 技能唯一标识 */
  id: string
  /** 技能名称 */
  name: string
  /** 技能描述 */
  description: string
  /** 输入模式 (JSON Schema) */
  inputSchema?: Record<string, unknown>
  /** 输出模式 (JSON Schema) */
  outputSchema?: Record<string, unknown>
  /** 示例 */
  examples?: Array<{
    input: unknown
    output: unknown
  }>
  /** 标签 */
  tags?: string[]
}

/** Agent 认证 */
export interface AgentAuthentication {
  /** 认证方案 */
  schemes: string[]
  /** 凭证 */
  credentials?: string
}

/** Agent 端点 */
export interface AgentEndpoint {
  /** 端点 URL */
  url: string
  /** 传输协议 */
  transport: 'jsonrpc' | 'grpc' | 'rest' | 'websocket'
  /** 认证要求 */
  authentication?: AgentAuthentication
}

/** Agent Card */
export interface AgentCard {
  /** Agent 版本 */
  agentVersion: string
  /** 协议版本 */
  protocolVersion: string
  /** Agent 名称 */
  name: string
  /** Agent 描述 */
  description?: string
  /** Agent URL（发现端点） */
  url: string
  /** 支持的能力 */
  capabilities: AgentCapabilities
  /** 可用技能 */
  skills: AgentSkill[]
  /** 可用端点 */
  endpoints: AgentEndpoint[]
  /** 认证信息 */
  authentication?: AgentAuthentication
  /** 默认输入模式 */
  defaultInputMode: 'text' | 'voice' | 'image' | 'mixed'
  /** 默认输出模式 */
  defaultOutputMode: 'text' | 'voice' | 'image' | 'mixed'
  /** 元数据 */
  metadata?: Record<string, unknown>
}

/** Agent Card 解析结果 */
export interface ParsedAgentCard {
  valid: boolean
  card?: AgentCard
  errors?: string[]
}

/**
 * 解析并验证 Agent Card
 */
export function parseAgentCard(data: unknown): ParsedAgentCard {
  const errors: string[] = []

  if (typeof data !== 'object' || data === null) {
    return { valid: false, errors: ['Agent Card must be an object'] }
  }

  const card = data as Record<string, unknown>

  // 必填字段验证
  const requiredFields = ['agentVersion', 'protocolVersion', 'name', 'url', 'capabilities', 'skills', 'endpoints', 'defaultInputMode', 'defaultOutputMode']
  for (const field of requiredFields) {
    if (!(field in card)) {
      errors.push(`Missing required field: ${field}`)
    }
  }

  // 验证 capabilities
  if (card.capabilities && typeof card.capabilities !== 'object') {
    errors.push('capabilities must be an object')
  }

  // 验证 skills 数组
  if (card.skills && !Array.isArray(card.skills)) {
    errors.push('skills must be an array')
  } else if (Array.isArray(card.skills)) {
    card.skills.forEach((skill, index) => {
      if (!skill.id || !skill.name || !skill.description) {
        errors.push(`skills[${index}] missing required fields (id, name, description)`)
      }
    })
  }

  // 验证 endpoints 数组
  if (card.endpoints && !Array.isArray(card.endpoints)) {
    errors.push('endpoints must be an array')
  } else if (Array.isArray(card.endpoints)) {
    card.endpoints.forEach((endpoint, index) => {
      if (!endpoint.url) {
        errors.push(`endpoints[${index}] missing required field: url`)
      }
      if (endpoint.transport && !['jsonrpc', 'grpc', 'rest', 'websocket'].includes(endpoint.transport)) {
        errors.push(`endpoints[${index}] invalid transport: ${endpoint.transport}`)
      }
    })
  }

  if (errors.length > 0) {
    return { valid: false, errors }
  }

  return { valid: true, card: card as unknown as AgentCard }
}

/**
 * 创建简单的 Agent Card
 */
export function createAgentCard(partial: Partial<AgentCard> & { name: string; url: string }): AgentCard {
  return {
    agentVersion: partial.agentVersion ?? '1.0.0',
    protocolVersion: partial.protocolVersion ?? '1.0',
    name: partial.name,
    description: partial.description,
    url: partial.url,
    capabilities: partial.capabilities ?? { streaming: true },
    skills: partial.skills ?? [],
    endpoints: partial.endpoints ?? [{ url: partial.url, transport: 'jsonrpc' }],
    defaultInputMode: partial.defaultInputMode ?? 'text',
    defaultOutputMode: partial.defaultOutputMode ?? 'text',
    metadata: partial.metadata,
  }
}
