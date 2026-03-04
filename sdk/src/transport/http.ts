/**
 * HTTP 传输层
 * 
 * 通过 HTTP 与 Agent Service 通信。
 */

import type { SDKClientConfig, StreamChunk, StreamHandler } from '../client/types';
import { RequestBuilder } from '../client/request-builder';
import { ResponseParser } from '../client/response-parser';
import { ErrorHandler, SDKError } from '../client/error-handler';

/**
 * HTTP 传输层
 */
export class HTTPTransport {
  private baseUrl: string;
  private timeout: number;
  private headers: Record<string, string>;

  constructor(config: SDKClientConfig) {
    this.baseUrl = config.http?.baseUrl ?? 'http://localhost:3000';
    this.timeout = config.http?.timeout ?? 30000;
    this.headers = config.http?.headers ?? {};
  }

  /**
   * 发送请求
   */
  async send(method: string, params: unknown): Promise<unknown> {
    const body = RequestBuilder.buildRequest(method, params);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.baseUrl}/rpc`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.headers,
        },
        body,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw ErrorHandler.connectionError(`HTTP 错误: ${response.status}`);
      }

      const data = await response.text();
      const parsed = ResponseParser.parseResponse(data);

      if (!parsed.success) {
        throw ErrorHandler.fromRPCError(parsed.error!);
      }

      return parsed.result;
    } catch (error) {
      if (error instanceof SDKError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw ErrorHandler.timeoutError(method, this.timeout);
      }
      throw ErrorHandler.connectionError(
        error instanceof Error ? error.message : '未知错误'
      );
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
    const body = RequestBuilder.buildRequest(method, { ...params, stream: true });

    const response = await fetch(`${this.baseUrl}/rpc`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        ...this.headers,
      },
      body,
    });

    if (!response.ok) {
      throw ErrorHandler.connectionError(`HTTP 错误: ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw ErrorHandler.connectionError('无法获取响应流');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const chunk = ResponseParser.parseStreamChunk(line);
          if (chunk) {
            handler(chunk);
          }
        }
      }
    }
  }

  /**
   * 关闭连接
   */
  close(): void {
    // HTTP 无需关闭
  }
}
