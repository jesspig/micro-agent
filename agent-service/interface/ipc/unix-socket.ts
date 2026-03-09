/**
 * Unix Socket IPC 服务
 *
 * 用于 Linux/macOS 系统的进程间通信。
 * 使用共享的 JsonRpcHandler 处理 JSON-RPC 协议。
 */

import type { EventBus } from '../../runtime/infrastructure/event-bus';
import { JsonRpcHandler } from '../../runtime/infrastructure/ipc/json-rpc';
import type { IPCConfig, IPCServer } from './index';

/** 默认 Socket 路径 */
const DEFAULT_PATH = '/tmp/micro-agent.sock';

/** Socket 类型 */
type Socket = Bun.Socket<undefined>;

export class UnixSocketServer implements IPCServer {
  private config: IPCConfig;
  private eventBus: EventBus;
  private listener: Bun.UnixSocketListener<undefined> | null = null;
  private clients = new Set<Socket>();
  private rpcHandler: JsonRpcHandler<Socket>;

  constructor(config: IPCConfig, eventBus: EventBus) {
    this.config = config;
    this.eventBus = eventBus;

    // 创建 JSON-RPC 处理器，传入消息发送器
    this.rpcHandler = new JsonRpcHandler(eventBus, {
      sendToSocket: (socket, data) => socket.write(data),
    });
  }

  /**
   * 注册方法处理器
   */
  registerMethod(method: string, handler: (params: unknown, context: unknown) => Promise<unknown> | unknown): void {
    this.rpcHandler.registerMethod(method, handler as Parameters<typeof this.rpcHandler.registerMethod>[1]);
  }

  /**
   * 注册流式方法处理器
   */
  registerStreamMethod(method: string, handler: (params: unknown, context: unknown) => Promise<void>): void {
    this.rpcHandler.registerStreamMethod(method, handler as Parameters<typeof this.rpcHandler.registerStreamMethod>[1]);
  }

  async start(): Promise<void> {
    const path = this.config.path ?? DEFAULT_PATH;

    this.listener = Bun.listen({
      unix: path,
      socket: {
        data: (socket, data) => {
          this.rpcHandler.handleData(socket, data);
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

    if (this.listener) {
      this.listener.stop();
      this.listener = null;
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
}
