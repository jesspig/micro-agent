/**
 * 会话管理器
 *
 * 提供 Session 的创建、管理和持久化能力
 */

import type { Message, SessionMetadata } from "../types.js";
import type { ISession } from "../contracts.js";
import type { SessionConfig, SessionState, SessionSnapshot } from "./types.js";
import { SessionError } from "../errors.js";
import { appendSessionEntry, loadRecentSessions, messageToEntry, entryToMessage } from "./persistence.js";
import { sessionLogger, createTimer, sanitize, logMethodCall, logMethodReturn, logMethodError } from "../../applications/shared/logger.js";

const logger = sessionLogger();
const MODULE_NAME = "SessionManager";

// ============================================================================
// Session 实现
// ============================================================================

/**
 * Session 实现 - 管理单个会话的消息和状态
 */
export class Session implements ISession {
  private messages: Message[] = [];
  private state: SessionState;
  readonly metadata: SessionMetadata;

  constructor(readonly key: string, _config?: Partial<SessionConfig>) {
    this.metadata = { id: key, createdAt: Date.now(), updatedAt: Date.now() };
    this.state = { messageCount: 0, totalTokens: 0, lastActivity: Date.now() };
  }

  getMessages(): Message[] {
    return [...this.messages];
  }

  addMessage(message: Message): void {
    this.messages.push({ ...message, timestamp: message.timestamp ?? Date.now() });
    this.state.messageCount++;
    this.state.lastActivity = Date.now();
    logger.info("消息已添加", { sessionKey: this.key, messageCount: this.state.messageCount, role: message.role });
  }

  async addMessageAndPersist(message: Message): Promise<void> {
    const timer = createTimer();
    const timestamp = message.timestamp ?? Date.now();
    this.messages.push({ ...message, timestamp });
    this.state.messageCount++;
    this.state.lastActivity = Date.now();
    await appendSessionEntry(messageToEntry(message));
    logger.info("消息已添加并持久化", { sessionKey: this.key, messageCount: this.state.messageCount, role: message.role });
    logMethodReturn(logger, { method: "addMessageAndPersist", module: "Session", result: sanitize({ messageCount: this.state.messageCount }), duration: timer() });
  }

  async save(): Promise<void> {
    this.metadata.updatedAt = Date.now();
    logger.info("会话已保存", { sessionKey: this.key, messageCount: this.state.messageCount });
  }

  clear(): void {
    const previousCount = this.state.messageCount;
    this.messages = [];
    this.state.messageCount = 0;
    this.state.lastActivity = Date.now();
    logger.info("会话已清空", { sessionKey: this.key, previousMessageCount: previousCount });
  }

  getState(): SessionState {
    return { ...this.state };
  }

  createSnapshot(): SessionSnapshot {
    const result: SessionSnapshot = { metadata: { ...this.metadata }, messages: [...this.messages], state: { ...this.state } };
    logger.info("会话快照已创建", { sessionKey: this.key, messageCount: result.messages.length });
    return result;
  }

  restoreFromSnapshot(snapshot: SessionSnapshot): void {
    this.messages = [...snapshot.messages];
    Object.assign(this.state, snapshot.state);
    Object.assign(this.metadata, snapshot.metadata);
    logger.info("会话已从快照恢复", { sessionKey: this.key, messageCount: this.messages.length });
  }
}

// ============================================================================
// SessionManager 实现
// ============================================================================

/**
 * Session 管理器 - 管理多个 Session 实例
 */
export class SessionManager {
  private sessions = new Map<string, Session>();

  create(sessionKey: string, config?: Partial<SessionConfig>): Session {
    const timer = createTimer();
    logMethodCall(logger, { method: "create", module: MODULE_NAME, params: { sessionKey, config } });

    if (this.sessions.has(sessionKey)) {
      throw new SessionError(`会话 "${sessionKey}" 已存在`, sessionKey);
    }

    const session = new Session(sessionKey, config);
    this.sessions.set(sessionKey, session);
    logger.info("会话已创建", { sessionKey, totalSessions: this.sessions.size });

    logMethodReturn(logger, { method: "create", module: MODULE_NAME, result: sanitize({ sessionKey }), duration: timer() });
    return session;
  }

  get(sessionKey: string): Session | undefined {
    return this.sessions.get(sessionKey);
  }

  getOrCreate(sessionKey: string): Session {
    const timer = createTimer();
    logMethodCall(logger, { method: "getOrCreate", module: MODULE_NAME, params: { sessionKey } });

    let session = this.sessions.get(sessionKey);
    const existed = session !== undefined;

    if (!session) {
      session = this.create(sessionKey);
    }

    logger.info("获取或创建会话", { sessionKey, existed, totalSessions: this.sessions.size });
    logMethodReturn(logger, { method: "getOrCreate", module: MODULE_NAME, result: sanitize({ sessionKey, created: !existed }), duration: timer() });
    return session;
  }

  delete(sessionKey: string): boolean {
    const timer = createTimer();
    logMethodCall(logger, { method: "delete", module: MODULE_NAME, params: { sessionKey } });

    const result = this.sessions.delete(sessionKey);
    logger.info("会话已删除", { sessionKey, deleted: result, totalSessions: this.sessions.size });

    logMethodReturn(logger, { method: "delete", module: MODULE_NAME, result: sanitize({ deleted: result }), duration: timer() });
    return result;
  }

  list(): Session[] {
    return Array.from(this.sessions.values());
  }

  clear(): void {
    const previousCount = this.sessions.size;
    this.sessions.clear();
    logger.info("所有会话已清空", { previousCount });
  }

  async saveAll(): Promise<void> {
    const timer = createTimer();
    const sessionCount = this.sessions.size;
    logMethodCall(logger, { method: "saveAll", module: MODULE_NAME, params: { sessionCount } });

    await Promise.all(Array.from(this.sessions.values()).map((s) => s.save()));
    logger.info("所有会话已保存", { sessionCount });

    logMethodReturn(logger, { method: "saveAll", module: MODULE_NAME, result: sanitize({ savedCount: sessionCount }), duration: timer() });
  }

  async loadHistory(sessionKey: string, contextWindowTokens: number = 65535): Promise<void> {
    const timer = createTimer();
    logMethodCall(logger, { method: "loadHistory", module: MODULE_NAME, params: { sessionKey, contextWindowTokens } });

    const session = this.getOrCreate(sessionKey);
    const entries = await loadRecentSessions(contextWindowTokens);

    for (const entry of entries) {
      session.addMessage(entryToMessage(entry));
    }

    const state = session.getState();
    if (state.messageCount === 0) {
      const sessionInternal = session as unknown as { state: SessionState };
      sessionInternal.state.messageCount = entries.length;
    }

    logger.info("历史会话已加载", { sessionKey, loadedEntries: entries.length, contextWindowTokens });
    logMethodReturn(logger, { method: "loadHistory", module: MODULE_NAME, result: sanitize({ loadedEntries: entries.length }), duration: timer() });
  }
}
