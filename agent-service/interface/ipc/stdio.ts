/**
 * Stdio IPC 服务
 * 
 * 通过标准输入/输出进行进程间通信。
 */

import { getLogger } from '@logtape/logtape';
import type { EventBus } from '../../runtime/infrastructure/event-bus';
import type { IPCConfig, IPCServer } from './index';

const log = getLogger(['ipc', 'stdio']);

export class StdioServer implements IPCServer {
  private _config: IPCConfig;
  private _eventBus: EventBus;
  private buffer = '';
  private running = false;

  constructor(config: IPCConfig, eventBus: EventBus) {
    this._config = config;
    this._eventBus = eventBus;
  }

  async start(): Promise<void> {
    this.running = true;

    // 监听 stdin
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (data: string) => {
      this.handleData(data);
    });

    process.stdin.on('end', () => {
      this.running = false;
    });

    log.info('Stdio IPC 服务启动');
  }

  async stop(): Promise<void> {
    this.running = false;
  }

  send(message: unknown): void {
    process.stdout.write(JSON.stringify(message) + '\n');
  }

  broadcast(message: unknown): void {
    this.send(message);
  }

  private handleData(data: string): void {
    this.buffer += data;
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const message = JSON.parse(line);
        this._eventBus.emit('ipc:message', {
          message,
          reply: (response: unknown) => {
            this.send(response);
          },
        });
      } catch (error) {
        log.error('解析消息失败: {error}', { error });
      }
    }
  }
}
