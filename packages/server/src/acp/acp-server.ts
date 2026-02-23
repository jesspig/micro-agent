/**
 * ACP Server
 *
 * 实现 ACP (Agent Client Protocol) 服务器端，
 * 通过 stdin/stdout 进行 ndjson 通信。
 */

import { getLogger } from '@logtape/logtape';
import type { ACPAgent, ACPConnection, ContentBlock, ToolCallContent, Usage, PermissionOption } from '@microbot/providers/acp/types';

const log = getLogger(['server', 'acp']);

/** ACP 服务器配置 */
export interface ACPServerConfig {
  /** ACP Agent 实例 */
  agent: ACPAgent;
  /** 服务版本 */
  serverVersion?: string;
}

/** JSON-RPC 请求 */
interface JSONRPCRequest {
  jsonrpc: '2.0';
  id?: string | number;
  method: string;
  params?: unknown;
}

/** JSON-RPC 响应 */
interface JSONRPCResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

/** JSON-RPC 通知 */
interface JSONRPCNotification {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
}

/**
 * ACP Server
 *
 * 通过 stdin/stdout 处理 ACP 协议消息。
 */
export class ACPServer implements ACPConnection {
  private agent: ACPAgent;
  private serverVersion: string;
  private pendingMessages: JSONRPCRequest[] = [];
  private responseCallbacks = new Map<string | number, (response: JSONRPCResponse) => void>();

  constructor(config: ACPServerConfig) {
    this.agent = config.agent;
    this.serverVersion = config.serverVersion ?? 'microbot-0.2.0';
  }

  /**
   * 启动服务器
   */
  async start(): Promise<void> {
    log.info('ACP Server 启动');

    // 监听 stdin
    const decoder = new TextDecoder();
    let buffer = '';

    process.stdin.on('data', (chunk: Buffer) => {
      buffer += decoder.decode(chunk, { stream: true });

      // 尝试解析完整的 JSON 行
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (line.trim()) {
          this.handleLine(line);
        }
      }
    });

    process.stdin.on('end', () => {
      log.info('stdin 结束，关闭服务器');
    });

