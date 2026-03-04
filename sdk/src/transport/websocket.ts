/**
 * WebSocket 传输层
 * 
 * 通过 WebSocket 与 Agent Service 通信。
 */

import type { SDKClientConfig, StreamChunk, StreamHandler } from '../client/types';
import { RequestBuilder } from '../client/request-builder';
import { ResponseParser } from '../client/response-parser';
import { ErrorHandler, SDKError } from '../client/error-handler';

/**
 * WebSocket 传输层
 */
export class WebSocketTransport {
  private url: string;
  private reconnectInterval: number;
  private maxReconnectAttempts: number;
  private ws: WebSocket | null = null;
  private pendingRequests = new Map<string, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
  }>();
  private reconnectAttempts = 0;

  constructor(config: SDKClientConfig) {
    this.url = config.websocket?.url ?? 'ws://localhost:3000/ws';
    this.reconnectInterval = config.websocket?.reconnectInterval ?? 1000;
    this.maxReconnectAttempts = config.websocket?.maxReconnectAttempts ?? 5;
  }

  /**
   * 连接 WebSocket
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        resolve();
      };

      this.ws.onerror = (error) => {
        reject(ErrorHandler.connectionError('WebSocket 连接失败'));
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };

      this.ws.onclose = () => {
        this.handleClose();
      };
    });
  }

  /**
   * 处理接收到的消息
   */
  private handleMessage(data: string): void {
    const parsed = ResponseParser.parseResponse(data);
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

  /**
   * 处理连接关闭
   */
  private handleClose(): void {
    // 拒绝所有待处理请求
    for (const [id, { reject }] of this.pendingRequests) {
      reject(ErrorHandler.connectionError('连接已关闭'));
      this.pendingRequests.delete(id);
    }

    // 尝试重连
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      setTimeout(() => this.connect(), this.reconnectInterval);
    }
  }

  /**
   * 发送请求
   */
  async send(method: string, params: unknown): Promise<unknown> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      await this.connect();
    }

    const id = crypto.randomUUID();
    const body = RequestBuilder.buildRequest(method, params, id);

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      this.ws!.send(body);
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
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      await this.connect();
    }

    const id = crypto.randomUUID();
    const body = RequestBuilder.buildRequest(method, { ...params, stream: true }, id);

    // 监听流式响应
    const originalHandler = this.ws.onmessage;
    this.ws.onmessage = (event) => {
      const data = event.data;
      
      // 尝试解析为流式块
      try {
        const parsed = JSON.parse(data);
        if (parsed.type && parsed.content !== undefined) {
          const chunk: StreamChunk = {
            type: parsed.type,
            content: parsed.content,
            timestamp: new Date(),
            metadata: parsed.metadata,
          };
          handler(chunk);
          
          if (parsed.type === 'done') {
            this.ws!.onmessage = originalHandler;
          }
          return;
        }
      } catch {
        // 不是流式响应，按普通消息处理
      }

      // 调用原始处理器
      if (originalHandler) {
        originalHandler(event);
      }
    };

    this.ws.send(body);
  }

  /**
   * 关闭连接
   */
  close(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.pendingRequests.clear();
  }
}
