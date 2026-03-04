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
   * 关闭客户端
   */
  close(): void {
    this.transport.close();
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
