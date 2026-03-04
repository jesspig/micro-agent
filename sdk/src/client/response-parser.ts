/**
 * 响应解析器
 * 
 * 解析 Agent Service 返回的响应。
 */

import type { StreamChunk } from './types';

/**
 * 响应解析器
 */
export class ResponseParser {
  /**
   * 解析 JSON-RPC 响应
   */
  static parseResponse(data: string): {
    success: boolean;
    result?: unknown;
    error?: { code: number; message: string };
    id?: string;
  } {
    try {
      const response = JSON.parse(data);
      
      if (response.error) {
        return {
          success: false,
          error: response.error,
          id: response.id,
        };
      }

      return {
        success: true,
        result: response.result,
        id: response.id,
      };
    } catch (e) {
      return {
        success: false,
        error: {
          code: -32700,
          message: `解析错误: ${e instanceof Error ? e.message : '未知错误'}`,
        },
      };
    }
  }

  /**
   * 解析流式响应块
   */
  static parseStreamChunk(data: string): StreamChunk | null {
    try {
      // SSE 格式: data: {...}
      if (data.startsWith('data: ')) {
        const jsonStr = data.slice(6).trim();
        if (jsonStr === '[DONE]') {
          return { type: 'done', content: '', timestamp: new Date() };
        }
        const parsed = JSON.parse(jsonStr);
        return {
          type: parsed.type ?? 'text',
          content: parsed.content ?? '',
          timestamp: new Date(),
          metadata: parsed.metadata,
        };
      }

      // 直接 JSON 格式
      const parsed = JSON.parse(data);
      return {
        type: parsed.type ?? 'text',
        content: parsed.content ?? '',
        timestamp: new Date(),
        metadata: parsed.metadata,
      };
    } catch {
      return null;
    }
  }

  /**
   * 解析多行 SSE 响应
   */
  static parseSSE(text: string): StreamChunk[] {
    const lines = text.split('\n');
    const chunks: StreamChunk[] = [];

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const chunk = this.parseStreamChunk(line);
        if (chunk) {
          chunks.push(chunk);
        }
      }
    }

    return chunks;
  }
}
