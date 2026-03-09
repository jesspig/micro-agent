/**
 * TCP Loopback IPC 服务
 *
 * 通过本地回环地址进行进程间通信。
 * 使用共享的 JsonRpcHandler 处理 JSON-RPC 协议。
 */

import { getLogger } from '@logtape/logtape';
import type { EventBus } from '../../runtime/infrastructure/event-bus';
import { JsonRpcHandler } from '../../runtime/infrastructure/ipc/json-rpc';
import type { IPCConfig, IPCServer } from './index';

const log = getLogger(['ipc', 'tcp']);

/** 默认端口 */
const DEFAULT_PORT = 3927;

/** TCP 服务器类型 */
type TCPServer = {
  port: number;
  stop: () => void;
};

/** Socket 类型 */
type Socket = Bun.Socket<undefined>;

export class TCPLoopbackServer implements IPCServer {
  private config: IPCConfig;
  private _eventBus: EventBus;
  private server: TCPServer | null = null;
  private clients = new Set<Socket>();
  private rpcHandler: JsonRpcHandler<Socket>;

  constructor(config: IPCConfig, eventBus: EventBus) {
    this.config = config;
    this._eventBus = eventBus;
    
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
    const port = this.config.port ?? DEFAULT_PORT;

    const listener = Bun.listen({
      hostname: '127.0.0.1',
      port,
      socket: {
        data: (_socket, data) => {
          this.rpcHandler.handleData(_socket, data);
        },
        open: (_socket) => {
          this.clients.add(_socket);
          log.info('客户端连接，当前连接数: {count}', { count: this.clients.size });
        },
        close: (_socket) => {
          this.clients.delete(_socket);
          log.info('客户端断开，当前连接数: {count}', { count: this.clients.size });
        },
        error: (_socket, error) => {
          log.error('Socket 错误: {error}', { error });
        },
      },
    });

    this.server = {
      port: (listener as unknown as { port: number }).port,
      stop: () => (listener as unknown as { stop: () => void }).stop(),
    };

    log.info('TCP Loopback 服务启动: 127.0.0.1:{port}', { port });
  }

  async stop(): Promise<void> {
    for (const client of this.clients) {
      client.end();
    }
    this.clients.clear();

    if (this.server) {
      this.server.stop();
      this.server = null;
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

  /** 获取实际端口 */
  get port(): number {
    return this.server?.port ?? 0;
  }
}
