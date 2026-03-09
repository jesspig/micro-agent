/**
 * JSON-RPC 处理器
 *
 * 提供 JSON-RPC 2.0 协议的通用处理逻辑，被各 IPC 实现共享使用。
 */

import type { EventBus } from '../../event-bus';
import type {
  JSONRPCRequest,
  JSONRPCResponse,
  JSONRPCStreamEvent,
  StreamEventParams,
  MethodHandler,
  StreamMethodHandler,
} from './types';
import { JSONRPC_ERROR_CODES } from './types';

/** 消息发送器接口 */
export interface MessageSender<TSocket> {
  sendToSocket(socket: TSocket, data: string): void;
}

/**
 * JSON-RPC 处理器
 *
 * 封装 JSON-RPC 的核心处理逻辑，支持普通方法和流式方法。
 */
export class JsonRpcHandler<TSocket = Bun.Socket<undefined>> {
  private methodHandlers = new Map<string, MethodHandler<TSocket>>();
  private streamHandlers = new Map<string, StreamMethodHandler<TSocket>>();
  private eventBus: EventBus;
  private sender: MessageSender<TSocket>;

  constructor(eventBus: EventBus, sender: MessageSender<TSocket>) {
    this.eventBus = eventBus;
    this.sender = sender;
    this.setupDefaultHandlers();
  }

  /**
   * 设置默认方法处理器
   */
  private setupDefaultHandlers(): void {
    // 状态查询
    this.methodHandlers.set('status', async () => {
      return {
        version: '1.0.0',
        uptime: process.uptime(),
        activeSessions: 0,
      };
    });

    // 关闭服务
    this.methodHandlers.set('shutdown', async () => {
      this.eventBus.emit('ipc:shutdown', {});
      return { acknowledged: true };
    });
  }

  /**
   * 注册方法处理器
   */
  registerMethod(method: string, handler: MethodHandler<TSocket>): void {
    this.methodHandlers.set(method, handler);
  }

  /**
   * 注册流式方法处理器
   */
  registerStreamMethod(method: string, handler: StreamMethodHandler<TSocket>): void {
    this.streamHandlers.set(method, handler);
  }

  /**
   * 处理接收到的原始数据
   */
  handleData(socket: TSocket, data: Buffer): void {
    const text = data.toString();
    const lines = text.split('\n');

    for (const line of lines) {
      if (!line.trim()) continue;
      this.processLine(socket, line);
    }
  }

  /**
   * 处理单行数据
   */
  private processLine(socket: TSocket, line: string): void {
    let request: JSONRPCRequest;

    try {
      request = JSON.parse(line);
    } catch {
      this.sendError(socket, '', JSONRPC_ERROR_CODES.PARSE_ERROR, 'Parse error');
      return;
    }

    // 验证 JSON-RPC 格式
    if (request.jsonrpc !== '2.0' || !request.method) {
      this.sendError(socket, request.id ?? '', JSONRPC_ERROR_CODES.INVALID_REQUEST, 'Invalid Request');
      return;
    }

    // 处理请求
    this.handleRequest(socket, request).catch((error) => {
      this.sendError(socket, request.id, JSONRPC_ERROR_CODES.INTERNAL_ERROR, 'Internal error', error.message);
    });
  }

  /**
   * 处理 JSON-RPC 请求
   */
  private async handleRequest(socket: TSocket, request: JSONRPCRequest): Promise<void> {
    const { id, method, params } = request;

    // 检查是否为流式方法
    if (this.streamHandlers.has(method)) {
      const handler = this.streamHandlers.get(method)!;

      await handler(params, {
        socket,
        requestId: id,
        sendChunk: (chunk: StreamEventParams) => {
          this.sendStreamEvent(socket, id, chunk);
        },
      });

      return;
    }

    // 普通方法
    if (!this.methodHandlers.has(method)) {
      this.sendError(socket, id, JSONRPC_ERROR_CODES.METHOD_NOT_FOUND, 'Method not found');
      return;
    }

    const handler = this.methodHandlers.get(method)!;

    try {
      const result = await handler(params, { socket, requestId: id });
      this.sendResult(socket, id, result);
    } catch (error) {
      const err = error as Error;
      this.sendError(socket, id, JSONRPC_ERROR_CODES.AGENT_ERROR, 'Agent error', err.message);
    }
  }

  /**
   * 发送成功响应
   */
  private sendResult(socket: TSocket, id: string, result: unknown): void {
    const response: JSONRPCResponse = {
      jsonrpc: '2.0',
      id,
      result,
    };
    this.sender.sendToSocket(socket, JSON.stringify(response) + '\n');
  }

  /**
   * 发送错误响应
   */
  sendError(
    socket: TSocket,
    id: string,
    code: number,
    message: string,
    data?: unknown
  ): void {
    const response: JSONRPCResponse = {
      jsonrpc: '2.0',
      id,
      error: { code, message, data },
    };
    this.sender.sendToSocket(socket, JSON.stringify(response) + '\n');
  }

  /**
   * 发送流式事件
   */
  private sendStreamEvent(
    socket: TSocket,
    id: string,
    params: StreamEventParams
  ): void {
    const event: JSONRPCStreamEvent = {
      jsonrpc: '2.0',
      id,
      method: 'stream',
      params,
    };
    this.sender.sendToSocket(socket, JSON.stringify(event) + '\n');
  }
}
