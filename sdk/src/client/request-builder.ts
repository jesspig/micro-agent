/**
 * 请求构建器
 * 
 * 构建发送到 Agent Service 的请求。
 */

/**
 * 请求构建器
 */
export class RequestBuilder {
  /**
   * 构建 JSON-RPC 请求
   */
  static buildRequest(method: string, params: unknown, id?: string): string {
    return JSON.stringify({
      jsonrpc: '2.0',
      method,
      params,
      id: id ?? crypto.randomUUID(),
    });
  }

  /**
   * 构建聊天请求
   */
  static buildChatRequest(
    sessionKey: string,
    content: string,
    options?: {
      stream?: boolean;
      media?: string[];
    }
  ): string {
    return this.buildRequest('chat', {
      sessionKey,
      content,
      ...options,
    });
  }

  /**
   * 构建任务请求
   */
  static buildTaskRequest(
    sessionKey: string,
    task: string,
    options?: {
      stream?: boolean;
    }
  ): string {
    return this.buildRequest('task', {
      sessionKey,
      task,
      ...options,
    });
  }

  /**
   * 构建配置更新请求
   */
  static buildConfigRequest(config: Record<string, unknown>): string {
    return this.buildRequest('config.update', { config });
  }

  /**
   * 构建记忆检索请求
   */
  static buildMemorySearchRequest(
    query: string,
    options?: {
      limit?: number;
      types?: string[];
    }
  ): string {
    return this.buildRequest('memory.search', {
      query,
      ...options,
    });
  }
}
