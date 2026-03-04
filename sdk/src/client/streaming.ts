/**
 * 流式处理器
 * 
 * 处理来自 Agent Service 的流式响应。
 */

import type { StreamChunk, StreamHandler } from './types';

/**
 * 流式处理器
 */
export class StreamingProcessor {
  private buffer = '';
  private handlers: StreamHandler[] = [];

  /**
   * 添加流式处理器
   */
  onChunk(handler: StreamHandler): void {
    this.handlers.push(handler);
  }

  /**
   * 移除流式处理器
   */
  offChunk(handler: StreamHandler): void {
    const index = this.handlers.indexOf(handler);
    if (index > -1) {
      this.handlers.splice(index, 1);
    }
  }

  /**
   * 处理接收到的数据
   */
  process(data: string): StreamChunk[] {
    this.buffer += data;
    const chunks: StreamChunk[] = [];

    // 按行处理
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() ?? ''; // 保留未完成的行

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const jsonStr = line.slice(6).trim();
        if (jsonStr === '[DONE]') {
          const chunk: StreamChunk = { type: 'done', content: '', timestamp: new Date() };
          chunks.push(chunk);
          this.emit(chunk);
        } else {
          try {
            const parsed = JSON.parse(jsonStr);
            const chunk: StreamChunk = {
              type: parsed.type ?? 'text',
              content: parsed.content ?? '',
              timestamp: new Date(),
              metadata: parsed.metadata,
            };
            chunks.push(chunk);
            this.emit(chunk);
          } catch {
            // 忽略解析错误
          }
        }
      }
    }

    return chunks;
  }

  /**
   * 发送块到所有处理器
   */
  private emit(chunk: StreamChunk): void {
    for (const handler of this.handlers) {
      try {
        handler(chunk);
      } catch {
        // 忽略处理器错误
      }
    }
  }

  /**
   * 重置缓冲区
   */
  reset(): void {
    this.buffer = '';
  }

  /**
   * 创建异步迭代器
   */
  async *iterate(stream: AsyncIterable<string>): AsyncGenerator<StreamChunk> {
    for await (const data of stream) {
      const chunks = this.process(data);
      for (const chunk of chunks) {
        yield chunk;
      }
    }
  }
}
