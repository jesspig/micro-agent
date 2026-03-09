/**
 * Unix Socket IPC 服务
 *
 * 用于 Linux/macOS 系统的进程间通信。
 * 使用共享的 JsonRpcHandler 处理 JSON-RPC 协议。
 */

import { getLogger } from '@logtape/logtape';
import type { EventBus } from '../../runtime/infrastructure/event-bus';
import { JsonRpcHandler } from '../../runtime/infrastructure/ipc/json-rpc';
import type { IPCConfig, IPCServer } from './index';

const log = getLogger(['ipc', 'unix-socket']);

/** 默认 Socket 路径 */
const DEFAULT_PATH = '/tmp/micro-agent.sock';

/** Socket 类型 */
type Socket = Bun.Socket<undefined>;

export class UnixSocketServer implements IPCServer {
  private config: IPCConfig;
  private _eventBus: EventBus;
  private listener: Bun.UnixSocketListener<undefined> | null = null;
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
    const path = this.config.path ?? DEFAULT_PATH;

    this.listener = Bun.listen({
      unix: path,
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

    log.info('Unix Socket 服务启动: {path}', { path });
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
