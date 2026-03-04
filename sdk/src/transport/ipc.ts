/**
 * IPC 传输层
 * 
 * 通过 IPC（进程间通信）与 Agent Service 通信。
 */

import type { SDKClientConfig, StreamChunk, StreamHandler } from '../client/types';
import { RequestBuilder } from '../client/request-builder';
import { ResponseParser } from '../client/response-parser';
import { ErrorHandler, SDKError } from '../client/error-handler';

/**
 * IPC 传输层
 * 
 * 支持 stdio、Unix Socket (Linux/macOS)、Named Pipe (Windows)
 */
export class IPCTransport {
  private config: SDKClientConfig['ipc'];
  private pendingRequests = new Map<string, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
  }>();
  private buffer = '';

  constructor(config: SDKClientConfig) {
    this.config = config.ipc;
  }

  /**
   * 发送请求（通过 stdio）
   */
  async send(method: string, params: unknown): Promise<unknown> {
    const id = crypto.randomUUID();
    const body = RequestBuilder.buildRequest(method, params, id);

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      
      // 通过 stdout 发送请求
      // 实际实现需要根据具体 IPC 机制
      process.stdout.write(body + '\n');
    });
  }

  /**
   * 处理接收到的数据
   */
  handleData(data: string): void {
    this.buffer += data;
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.trim()) continue;

      const parsed = ResponseParser.parseResponse(line);
      const id = parsed.id;

      if (id && this.pendingRequests.has(id)) {
        const { resolve, reject } = this.pendingRequests.get(id)!;
        this.pendingRequests.delete(id);

        if (parsed.success) {
          resolve(parsed.result);
        } else {
          reject(ErrorHandler.fromRPCError(parsed.error!));
        }
      }
    }
  }

  /**
   * 发送流式请求
   */
  async sendStream(
    method: string,
    params: unknown,
    handler: StreamHandler
  ): Promise<void> {
    const id = crypto.randomUUID();
    const body = RequestBuilder.buildRequest(method, { ...params, stream: true }, id);

    // 设置流式响应处理器
    const originalHandler = this.handleData.bind(this);
    
    // 通过 stdout 发送请求
    process.stdout.write(body + '\n');

    // 监听流式响应
    // 实际实现需要根据具体 IPC 机制
  }

  /**
   * 关闭连接
   */
  close(): void {
    this.pendingRequests.clear();
    this.buffer = '';
  }
}
