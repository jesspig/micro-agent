/**
 * IPC 传输层 - 使用 Bun 原生 IPC
 * 
 * 通过 Bun.spawn 的 IPC 机制与 Agent Service 通信。
 * 完全跨平台，无需端口或 socket 文件。
 */

import { spawn, type Subprocess } from 'bun';
import type { SDKClientConfig, StreamChunk, StreamHandler } from '../client/types';
import { RequestBuilder } from '../client/request-builder';
import { ResponseParser } from '../client/response-parser';
import { ErrorHandler, SDKError } from '../client/error-handler';

/**
 * IPC 传输层配置
 */
export interface IPCTransportConfig {
  /** Agent Service 路径 */
  servicePath?: string;
  /** 连接超时（毫秒） */
  timeout?: number;
  /** 序列化方式 */
  serialization?: 'advanced' | 'json';
}

/**
 * IPC 传输层 - Bun 原生 IPC
 */
export class IPCTransport {
  private config: IPCTransportConfig;
  private subprocess: Subprocess | null = null;
  private pendingRequests = new Map<string, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
  }>();
  private streamHandlers = new Map<string, StreamHandler>();
  private _isConnected = false;

  constructor(config: SDKClientConfig) {
    this.config = {
      servicePath: config.ipc?.servicePath,
      timeout: config.ipc?.timeout ?? 30000,
      serialization: 'json', // 使用 JSON 序列化，更兼容
      ...config.ipc,
    };
  }

  /**
   * 连接到 Agent Service（启动子进程）
   */
  async connect(): Promise<void> {
    if (this._isConnected) {
      return;
    }

    const servicePath = this.config.servicePath ?? this.findServicePath();

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new SDKError('IPC_TIMEOUT', `启动 Agent Service 超时`));
      }, this.config.timeout);

      try {
        this.subprocess = spawn({
          cmd: ['bun', 'run', servicePath],
          ipc: (message, subprocess) => {
            this.handleMessage(message);
          },
          serialization: this.config.serialization,
          stdout: 'pipe',
          stderr: 'pipe',
          env: {
            ...process.env,
            BUN_IPC: '1',
          },
        });

        // 转发子进程输出
        this.forwardOutput(this.subprocess.stdout, 'stdout');
        this.forwardOutput(this.subprocess.stderr, 'stderr');

        // 监听进程退出
        this.subprocess.exited.then(() => {
          this.handleDisconnect();
        }).catch(() => {
          this.handleDisconnect();
        });

        // 等待服务就绪
        this.waitForReady(timeoutId, resolve, reject);
      } catch (error) {
        clearTimeout(timeoutId);
        reject(new SDKError('IPC_CONNECT_FAILED', `启动失败: ${(error as Error).message}`));
      }
    });
  }

  /**
   * 等待服务就绪
   */
  private waitForReady(
    timeoutId: Timer,
    resolve: () => void,
    reject: (error: Error) => void
  ): void {
    // 发送 ping 等待 pong
    const id = crypto.randomUUID();
    
    this.pendingRequests.set(id, {
      resolve: () => {
        clearTimeout(timeoutId);
        this._isConnected = true;
        resolve();
      },
      reject: (error) => {
        clearTimeout(timeoutId);
        reject(error);
      },
    });

    // 发送就绪检查
    this.subprocess!.send(RequestBuilder.buildRequest('ping', {}, id));

    // 超时后如果没有响应，也认为成功（向后兼容）
    setTimeout(() => {
      if (this.pendingRequests.has(id)) {
        this.pendingRequests.delete(id);
        clearTimeout(timeoutId);
        this._isConnected = true;
        resolve();
      }
    }, 2000);
  }

  /**
   * 查找 Agent Service 路径
   */
  private findServicePath(): string {
    const { cwd } = process;
    
    // 尝试常见路径（使用绝对路径）
    const possiblePaths = [
      // 相对于当前工作目录
      `${cwd}/agent-service/src/index.ts`,
      `${cwd}/src/index.ts`,
      // 相对于 SDK 包位置（向上查找）
      `${import.meta.dir}/../../../agent-service/src/index.ts`,
    ];

    for (const path of possiblePaths) {
      try {
        const file = Bun.file(path);
        if (file.size > 0) {
          return path;
        }
      } catch {
        continue;
      }
    }

    // 默认返回相对于工作目录的路径
    return `${cwd}/agent-service/src/index.ts`;
  }

  /**
   * 转发子进程输出
   * 
   * 如果配置了 logHandler，则调用处理器；否则忽略输出。
   * 支持多行日志和缓冲不完整的行。
   */
  private forwardOutput(stream: ReadableStream<Uint8Array> | null, type: 'stdout' | 'stderr'): void {
    if (!stream) return;

    const reader = stream.getReader();
    const decoder = new TextDecoder();
    const logHandler = this.config.logHandler;
    let buffer = '';

    (async () => {
      while (true) {
        try {
          const { done, value } = await reader.read();
          if (done) {
            // 处理缓冲区剩余内容
            if (buffer.trim() && logHandler) {
              logHandler(buffer, type);
            }
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          
          // 按行分割处理
          const lines = buffer.split('\n');
          // 保留最后一行（可能不完整）
          buffer = lines.pop() || '';
          
          // 处理完整的行
          for (const line of lines) {
            if (line.trim() && logHandler) {
              logHandler(line, type);
            }
          }
        } catch {
          break;
        }
      }
    })().catch(() => {});
  }

  /**
   * 断开连接
   */
  async disconnect(): Promise<void> {
    if (this.subprocess) {
      try {
        this.subprocess.kill();
      } catch (e) {
        // Ignore errors on disconnect
      }
      this.subprocess = null;
    }
    this._isConnected = false;
    this.pendingRequests.clear();
    this.streamHandlers.clear();
  }

  /**
   * 发送请求
   */
  async send(method: string, params: unknown): Promise<unknown> {
    if (!this._isConnected || !this.subprocess) {
      throw new SDKError('IPC_DISCONNECTED', '未连接到 Agent Service');
    }

    const id = crypto.randomUUID();
    const body = RequestBuilder.buildRequest(method, params, id);

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new SDKError('IPC_TIMEOUT', `请求超时: ${method}`));
      }, this.config.timeout);

      this.pendingRequests.set(id, {
        resolve: (value) => {
          clearTimeout(timeoutId);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timeoutId);
          reject(error);
        },
      });

      try {
        this.subprocess!.send(body);
      } catch (error) {
        clearTimeout(timeoutId);
        this.pendingRequests.delete(id);
        reject(new SDKError('IPC_ERROR', `发送失败: ${(error as Error).message}`));
      }
    });
  }

  /**
   * 发送流式请求
   */
  async sendStream(
    method: string,
    params: unknown,
    handler: StreamHandler
  ): Promise<void> {
    if (!this._isConnected || !this.subprocess) {
      throw new SDKError('IPC_DISCONNECTED', '未连接到 Agent Service');
    }

    const id = crypto.randomUUID();
    const body = RequestBuilder.buildRequest(method, { ...params, stream: true }, id);

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.streamHandlers.delete(id);
        reject(new SDKError('IPC_TIMEOUT', `流式请求超时: ${method}`));
      }, this.config.timeout! * 3);

      this.streamHandlers.set(id, (chunk) => {
        handler(chunk);
        if (chunk.type === 'done' || chunk.type === 'error') {
          clearTimeout(timeoutId);
          this.streamHandlers.delete(id);
          if (chunk.type === 'done') {
            resolve();
          } else {
            reject(new Error(chunk.content));
          }
        }
      });

      try {
        this.subprocess!.send(body);
      } catch (error) {
        clearTimeout(timeoutId);
        this.streamHandlers.delete(id);
        reject(new SDKError('IPC_ERROR', `发送失败: ${(error as Error).message}`));
      }
    });
  }

  /**
   * 处理接收到的消息
   */
  private handleMessage(message: unknown): void {
    try {
      // 如果是字符串，解析为 JSON
      const data = typeof message === 'string' ? JSON.parse(message) : message;
      
      const parsed = ResponseParser.parseResponse(JSON.stringify(data));
      const id = parsed.id;

      if (!id) return;

      // 检查是否为流式响应
      if (parsed.method === 'stream' && this.streamHandlers.has(id)) {
        const handler = this.streamHandlers.get(id)!;
        const chunk = this.parseStreamChunk(parsed.result);
        handler(chunk);
        return;
      }

      // 普通响应
      if (this.pendingRequests.has(id)) {
        const { resolve, reject } = this.pendingRequests.get(id)!;
        this.pendingRequests.delete(id);

        if (parsed.success) {
          resolve(parsed.result);
        } else {
          reject(ErrorHandler.fromRPCError(parsed.error!));
        }
      }
    } catch (error) {
      console.error('IPC 消息解析错误:', error);
    }
  }

  /**
   * 解析流式响应块
   */
  private parseStreamChunk(data: unknown): StreamChunk {
    const chunk = data as Record<string, unknown>;
    
    // 处理 done 标志
    if (chunk.done === true) {
      return {
        type: 'done',
        content: '',
        timestamp: new Date(),
      };
    }

    // 处理错误
    if (chunk.error) {
      return {
        type: 'error',
        content: String(chunk.error),
        timestamp: new Date(),
      };
    }

    // 处理普通文本块
    return {
      type: (chunk.type as StreamChunk['type']) ?? 'text',
      content: (chunk.content as string) ?? (chunk.delta as string) ?? '',
      timestamp: new Date(),
      metadata: chunk.metadata as Record<string, unknown> | undefined,
    };
  }

  /**
   * 处理断开连接
   */
  private handleDisconnect(): void {
    this._isConnected = false;
    this.subprocess = null;

    // 拒绝所有待处理请求
    for (const [id, { reject }] of this.pendingRequests) {
      reject(new SDKError('IPC_DISCONNECTED', '连接已断开'));
    }
    this.pendingRequests.clear();

    // 清理流式处理器
    for (const [id, handler] of this.streamHandlers) {
      handler({
        type: 'error',
        content: '连接已断开',
        timestamp: new Date(),
      });
    }
    this.streamHandlers.clear();
  }

  /**
   * 关闭传输层
   */
  close(): void {
    this.disconnect();
  }

  /**
   * 检查是否已连接
   */
  get connected(): boolean {
    return this._isConnected;
  }
}
