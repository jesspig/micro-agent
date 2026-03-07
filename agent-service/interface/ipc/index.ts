/**
 * IPC 接口层
 * 
 * 提供进程间通信能力，是 Agent Service 的主要接口。
 */

import type { EventBus } from '../../runtime/infrastructure/event-bus';

export interface IPCConfig {
  /** IPC 类型 */
  type: 'unix-socket' | 'named-pipe' | 'stdio' | 'tcp-loopback';
  /** 路径（Unix Socket 或 Named Pipe） */
  path?: string;
  /** 端口（TCP Loopback） */
  port?: number;
}

export interface IPCServer {
  /** 启动服务 */
  start(): Promise<void>;
  /** 停止服务 */
  stop(): Promise<void>;
  /** 发送消息 */
  send(message: unknown): void;
  /** 广播消息 */
  broadcast(message: unknown): void;
  /** 注册方法处理器（可选） */
  registerMethod?(method: string, handler: (params: unknown, context: unknown) => Promise<unknown> | unknown): void;
  /** 注册流式方法处理器（可选） */
  registerStreamMethod?(method: string, handler: (params: unknown, context: unknown) => Promise<void>): void;
}

/**
 * 创建 IPC Server
 */
export async function createIPCServer(
  config: IPCConfig,
  eventBus: EventBus
): Promise<IPCServer> {
  switch (config.type) {
    case 'unix-socket':
      const { UnixSocketServer } = await import('./unix-socket');
      return new UnixSocketServer(config, eventBus);
    case 'named-pipe':
      const { NamedPipeServer } = await import('./named-pipe');
      return new NamedPipeServer(config, eventBus);
    case 'stdio':
      const { StdioServer } = await import('./stdio');
      return new StdioServer(eventBus);
    case 'tcp-loopback':
      const { TCPLoopbackServer } = await import('./tcp-loopback');
      return new TCPLoopbackServer(config, eventBus);
    default:
      throw new Error(`不支持的 IPC 类型: ${config.type}`);
  }
}
