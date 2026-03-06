/**
 * Unix Socket IPC 服务
 * 
 * 用于 Linux/macOS 系统的进程间通信。
 * 实现 JSON-RPC 2.0 协议。
 */

import type { EventBus } from '../../runtime/infrastructure/event-bus';
import type { IPCConfig, IPCServer } from './index';

/** JSON-RPC 请求 */
interface JSONRPCRequest {
  jsonrpc: '2.0';
  id: string;
  method: string;
  params: unknown;
}

/** JSON-RPC 响应 */
interface JSONRPCResponse {
  jsonrpc: '2.0';
  id: string;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

/** JSON-RPC 流式事件 */
interface JSONRPCStreamEvent {
  jsonrpc: '2.0';
  id: string;
  method: 'stream';
  params: {
    delta?: string;
    done: boolean;
    toolCalls?: Array<{
      id: string;
      name: string;
      arguments: Record<string, unknown>;
    }>;
  };
}

/** 方法处理器 */
type MethodHandler = (
  params: unknown,
  context: { socket: Bun.Socket; requestId: string }
) => Promise<unknown> | unknown;

/** 流式方法处理器 */
type StreamMethodHandler = (
  params: unknown,
  context: { socket: Bun.Socket; requestId: string; sendChunk: (chunk: JSONRPCStreamEvent['params']) => void }
) => Promise<void>;

export class UnixSocketServer implements IPCServer {
  private config: IPCConfig;
  private eventBus: EventBus;
  private socket: Bun.Socket | null = null;
  private clients = new Set<Bun.Socket>();
  private methodHandlers = new Map<string, MethodHandler>();
  private streamHandlers = new Map<string, StreamMethodHandler>();

  constructor(config: IPCConfig, eventBus: EventBus) {
    this.config = config;
    this.eventBus = eventBus;
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
        activeSessions: 0, // TODO: 从会话管理器获取
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
  registerMethod(method: string, handler: MethodHandler): void {
    this.methodHandlers.set(method, handler);
  }

  /**
   * 注册流式方法处理器
   */
  registerStreamMethod(method: string, handler: StreamMethodHandler): void {
    this.streamHandlers.set(method, handler);
  }

  async start(): Promise<void> {
    const path = this.config.path ?? '/tmp/micro-agent.sock';

    this.socket = Bun.listen({
      unix: path,
      socket: {
        data: (socket, data) => {
          this.handleData(socket, data);
        },
        open: (socket) => {
          this.clients.add(socket);
          console.log(`[IPC] 客户端连接，当前连接数: ${this.clients.size}`);
        },
        close: (socket) => {
          this.clients.delete(socket);
          console.log(`[IPC] 客户端断开，当前连接数: ${this.clients.size}`);
        },
        error: (socket, error) => {
          console.error('[IPC] Socket 错误:', error);
        },
      },
    });

    console.log(`[IPC] Unix Socket 服务启动: ${path}`);
  }

  async stop(): Promise<void> {
    for (const client of this.clients) {
      client.end();
    }
    this.clients.clear();

    if (this.socket) {
      this.socket.stop();
      this.socket = null;
    }
  }

  send(message: unknown): void {
    const data = JSON.stringify(message) + '\n';
    for (const client of this.clients) {
      client.write(data);
    }
  }

  broadcast(message: unknown): void {
    this.send(message);
  }

  /**
   * 处理接收到的数据
   */
  private handleData(socket: Bun.Socket, data: Buffer): void {
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
  private processLine(socket: Bun.Socket, line: string): void {
    let request: JSONRPCRequest;

    try {
      request = JSON.parse(line);
    } catch {
      this.sendError(socket, '', -32700, 'Parse error');
      return;
    }

    // 验证 JSON-RPC 格式
    if (request.jsonrpc !== '2.0' || !request.method) {
      this.sendError(socket, request.id ?? '', -32600, 'Invalid Request');
      return;
    }

    // 处理请求
    this.handleRequest(socket, request).catch((error) => {
      this.sendError(socket, request.id, -32603, 'Internal error', error.message);
    });
  }

  /**
   * 处理 JSON-RPC 请求
   */
  private async handleRequest(socket: Bun.Socket, request: JSONRPCRequest): Promise<void> {
    const { id, method, params } = request;

    // 检查是否为流式方法
    if (this.streamHandlers.has(method)) {
      const handler = this.streamHandlers.get(method)!;
      
      await handler(params, {
        socket,
        requestId: id,
        sendChunk: (chunk) => {
          this.sendStreamEvent(socket, id, chunk);
        },
      });
      
      return;
    }

    // 普通方法
    if (!this.methodHandlers.has(method)) {
      this.sendError(socket, id, -32601, 'Method not found');
      return;
    }

    const handler = this.methodHandlers.get(method)!;
    
    try {
      const result = await handler(params, { socket, requestId: id });
      this.sendResult(socket, id, result);
    } catch (error) {
      const err = error as Error;
      this.sendError(socket, id, -32001, 'Agent error', err.message);
    }
  }

  /**
   * 发送成功响应
   */
  private sendResult(socket: Bun.Socket, id: string, result: unknown): void {
    const response: JSONRPCResponse = {
      jsonrpc: '2.0',
      id,
      result,
    };
    socket.write(JSON.stringify(response) + '\n');
  }

  /**
   * 发送错误响应
   */
  private sendError(
    socket: Bun.Socket,
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
    socket.write(JSON.stringify(response) + '\n');
  }

  /**
   * 发送流式事件
   */
  private sendStreamEvent(
    socket: Bun.Socket,
    id: string,
    params: JSONRPCStreamEvent['params']
  ): void {
    const event: JSONRPCStreamEvent = {
      jsonrpc: '2.0',
      id,
      method: 'stream',
      params,
    };
    socket.write(JSON.stringify(event) + '\n');
  }
}