    process.stdin.resume();
  }

  /**
   * 处理一行输入
   */
  private handleLine(line: string): void {
    try {
      const message = JSON.parse(line) as JSONRPCRequest | JSONRPCNotification;

      if ('id' in message) {
        this.handleRequest(message as JSONRPCRequest);
      } else {
        this.handleNotification(message as JSONRPCNotification);
      }
    } catch (error) {
      log.error('解析消息失败: {error}', { error: String(error) });
    }
  }

  /**
   * 处理请求
   */
  private async handleRequest(request: JSONRPCRequest): Promise<void> {
    log.debug('收到请求: {method}', { method: request.method });

    try {
      const result = await this.dispatchMethod(request.method, request.params);

      this.sendResponse({
        jsonrpc: '2.0',
        id: request.id!,
        result,
      });
    } catch (error) {
      this.sendResponse({
        jsonrpc: '2.0',
        id: request.id!,
        error: {
          code: -32000,
          message: error instanceof Error ? error.message : '内部错误',
        },
      });
    }
  }

  /**
   * 处理通知
   */
  private handleNotification(notification: JSONRPCNotification): void {
    log.debug('收到通知: {method}', { method: notification.method });
    // 通知不需要响应
  }

  /**
   * 分发方法调用
   */
  private async dispatchMethod(method: string, params?: unknown): Promise<unknown> {
    switch (method) {
      case 'initialize':
        return this.agent.initialize(params as never);

      case 'authenticate':
        return this.agent.authenticate(params as never);

      case 'sessions/new':
        return this.agent.newSession(params as never);

      case 'sessions/list':
        return this.agent.listSessions(params as never);

      case 'sessions/prompt':
        return this.agent.prompt(params as never);

      case 'sessions/cancel':
        return this.agent.cancel(params as never);

      case 'sessions/resume':
        return this.agent.resumeSession(params as never);

      case 'sessions/load':
        return this.agent.loadSession(params as never);

      case 'sessions/fork':
        return this.agent.forkSession(params as never);

      case 'sessions/setModel':
        return this.agent.setSessionModel(params as never);

      case 'sessions/setMode':
        return this.agent.setSessionMode(params as never);

      default:
        throw new Error(`未知方法: ${method}`);
    }
  }

  /**
   * 发送响应
   */
  private sendResponse(response: JSONRPCResponse): void {
    const line = JSON.stringify(response) + '\n';
    process.stdout.write(line);
  }

  /**
   * 发送通知
   */
  private sendNotification(notification: JSONRPCNotification): void {
    const line = JSON.stringify(notification) + '\n';
    process.stdout.write(line);
  }

  // ============ ACPConnection 实现 ============

  async sendText(sessionId: string, text: string): Promise<void> {
    this.sendNotification({
      jsonrpc: '2.0',
      method: 'sessions/text',
      params: { sessionId, text },
    });
  }

  async sendReasoning(sessionId: string, reasoning: string): Promise<void> {
    this.sendNotification({
      jsonrpc: '2.0',
      method: 'sessions/reasoning',
      params: { sessionId, reasoning },
    });
  }

  async sendToolPending(sessionId: string, toolCall: ToolCallContent): Promise<void> {
    this.sendNotification({
      jsonrpc: '2.0',
      method: 'sessions/tool/pending',
      params: { sessionId, toolCall },
    });
  }

  async sendToolInProgress(sessionId: string, toolCallId: string): Promise<void> {
    this.sendNotification({
      jsonrpc: '2.0',
      method: 'sessions/tool/inProgress',
      params: { sessionId, toolCallId },
    });
  }

  async sendToolCompleted(sessionId: string, toolCallId: string, result: ContentBlock[]): Promise<void> {
    this.sendNotification({
      jsonrpc: '2.0',
      method: 'sessions/tool/completed',
      params: { sessionId, toolCallId, result },
    });
  }

  async sendToolError(sessionId: string, toolCallId: string, error: string): Promise<void> {
    this.sendNotification({
      jsonrpc: '2.0',
      method: 'sessions/tool/error',
      params: { sessionId, toolCallId, error },
    });
  }

  async sendUsage(sessionId: string, usage: Usage): Promise<void> {
    this.sendNotification({
      jsonrpc: '2.0',
      method: 'sessions/usage',
      params: { sessionId, usage },
    });
  }

  async sendComplete(sessionId: string): Promise<void> {
    this.sendNotification({
      jsonrpc: '2.0',
      method: 'sessions/complete',
      params: { sessionId },
    });
  }

  async requestPermission(sessionId: string, message: string, options: PermissionOption[]): Promise<string> {
    // 发送权限请求通知
    this.sendNotification({
      jsonrpc: '2.0',
      method: 'sessions/permission/request',
      params: { sessionId, message, options },
    });

    // 实际实现需要等待响应，这里简化返回第一个选项
    return options[0]?.id ?? 'accept';
  }

  async sendImage(sessionId: string, data: string, mimeType: string): Promise<void> {
    this.sendNotification({
      jsonrpc: '2.0',
      method: 'sessions/image',
      params: { sessionId, image: { data, mimeType } },
    });
  }

  async sendResourceLink(sessionId: string, uri: string, mimeType?: string): Promise<void> {
    this.sendNotification({
      jsonrpc: '2.0',
      method: 'sessions/resourceLink',
      params: { sessionId, uri, mimeType },
    });
  }

  async sendResource(sessionId: string, uri: string, mimeType?: string, data?: string): Promise<void> {
    this.sendNotification({
      jsonrpc: '2.0',
      method: 'sessions/resource',
      params: { sessionId, uri, mimeType, data },
    });
  }
}

/**
 * 创建 ACP Server
 */
export function createACPServer(config: ACPServerConfig): ACPServer {
  return new ACPServer(config);
}
