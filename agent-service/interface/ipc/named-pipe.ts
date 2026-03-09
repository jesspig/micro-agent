/**
 * Named Pipe IPC 服务
 * 
 * 用于 Windows 系统的进程间通信。
 */

import { getLogger } from '@logtape/logtape';
import type { EventBus } from '../../runtime/infrastructure/event-bus';
import type { IPCConfig, IPCServer } from './index';

const log = getLogger(['ipc', 'named-pipe']);

export class NamedPipeServer implements IPCServer {
  private config: IPCConfig;
  private eventBus: EventBus;
  private server: Bun.Server<undefined> | null = null;

  constructor(config: IPCConfig, eventBus: EventBus) {
    this.config = config;
    this.eventBus = eventBus;
  }

  async start(): Promise<void> {
    const pipeName = this.config.path ?? '\\.\pipe\micro-agent';

    // Windows Named Pipe 通过 TCP 模拟
    this.server = Bun.serve({
      port: 0, // 随机端口
      hostname: '127.0.0.1',
      fetch: async (request) => {
        const body = await request.text();
        return this.handleRequest(body);
      },
    });

    log.info('Named Pipe 服务启动: {pipeName}', { pipeName });
  }

  async stop(): Promise<void> {
    if (this.server) {
      this.server.stop();
      this.server = null;
    }
  }

  send(message: unknown): void {
    // Named Pipe 是点对点通信
    log.debug('发送消息: {message}', { message: JSON.stringify(message) });
  }

  broadcast(message: unknown): void {
    this.send(message);
  }

  private handleRequest(body: string): Response {
    try {
      const message = JSON.parse(body);
      
      this.eventBus.emit('ipc:message', {
        message,
        reply: (response: unknown) => {
          return Response.json(response);
        },
      });

      return Response.json({ success: true });
    } catch (error) {
      return Response.json(
        { success: false, error: '解析消息失败' },
        { status: 400 }
      );
    }
  }
}
