/**
 * SDK 主客户端 API
 * 
 * 提供统一的客户端入口点。
 */

import type { SDKClientConfig, RuntimeConfig, PromptTemplate, StreamHandler } from '../client/types';
import { HTTPTransport } from '../transport/http';
import { WebSocketTransport } from '../transport/websocket';
import { IPCTransport } from '../transport/ipc';
import { SessionAPI } from './session';
import { ChatAPI } from './chat';
import { TaskAPI } from './task';
import { MemoryAPI } from './memory';
import { ConfigAPI } from './config';
import { PromptAPI } from './prompt';

/**
 * MicroAgent SDK 客户端
 */
export class MicroAgentClient {
  private transport: HTTPTransport | WebSocketTransport | IPCTransport;
  private _session: SessionAPI;
  private _chat: ChatAPI;
  private _task: TaskAPI;
  private _memory: MemoryAPI;
  private _config: ConfigAPI;
  private _prompts: PromptAPI;

  constructor(config: SDKClientConfig) {
    // 根据传输类型创建传输层
    switch (config.transport) {
      case 'http':
        this.transport = new HTTPTransport(config);
        break;
      case 'websocket':
        this.transport = new WebSocketTransport(config);
        break;
      case 'ipc':
        this.transport = new IPCTransport(config);
        break;
      default:
        throw new Error(`不支持的传输类型: ${config.transport}`);
    }

    // 初始化 API 模块
    this._session = new SessionAPI(this.transport);
    this._chat = new ChatAPI(this.transport);
    this._task = new TaskAPI(this.transport);
    this._memory = new MemoryAPI(this.transport);
    this._config = new ConfigAPI(this.transport);
    this._prompts = new PromptAPI(this.transport);
  }

  /** 会话管理 API */
  get session(): SessionAPI {
    return this._session;
  }

  /** 聊天 API */
  get chat(): ChatAPI {
    return this._chat;
  }

  /** 任务 API */
  get task(): TaskAPI {
    return this._task;
  }

  /** 记忆 API */
  get memory(): MemoryAPI {
    return this._memory;
  }

  /** 配置 API */
  get config(): ConfigAPI {
    return this._config;
  }

  /** 提示词 API */
  get prompts(): PromptAPI {
    return this._prompts;
  }

  /**
   * 连接到 Agent Service
   */
  async connect(): Promise<void> {
    if ('connect' in this.transport) {
      await (this.transport as WebSocketTransport | IPCTransport).connect();
    }
  }

  /**
   * 断开连接
   */
  async disconnect(): Promise<void> {
    if ('disconnect' in this.transport) {
      await (this.transport as WebSocketTransport | IPCTransport).disconnect();
    } else {
      this.transport.close();
    }
  }

  /**
   * 关闭客户端
   */
  close(): void {
    this.transport.close();
  }

  /**
   * 发送原始请求
   */
  async sendRequest(method: string, params: unknown): Promise<unknown> {
    return this.transport.send(method, params);
  }

  /**
   * 流式聊天
   */
  async *chatStream(params: {
    sessionId: string;
    content: { type: string; text: string };
    metadata?: Record<string, unknown>;
  }): AsyncIterable<import('../client/types').StreamChunk> {
    if (!('sendStream' in this.transport)) {
      throw new Error('当前传输层不支持流式响应');
    }

    // 使用队列来收集 chunks
    const chunks: import('../client/types').StreamChunk[] = [];
    let done = false;
    let error: Error | null = null;

    // 启动流式请求
    const streamPromise = (this.transport as WebSocketTransport | IPCTransport).sendStream(
      'chat',
      params,
      (chunk) => {
        chunks.push(chunk);
        if (chunk.type === 'done') {
          done = true;
        } else if (chunk.type === 'error') {
          error = new Error(chunk.content);
          done = true;
        }
      }
    );

    // 异步产生 chunks
    while (!done) {
      while (chunks.length > 0) {
        const chunk = chunks.shift()!;
        yield chunk;
      }
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    // 产生剩余的 chunks
    while (chunks.length > 0) {
      const chunk = chunks.shift()!;
      yield chunk;
    }

    // 等待流式请求完成
    await streamPromise;

    if (error) {
      throw error;
    }
  }
}

/**
 * 创建 MicroAgent 客户端
 */
export function createClient(config: SDKClientConfig & {
  runtime?: RuntimeConfig;
  prompts?: PromptTemplate[];
}): MicroAgentClient {
  const client = new MicroAgentClient(config);

  // 如果提供了运行时配置，立即更新
  if (config.runtime) {
    client.config.update(config.runtime);
  }

  // 如果提供了提示词模板，立即注册
  if (config.prompts) {
    for (const template of config.prompts) {
      client.prompts.register(template);
    }
  }

  return client;
}

// 导出类型
export type { SDKClientConfig, RuntimeConfig, PromptTemplate, StreamHandler };
