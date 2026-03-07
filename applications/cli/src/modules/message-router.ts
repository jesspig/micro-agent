/**
 * 消息路由器
 * 
 * 负责将通道消息路由到 Agent，并将 Agent 响应路由回通道。
 */

import type { StreamChunk } from '@micro-agent/sdk';

/**
 * 入站消息
 */
export interface InboundMessage {
  /** 消息 ID */
  id: string;
  /** 会话 ID（通道相关） */
  chatId: string;
  /** 用户 ID */
  userId: string;
  /** 消息内容 */
  content: MessageContent;
  /** 时间戳 */
  timestamp: Date;
  /** 通道类型 */
  channelType: string;
  /** 额外元数据 */
  metadata?: Record<string, unknown>;
}

/**
 * 出站消息
 */
export interface OutboundMessage {
  /** 会话 ID */
  chatId: string;
  /** 消息内容 */
  content: MessageContent;
  /** 是否完成 */
  done: boolean;
  /** 时间戳 */
  timestamp: Date;
}

/**
 * 消息内容
 */
export type MessageContent =
  | { type: 'text'; text: string }
  | { type: 'image'; url: string }
  | { type: 'mixed'; parts: MessageContent[] };

/**
 * 通道接口
 */
export interface Channel {
  /** 通道类型 */
  readonly type: string;
  /** 是否已连接 */
  readonly connected: boolean;

  /** 启动通道 */
  start(): Promise<void>;
  /** 停止通道 */
  stop(): Promise<void>;
  /** 发送消息 */
  send(chatId: string, content: MessageContent): Promise<void>;
  /** 注册消息处理器 */
  onMessage(handler: (msg: InboundMessage) => void): void;
  /** 注册错误处理器 */
  onError(handler: (error: Error) => void): void;
}

/**
 * Agent 客户端接口
 */
export interface AgentClient {
  /** 是否已连接 */
  readonly connected: boolean;

  /** 连接 */
  connect(): Promise<void>;
  /** 断开 */
  disconnect(): Promise<void>;
  /** 发送消息（流式） */
  chat(
    sessionId: string,
    content: MessageContent,
    metadata?: Record<string, unknown>
  ): AsyncIterable<StreamChunk>;
  /** 执行任务（非流式） */
  execute(
    sessionId: string,
    content: MessageContent,
    metadata?: Record<string, unknown>
  ): Promise<string>;
  /** 设置系统提示词 */
  setSystemPrompt(prompt: string): Promise<void>;
  /** 注册工具 */
  registerTools(tools: unknown[]): Promise<{ count: number; tools: string[] }>;
  /** 加载技能 */
  loadSkills(skills: unknown[]): Promise<{ count: number; skills: string[] }>;
  /** 配置记忆系统 */
  configureMemory(config: unknown): Promise<void>;
  /** 配置知识库 */
  configureKnowledge(config: unknown): Promise<void>;
}

/**
 * 会话信息
 */
interface SessionInfo {
  chatId: string;
  channelType: string;
  userId: string;
  lastActiveAt: Date;
}

/**
 * 消息路由器
 */
export class MessageRouter {
  private channels = new Map<string, Channel>();
  private agentClient: AgentClient;
  private sessions = new Map<string, SessionInfo>();
  private messageHandler?: (msg: InboundMessage) => void;
  private errorHandler?: (error: Error) => void;

  constructor(agentClient: AgentClient) {
    this.agentClient = agentClient;
  }

  /**
   * 注册通道
   */
  registerChannel(channel: Channel): void {
    this.channels.set(channel.type, channel);

    // 注册通道消息处理器
    channel.onMessage((msg) => this.handleInboundMessage(msg));
    channel.onError((error) => this.handleError(error));
  }

  /**
   * 注销通道
   */
  async unregisterChannel(channelType: string): Promise<void> {
    const channel = this.channels.get(channelType);
    if (channel) {
      await channel.stop();
      this.channels.delete(channelType);
    }
  }

  /**
   * 获取已注册的通道类型列表
   */
  getChannelTypes(): string[] {
    return Array.from(this.channels.keys());
  }

  /**
   * 启动所有通道
   */
  async start(): Promise<void> {
    // 先连接 Agent
    await this.agentClient.connect();

    // 启动所有通道
    for (const channel of this.channels.values()) {
      await channel.start();
    }
  }

  /**
   * 停止所有通道
   */
  async stop(): Promise<void> {
    // 停止所有通道
    for (const channel of this.channels.values()) {
      await channel.stop();
    }

    // 断开 Agent
    await this.agentClient.disconnect();
  }

  /**
   * 处理入站消息
   */
  private async handleInboundMessage(msg: InboundMessage): Promise<void> {    
    // 获取或创建会话
    const sessionId = this.getOrCreateSession(msg);

    try {
      // 发送到 Agent 并流式处理响应
      const stream = this.agentClient.chat(sessionId, msg.content, {
        channelType: msg.channelType,
        chatId: msg.chatId,
        userId: msg.userId,
      });

      let fullContent = '';

      for await (const chunk of stream) {
        if (chunk.type === 'text') {
          fullContent += chunk.content;
        } else if (chunk.type === 'done') {
          // 发送完整响应
          await this.sendToChannel(msg.channelType, msg.chatId, {
            type: 'text',
            text: fullContent,
          }, true);
        } else if (chunk.type === 'error') {
          // 发送错误消息
          await this.sendToChannel(msg.channelType, msg.chatId, {
            type: 'text',
            text: `错误: ${chunk.content}`,
          }, true);
        }
      }
    } catch (error) {
      console.error('[MessageRouter] 处理消息失败:', error);
      
      // 发送错误响应
      await this.sendToChannel(msg.channelType, msg.chatId, {
        type: 'text',
        text: `处理消息时发生错误: ${(error as Error).message}`,
      }, true);
    }
  }

  /**
   * 获取或创建会话
   */
  private getOrCreateSession(msg: InboundMessage): string {
    // 使用 chatId 作为会话键
    const sessionKey = `${msg.channelType}:${msg.chatId}`;

    if (!this.sessions.has(sessionKey)) {
      this.sessions.set(sessionKey, {
        chatId: msg.chatId,
        channelType: msg.channelType,
        userId: msg.userId,
        lastActiveAt: new Date(),
      });
    } else {
      // 更新活跃时间
      const session = this.sessions.get(sessionKey)!;
      session.lastActiveAt = new Date();
    }

    return sessionKey;
  }

  /**
   * 发送消息到通道
   */
  private async sendToChannel(
    channelType: string,
    chatId: string,
    content: MessageContent,
    done: boolean
  ): Promise<void> {
    const channel = this.channels.get(channelType);
    if (!channel) {
      console.error(`通道不存在: ${channelType}`);
      return;
    }

    await channel.send(chatId, content);
  }

  /**
   * 处理错误
   */
  private handleError(error: Error): void {
    console.error('通道错误:', error);
    if (this.errorHandler) {
      this.errorHandler(error);
    }
  }

  /**
   * 注册全局消息处理器
   */
  onMessage(handler: (msg: InboundMessage) => void): void {
    this.messageHandler = handler;
  }

  /**
   * 注册全局错误处理器
   */
  onError(handler: (error: Error) => void): void {
    this.errorHandler = handler;
  }

  /**
   * 获取活跃会话数
   */
  get activeSessionCount(): number {
    return this.sessions.size;
  }

  /**
   * 获取已连接通道数
   */
  get connectedChannelCount(): number {
    let count = 0;
    for (const channel of this.channels.values()) {
      if (channel.connected) count++;
    }
    return count;
  }
}
