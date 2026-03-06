/**
 * Agent 客户端
 * 
 * 通过 IPC 与 Agent Service 通信。
 */

import { MicroAgentClient } from '@micro-agent/client-sdk';
import type { StreamChunk } from '@micro-agent/client-sdk';
import type { AgentClient, MessageContent } from './message-router';

/**
 * Agent 客户端配置
 */
export interface AgentClientConfig {
  /** IPC 路径 */
  ipcPath?: string;
  /** 超时时间 */
  timeout?: number;
}

/**
 * Agent 客户端实现
 */
export class AgentClientImpl implements AgentClient {
  private client: MicroAgentClient;
  private _connected = false;

  constructor(config?: AgentClientConfig) {
    this.client = new MicroAgentClient({
      transport: 'ipc',
      ipc: {
        path: config?.ipcPath,
        timeout: config?.timeout ?? 60000,
      },
    });
  }

  get connected(): boolean {
    return this._connected;
  }

  /**
   * 连接到 Agent Service
   */
  async connect(): Promise<void> {
    await this.client.connect();
    this._connected = true;
    console.log('[AgentClient] 已连接到 Agent Service');
  }

  /**
   * 断开连接
   */
  async disconnect(): Promise<void> {
    await this.client.disconnect();
    this._connected = false;
    console.log('[AgentClient] 已断开连接');
  }

  /**
   * 发送消息（流式）
   */
  async *chat(
    sessionId: string,
    content: MessageContent,
    metadata?: Record<string, unknown>
  ): AsyncIterable<StreamChunk> {
    if (!this._connected) {
      throw new Error('未连接到 Agent Service');
    }

    const text = content.type === 'text' ? content.text : JSON.stringify(content);

    // 使用 SDK 的流式接口
    for await (const chunk of this.client.chatStream({
      sessionId,
      content: { type: 'text', text },
      metadata,
    })) {
      yield chunk;
    }
  }

  /**
   * 执行任务（非流式）
   */
  async execute(
    sessionId: string,
    content: MessageContent,
    metadata?: Record<string, unknown>
  ): Promise<string> {
    if (!this._connected) {
      throw new Error('未连接到 Agent Service');
    }

    const text = content.type === 'text' ? content.text : JSON.stringify(content);

    const response = await this.client.chat({
      sessionId,
      content: { type: 'text', text },
      metadata,
    });

    return response.content ?? '';
  }

  /**
   * 获取服务状态
   */
  async getStatus(): Promise<{
    version: string;
    uptime: number;
    activeSessions: number;
  }> {
    const result = await this.client.sendRequest('status', {});
    return result as {
      version: string;
      uptime: number;
      activeSessions: number;
    };
  }
}
