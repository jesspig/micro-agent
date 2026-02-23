/**
 * ACP (Agent Client Protocol) 类型定义
 *
 * 简化版实现，兼容 Agent Client Protocol 规范。
 * @see https://github.com/anthropics/agent-client-protocol
 */

/** 权限选项 */
export interface PermissionOption {
  id: string
  title: string
  kind: 'accept' | 'reject' | 'modify'
}

/** 认证方法 */
export interface AuthMethod {
  type: 'token' | 'oauth' | 'none'
  token?: string
}

/** 认证请求 */
export interface AuthenticateRequest {
  authMethod: AuthMethod
}

/** 初始化请求 */
export interface InitializeRequest {
  clientVersion: string
  protocolVersion: string
  capabilities: {
    permissions?: boolean
    tools?: boolean
    resources?: boolean
    prompts?: boolean
  }
}

/** 初始化响应 */
export interface InitializeResponse {
  serverVersion: string
  protocolVersion: string
  capabilities: {
    permissions: boolean
    tools: boolean
    resources: boolean
    prompts: boolean
  }
  authMethods: AuthMethod[]
}

/** 会话信息 */
export interface SessionInfo {
  id: string
  createdAt: string
  updatedAt: string
  cwd: string
  model?: {
    providerId: string
    modelId: string
  }
  status: 'idle' | 'busy' | 'waiting'
}

/** 新会话请求 */
export interface NewSessionRequest {
  cwd: string
  model?: {
    providerId: string
    modelId: string
  }
  mcpServers?: MCPServerConfig[]
}

/** 会话列表请求 */
export interface ListSessionsRequest {
  cwd?: string
}

/** 会话列表响应 */
export interface ListSessionsResponse {
  sessions: SessionInfo[]
}

/** 提示请求 */
export interface PromptRequest {
  sessionId: string
  prompt: string
  attachments?: ContentBlock[]
  mode?: string
}

/** 内容块类型 */
export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string }
  | { type: 'resource_link'; uri: string; mimeType?: string }
  | { type: 'resource'; uri: string; mimeType?: string; data?: string }

/** 工具调用 */
export interface ToolCallContent {
  toolCallId: string
  name: string
  kind: 'function'
  arguments: Record<string, unknown>
}

/** 使用统计 */
export interface Usage {
  inputTokens: number
  outputTokens: number
  totalTokens: number
  cacheWriteTokens?: number
  cacheReadTokens?: number
}

/** 取消通知 */
export interface CancelNotification {
  sessionId: string
  reason?: string
}

/** 恢复会话请求 */
export interface ResumeSessionRequest {
  sessionId: string
}

/** 恢复会话响应 */
export interface ResumeSessionResponse {
  session: SessionInfo
}

/** 加载会话请求 */
export interface LoadSessionRequest {
  sessionId: string
}

/** Fork 会话请求 */
export interface ForkSessionRequest {
  sessionId: string
}

/** Fork 会话响应 */
export interface ForkSessionResponse {
  session: SessionInfo
}

/** 设置会话模型请求 */
export interface SetSessionModelRequest {
  sessionId: string
  model: {
    providerId: string
    modelId: string
  }
}

/** 设置会话模式请求 */
export interface SetSessionModeRequest {
  sessionId: string
  modeId: string
}

/** 设置会话模式响应 */
export interface SetSessionModeResponse {
  session: SessionInfo
}

/** 计划条目 */
export interface PlanEntry {
  content: string
  status: 'pending' | 'in_progress' | 'completed'
}

/** Agent 角色类型 */
export type Role = 'user' | 'assistant'

/** MCP 服务器配置 */
export interface MCPServerConfig {
  name: string
  transport: 'stdio' | 'sse' | 'ws'
  command?: string
  args?: string[]
  url?: string
  env?: Record<string, string>
}

/** ACP Agent 接口 */
export interface ACPAgent {
  /** 认证 */
  authenticate(request: AuthenticateRequest): Promise<boolean>

  /** 初始化 */
  initialize(request: InitializeRequest): Promise<InitializeResponse>

  /** 创建新会话 */
  newSession(request: NewSessionRequest): Promise<SessionInfo>

  /** 列出会话 */
  listSessions(request: ListSessionsRequest): Promise<ListSessionsResponse>

  /** 发送提示 */
  prompt(request: PromptRequest): Promise<void>

  /** 取消操作 */
  cancel(notification: CancelNotification): Promise<void>

  /** 恢复会话 */
  resumeSession(request: ResumeSessionRequest): Promise<ResumeSessionResponse>

  /** 加载会话 */
  loadSession(request: LoadSessionRequest): Promise<void>

  /** Fork 会话 */
  forkSession(request: ForkSessionRequest): Promise<ForkSessionResponse>

  /** 设置会话模型 */
  setSessionModel(request: SetSessionModelRequest): Promise<void>

  /** 设置会话模式 */
  setSessionMode(request: SetSessionModeRequest): Promise<SetSessionModeResponse>
}

/** ACP 回调接口（用于向客户端发送事件） */
export interface ACPConnection {
  /** 发送文本内容 */
  sendText(sessionId: string, text: string): Promise<void>

  /** 发送推理内容 */
  sendReasoning(sessionId: string, reasoning: string): Promise<void>

  /** 发送工具调用开始 */
  sendToolPending(sessionId: string, toolCall: ToolCallContent): Promise<void>

  /** 发送工具调用进行中 */
  sendToolInProgress(sessionId: string, toolCallId: string): Promise<void>

  /** 发送工具调用完成 */
  sendToolCompleted(sessionId: string, toolCallId: string, result: ContentBlock[]): Promise<void>

  /** 发送工具调用错误 */
  sendToolError(sessionId: string, toolCallId: string, error: string): Promise<void>

  /** 发送使用统计 */
  sendUsage(sessionId: string, usage: Usage): Promise<void>

  /** 发送完成通知 */
  sendComplete(sessionId: string): Promise<void>

  /** 请求权限 */
  requestPermission(sessionId: string, message: string, options: PermissionOption[]): Promise<string>

  /** 发送图片 */
  sendImage(sessionId: string, data: string, mimeType: string): Promise<void>

  /** 发送资源链接 */
  sendResourceLink(sessionId: string, uri: string, mimeType?: string): Promise<void>

  /** 发送资源 */
  sendResource(sessionId: string, uri: string, mimeType?: string, data?: string): Promise<void>
}
