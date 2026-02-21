/**
 * ACP 客户端
 *
 * 实现 ACP Agent 接口，处理 IDE 连接。
 */

import { getLogger } from '@logtape/logtape';
import type {
  ACPAgent,
  ACPConnection,
  AuthenticateRequest,
  InitializeRequest,
  InitializeResponse,
  NewSessionRequest,
  SessionInfo,
  ListSessionsRequest,
  ListSessionsResponse,
  PromptRequest,
  CancelNotification,
  ResumeSessionRequest,
  ResumeSessionResponse,
  LoadSessionRequest,
  ForkSessionRequest,
  ForkSessionResponse,
  SetSessionModelRequest,
  SetSessionModeRequest,
  SetSessionModeResponse,
} from './types';

const log = getLogger(['acp', 'client']);

/** ACP 客户端配置 */
export interface ACPClientConfig {
  /** 服务版本 */
  serverVersion: string;
  /** 协议版本 */
  protocolVersion: string;
  /** 连接回调 */
  connection: ACPConnection;
}

/**
 * ACP 客户端实现
 *
 * 处理 IDE 发送的 ACP 请求，委托给连接发送事件。
 */
export class ACPClient implements ACPAgent {
  private sessions = new Map<string, SessionInfo>();
  private config: ACPClientConfig;
  private currentSession: SessionInfo | null = null;

  constructor(config: ACPClientConfig) {
    this.config = config;
  }

  /**
   * 认证
   */
  async authenticate(request: AuthenticateRequest): Promise<boolean> {
    log.info('认证请求: {type}', { type: request.authMethod.type });

    // 简化实现：接受所有认证
    // 生产环境应验证 token
    if (request.authMethod.type === 'token' && request.authMethod.token) {
      return true;
    }

    if (request.authMethod.type === 'none') {
      return true;
    }

    return false;
  }

  /**
   * 初始化
   */
  async initialize(request: InitializeRequest): Promise<InitializeResponse> {
    log.info('初始化: client={client}, protocol={protocol}', {
      client: request.clientVersion,
      protocol: request.protocolVersion,
    });

    return {
      serverVersion: this.config.serverVersion,
      protocolVersion: this.config.protocolVersion,
      capabilities: {
        permissions: true,
        tools: true,
        resources: true,
        prompts: true,
      },
      authMethods: [{ type: 'none' }],
    };
  }

  /**
   * 创建新会话
   */
  async newSession(request: NewSessionRequest): Promise<SessionInfo> {
    const sessionId = crypto.randomUUID();
    const now = new Date().toISOString();

    const session: SessionInfo = {
      id: sessionId,
      createdAt: now,
      updatedAt: now,
      cwd: request.cwd,
      model: request.model,
      status: 'idle',
    };

    this.sessions.set(sessionId, session);
    this.currentSession = session;

    log.info('创建会话: {id}, cwd={cwd}', { id: sessionId, cwd: request.cwd });

    return session;
  }

  /**
   * 列出会话
   */
  async listSessions(request: ListSessionsRequest): Promise<ListSessionsResponse> {
    const sessions = Array.from(this.sessions.values());

    if (request.cwd) {
      const filtered = sessions.filter(s => s.cwd === request.cwd);
      return { sessions: filtered };
    }

    return { sessions };
  }

  /**
   * 发送提示（由子类实现具体逻辑）
   */
  async prompt(request: PromptRequest): Promise<void> {
    const session = this.sessions.get(request.sessionId);
    if (!session) {
      throw new Error(`会话不存在: ${request.sessionId}`);
    }

    session.status = 'busy';
    session.updatedAt = new Date().toISOString();

    log.info('提示请求: session={id}, prompt={preview}', {
      id: request.sessionId,
      preview: request.prompt.slice(0, 50),
    });

    // 派发提示事件（由适配器处理）
    await this.handlePrompt(request, session);
  }

  /**
   * 处理提示（可被子类覆盖）
   */
  protected async handlePrompt(request: PromptRequest, session: SessionInfo): Promise<void> {
    // 默认实现：发送回显
    await this.config.connection.sendText(session.id, `收到: ${request.prompt}`);
    await this.config.connection.sendComplete(session.id);

    session.status = 'idle';
    session.updatedAt = new Date().toISOString();
  }

  /**
   * 取消操作
   */
  async cancel(notification: CancelNotification): Promise<void> {
    const session = this.sessions.get(notification.sessionId);
    if (session) {
      session.status = 'idle';
      session.updatedAt = new Date().toISOString();
      log.info('取消会话: {id}', { id: notification.sessionId });
    }
  }

  /**
   * 恢复会话
   */
  async resumeSession(request: ResumeSessionRequest): Promise<ResumeSessionResponse> {
    const session = this.sessions.get(request.sessionId);
    if (!session) {
      throw new Error(`会话不存在: ${request.sessionId}`);
    }

    this.currentSession = session;
    return { session };
  }

  /**
   * 加载会话
   */
  async loadSession(request: LoadSessionRequest): Promise<void> {
    const session = this.sessions.get(request.sessionId);
    if (!session) {
      throw new Error(`会话不存在: ${request.sessionId}`);
    }

    this.currentSession = session;
    log.info('加载会话: {id}', { id: request.sessionId });
  }

  /**
   * Fork 会话
   */
  async forkSession(request: ForkSessionRequest): Promise<ForkSessionResponse> {
    const originalSession = this.sessions.get(request.sessionId);
    if (!originalSession) {
      throw new Error(`会话不存在: ${request.sessionId}`);
    }

    const sessionId = crypto.randomUUID();
    const now = new Date().toISOString();

    const session: SessionInfo = {
      ...originalSession,
      id: sessionId,
      createdAt: now,
      updatedAt: now,
      status: 'idle',
    };

    this.sessions.set(sessionId, session);
    log.info('Fork 会话: {originalId} -> {newId}', { originalId: request.sessionId, newId: sessionId });

    return { session };
  }

  /**
   * 设置会话模型
   */
  async setSessionModel(request: SetSessionModelRequest): Promise<void> {
    const session = this.sessions.get(request.sessionId);
    if (!session) {
      throw new Error(`会话不存在: ${request.sessionId}`);
    }

    session.model = request.model;
    session.updatedAt = new Date().toISOString();

    log.info('设置会话模型: session={id}, model={model}', {
      id: request.sessionId,
      model: `${request.model.providerId}/${request.model.modelId}`,
    });
  }

  /**
   * 设置会话模式
   */
  async setSessionMode(request: SetSessionModeRequest): Promise<SetSessionModeResponse> {
    const session = this.sessions.get(request.sessionId);
    if (!session) {
      throw new Error(`会话不存在: ${request.sessionId}`);
    }

    session.updatedAt = new Date().toISOString();
    log.info('设置会话模式: session={id}, mode={mode}', { id: request.sessionId, mode: request.modeId });

    return { session };
  }

  /**
   * 获取当前会话
   */
  getCurrentSession(): SessionInfo | null {
    return this.currentSession;
  }

  /**
   * 获取连接
   */
  getConnection(): ACPConnection {
    return this.config.connection;
  }
}
