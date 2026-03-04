/**
 * 聊天 API
 */

import type { StreamHandler, LLMMessage } from '../client/types';

interface Transport {
  send(method: string, params: unknown): Promise<unknown>;
  sendStream?(method: string, params: unknown, handler: StreamHandler): Promise<void>;
}

export interface ChatOptions {
  /** 是否流式响应 */
  stream?: boolean;
  /** 流式处理器 */
  onChunk?: StreamHandler;
}

/**
 * 聊天 API
 */
export class ChatAPI {
  constructor(private transport: Transport) {}

  /**
   * 发送消息
   */
  async send(sessionKey: string, content: string, options?: ChatOptions): Promise<string> {
    if (options?.stream && options.onChunk) {
      await this.sendStream(sessionKey, content, options.onChunk);
      return '';
    }

    const result = await this.transport.send('chat.send', {
      sessionKey,
      content,
    });
    return result as string;
  }

  /**
   * 流式发送消息
   */
  private async sendStream(
    sessionKey: string,
    content: string,
    handler: StreamHandler
  ): Promise<void> {
    if (!this.transport.sendStream) {
      throw new Error('当前传输层不支持流式响应');
    }

    await this.transport.sendStream('chat.send', { sessionKey, content, stream: true }, handler);
  }

  /**
   * 获取消息历史
   */
  async getHistory(sessionKey: string): Promise<LLMMessage[]> {
    return this.transport.send('chat.getHistory', { sessionKey }) as Promise<LLMMessage[]>;
  }

  /**
   * 清除历史
   */
  async clearHistory(sessionKey: string): Promise<void> {
    await this.transport.send('chat.clearHistory', { sessionKey });
  }
}
