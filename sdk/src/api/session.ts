/**
 * 会话管理 API
 */

import type { RuntimeConfig, ExecutionContext } from '../client/types';

interface Transport {
  send(method: string, params: unknown): Promise<unknown>;
}

/**
 * 会话管理 API
 */
export class SessionAPI {
  constructor(private transport: Transport) {}

  /**
   * 创建新会话
   */
  async create(config: RuntimeConfig): Promise<ExecutionContext> {
    return this.transport.send('session.create', { config }) as Promise<ExecutionContext>;
  }

  /**
   * 获取会话
   */
  async get(sessionKey: string): Promise<ExecutionContext | undefined> {
    return this.transport.send('session.get', { sessionKey }) as Promise<ExecutionContext | undefined>;
  }

  /**
   * 删除会话
   */
  async delete(sessionKey: string): Promise<void> {
    await this.transport.send('session.delete', { sessionKey });
  }

  /**
   * 列出所有会话
   */
  async list(): Promise<ExecutionContext[]> {
    return this.transport.send('session.list', {}) as Promise<ExecutionContext[]>;
  }
}
