/**
 * 会话管理器
 *
 * 提供 Session 的创建、管理和持久化能力
 */

import type { Message, SessionMetadata } from "../types.js";
import type { ISession } from "../contracts.js";
import type { SessionConfig, SessionState, SessionSnapshot } from "./types.js";
import { SessionError } from "../errors.js";

/**
 * Session 实现
 *
 * 实现 ISession 接口，管理单个会话的消息和状态
 */
export class Session implements ISession {
  private messages: Message[] = [];
  private state: SessionState;

  /** Session 元数据 */
  readonly metadata: SessionMetadata;

  constructor(readonly key: string, _config?: Partial<SessionConfig>) {
    this.metadata = {
      id: key,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.state = {
      messageCount: 0,
      totalTokens: 0,
      lastActivity: Date.now(),
    };
  }

  /**
   * 获取所有消息
   * @returns 消息列表的副本
   */
  getMessages(): Message[] {
    return [...this.messages];
  }

  /**
   * 添加消息
   * @param message - 消息对象
   */
  addMessage(message: Message): void {
    this.messages.push({
      ...message,
      timestamp: message.timestamp ?? Date.now(),
    });

    this.state.messageCount++;
    this.state.lastActivity = Date.now();
  }

  /**
   * 持久化 Session
   * 持久化逻辑由上层实现，此处仅更新时间戳
   */
  async save(): Promise<void> {
    this.metadata.updatedAt = Date.now();
  }

  /**
   * 清空 Session
   */
  clear(): void {
    this.messages = [];
    this.state.messageCount = 0;
    this.state.lastActivity = Date.now();
  }

  /**
   * 获取当前状态
   * @returns 状态副本
   */
  getState(): SessionState {
    return { ...this.state };
  }

  /**
   * 创建快照
   * @returns Session 快照
   */
  createSnapshot(): SessionSnapshot {
    return {
      metadata: { ...this.metadata },
      messages: [...this.messages],
      state: { ...this.state },
    };
  }

  /**
   * 从快照恢复
   * @param snapshot - Session 快照
   */
  restoreFromSnapshot(snapshot: SessionSnapshot): void {
    this.messages = [...snapshot.messages];
    Object.assign(this.state, snapshot.state);
    Object.assign(this.metadata, snapshot.metadata);
  }
}

/**
 * Session 管理器
 *
 * 管理多个 Session 实例的创建、查找和删除
 */
export class SessionManager {
  private sessions = new Map<string, Session>();

  /**
   * 创建会话
   * @param sessionKey - Session 标识
   * @param config - 可选配置
   * @returns 新创建的 Session
   * @throws SessionError 如果会话已存在
   */
  create(sessionKey: string, config?: Partial<SessionConfig>): Session {
    if (this.sessions.has(sessionKey)) {
      throw new SessionError(`会话 "${sessionKey}" 已存在`, sessionKey);
    }

    const session = new Session(sessionKey, config);
    this.sessions.set(sessionKey, session);
    return session;
  }

  /**
   * 获取会话
   * @param sessionKey - Session 标识
   * @returns Session 实例，若不存在则返回 undefined
   */
  get(sessionKey: string): Session | undefined {
    return this.sessions.get(sessionKey);
  }

  /**
   * 获取或创建会话
   * @param sessionKey - Session 标识
   * @returns Session 实例
   */
  getOrCreate(sessionKey: string): Session {
    let session = this.sessions.get(sessionKey);
    if (!session) {
      session = this.create(sessionKey);
    }
    return session;
  }

  /**
   * 删除会话
   * @param sessionKey - Session 标识
   * @returns 是否删除成功
   */
  delete(sessionKey: string): boolean {
    return this.sessions.delete(sessionKey);
  }

  /**
   * 列出所有会话
   * @returns Session 列表
   */
  list(): Session[] {
    return Array.from(this.sessions.values());
  }

  /**
   * 清空所有会话
   */
  clear(): void {
    this.sessions.clear();
  }

  /**
   * 保存所有会话
   */
  async saveAll(): Promise<void> {
    await Promise.all(Array.from(this.sessions.values()).map((s) => s.save()));
  }
}
