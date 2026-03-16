/**
 * 会话管理器
 *
 * 提供 Session 的创建、管理和持久化能力
 */

import type { Message, SessionMetadata } from "../types.js";
import type { ISession } from "../contracts.js";
import type { SessionConfig, SessionState, SessionSnapshot } from "./types.js";
import { SessionError } from "../errors.js";
import {
  appendSessionEntry,
  loadRecentSessions,
  messageToEntry,
  entryToMessage,
} from "./persistence.js";
import {
  sessionLogger,
  createTimer,
  sanitize,
  logMethodCall,
  logMethodReturn,
  logMethodError,
} from "../../applications/shared/logger.js";

const logger = sessionLogger();

// ============================================================================
// 常量定义
// ============================================================================

/** 模块名称 */
const MODULE_NAME = "SessionManager";

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
    const timer = createTimer();
    const module = "Session";
    const method = "constructor";
    logMethodCall(logger, {
      method,
      module,
      params: { key, config: _config },
    });

    try {
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

      logMethodReturn(logger, {
        method,
        module,
        result: sanitize({ metadata: this.metadata }),
        duration: timer(),
      });
    } catch (err: unknown) {
      const error = err as Error;
      logMethodError(logger, {
        method,
        module,
        error: {
          name: error.name,
          message: error.message,
          ...(error.stack ? { stack: error.stack } : {}),
        },
        params: { key },
        duration: timer(),
      });
      throw err;
    }
  }

  /**
   * 获取所有消息
   * @returns 消息列表的副本
   */
  getMessages(): Message[] {
    const timer = createTimer();
    const module = "Session";
    const method = "getMessages";
    logMethodCall(logger, { method, module, params: { key: this.key } });

    try {
      const result = [...this.messages];
      logMethodReturn(logger, {
        method,
        module,
        result: sanitize({ messageCount: result.length }),
        duration: timer(),
      });
      return result;
    } catch (err: unknown) {
      const error = err as Error;
      logMethodError(logger, {
        method,
        module,
        error: {
          name: error.name,
          message: error.message,
          ...(error.stack ? { stack: error.stack } : {}),
        },
        params: { key: this.key },
        duration: timer(),
      });
      throw err;
    }
  }

  /**
   * 添加消息
   * @param message - 消息对象
   */
  addMessage(message: Message): void {
    const timer = createTimer();
    const module = "Session";
    const method = "addMessage";
    const contentLength = message.content?.length ?? 0;
    logMethodCall(logger, {
      method,
      module,
      params: { key: this.key, role: message.role, contentLength },
    });

    try {
      this.messages.push({
        ...message,
        timestamp: message.timestamp ?? Date.now(),
      });

      this.state.messageCount++;
      this.state.lastActivity = Date.now();

      logger.info("消息已添加", {
        sessionKey: this.key,
        messageCount: this.state.messageCount,
        role: message.role,
        contentLength,
      });

      logMethodReturn(logger, {
        method,
        module,
        result: sanitize({ messageCount: this.state.messageCount }),
        duration: timer(),
      });
    } catch (err: unknown) {
      const error = err as Error;
      logMethodError(logger, {
        method,
        module,
        error: {
          name: error.name,
          message: error.message,
          ...(error.stack ? { stack: error.stack } : {}),
        },
        params: { key: this.key, role: message.role, contentLength },
        duration: timer(),
      });
      throw err;
    }
  }

  /**
   * 添加消息并持久化
   * @param message - 消息对象
   */
  async addMessageAndPersist(message: Message): Promise<void> {
    const timer = createTimer();
    const module = "Session";
    const method = "addMessageAndPersist";
    logMethodCall(logger, {
      method,
      module,
      params: { key: this.key, role: message.role },
    });

    try {
      const timestamp = message.timestamp ?? Date.now();

      this.messages.push({
        ...message,
        timestamp,
      });

      this.state.messageCount++;
      this.state.lastActivity = Date.now();

      // 持久化到文件
      await appendSessionEntry(messageToEntry(message));

      logger.info("消息已添加并持久化", {
        sessionKey: this.key,
        messageCount: this.state.messageCount,
        role: message.role,
      });

      logMethodReturn(logger, {
        method,
        module,
        result: sanitize({ messageCount: this.state.messageCount }),
        duration: timer(),
      });
    } catch (err: unknown) {
      const error = err as Error;
      logMethodError(logger, {
        method,
        module,
        error: {
          name: error.name,
          message: error.message,
          ...(error.stack ? { stack: error.stack } : {}),
        },
        params: { key: this.key, role: message.role },
        duration: timer(),
      });
      throw err;
    }
  }

  /**
   * 持久化 Session
   * 持久化逻辑由上层实现，此处仅更新时间戳
   */
  async save(): Promise<void> {
    const timer = createTimer();
    const module = "Session";
    const method = "save";
    logMethodCall(logger, { method, module, params: { key: this.key } });

    try {
      this.metadata.updatedAt = Date.now();

      logger.info("会话已保存", {
        sessionKey: this.key,
        messageCount: this.state.messageCount,
      });

      logMethodReturn(logger, {
        method,
        module,
        result: sanitize({ updatedAt: this.metadata.updatedAt }),
        duration: timer(),
      });
    } catch (err: unknown) {
      const error = err as Error;
      logMethodError(logger, {
        method,
        module,
        error: {
          name: error.name,
          message: error.message,
          ...(error.stack ? { stack: error.stack } : {}),
        },
        params: { key: this.key },
        duration: timer(),
      });
      throw err;
    }
  }

  /**
   * 清空 Session
   */
  clear(): void {
    const timer = createTimer();
    const module = "Session";
    const method = "clear";
    const previousCount = this.state.messageCount;
    logMethodCall(logger, { method, module, params: { key: this.key } });

    try {
      this.messages = [];
      this.state.messageCount = 0;
      this.state.lastActivity = Date.now();

      logger.info("会话已清空", {
        sessionKey: this.key,
        previousMessageCount: previousCount,
      });

      logMethodReturn(logger, {
        method,
        module,
        result: sanitize({ cleared: true }),
        duration: timer(),
      });
    } catch (err: unknown) {
      const error = err as Error;
      logMethodError(logger, {
        method,
        module,
        error: {
          name: error.name,
          message: error.message,
          ...(error.stack ? { stack: error.stack } : {}),
        },
        params: { key: this.key },
        duration: timer(),
      });
      throw err;
    }
  }

  /**
   * 获取当前状态
   * @returns 状态副本
   */
  getState(): SessionState {
    const timer = createTimer();
    const module = "Session";
    const method = "getState";
    logMethodCall(logger, { method, module, params: { key: this.key } });

    try {
      const result = { ...this.state };
      logMethodReturn(logger, {
        method,
        module,
        result: sanitize(result),
        duration: timer(),
      });
      return result;
    } catch (err: unknown) {
      const error = err as Error;
      logMethodError(logger, {
        method,
        module,
        error: {
          name: error.name,
          message: error.message,
          ...(error.stack ? { stack: error.stack } : {}),
        },
        params: { key: this.key },
        duration: timer(),
      });
      throw err;
    }
  }

  /**
   * 创建快照
   * @returns Session 快照
   */
  createSnapshot(): SessionSnapshot {
    const timer = createTimer();
    const module = "Session";
    const method = "createSnapshot";
    logMethodCall(logger, { method, module, params: { key: this.key } });

    try {
      const result: SessionSnapshot = {
        metadata: { ...this.metadata },
        messages: [...this.messages],
        state: { ...this.state },
      };

      logger.info("会话快照已创建", {
        sessionKey: this.key,
        messageCount: result.messages.length,
      });

      logMethodReturn(logger, {
        method,
        module,
        result: sanitize({ messageCount: result.messages.length }),
        duration: timer(),
      });
      return result;
    } catch (err: unknown) {
      const error = err as Error;
      logMethodError(logger, {
        method,
        module,
        error: {
          name: error.name,
          message: error.message,
          ...(error.stack ? { stack: error.stack } : {}),
        },
        params: { key: this.key },
        duration: timer(),
      });
      throw err;
    }
  }

  /**
   * 从快照恢复
   * @param snapshot - Session 快照
   */
  restoreFromSnapshot(snapshot: SessionSnapshot): void {
    const timer = createTimer();
    const module = "Session";
    const method = "restoreFromSnapshot";
    logMethodCall(logger, {
      method,
      module,
      params: { key: this.key, snapshotMessageCount: snapshot.messages.length },
    });

    try {
      this.messages = [...snapshot.messages];
      Object.assign(this.state, snapshot.state);
      Object.assign(this.metadata, snapshot.metadata);

      logger.info("会话已从快照恢复", {
        sessionKey: this.key,
        messageCount: this.messages.length,
      });

      logMethodReturn(logger, {
        method,
        module,
        result: sanitize({ messageCount: this.messages.length }),
        duration: timer(),
      });
    } catch (err: unknown) {
      const error = err as Error;
      logMethodError(logger, {
        method,
        module,
        error: {
          name: error.name,
          message: error.message,
          ...(error.stack ? { stack: error.stack } : {}),
        },
        params: { key: this.key },
        duration: timer(),
      });
      throw err;
    }
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
    const timer = createTimer();
    const module = MODULE_NAME;
    const method = "create";
    logMethodCall(logger, {
      method,
      module,
      params: { sessionKey, config },
    });

    try {
      if (this.sessions.has(sessionKey)) {
        throw new SessionError(`会话 "${sessionKey}" 已存在`, sessionKey);
      }

      const session = new Session(sessionKey, config);
      this.sessions.set(sessionKey, session);

      logger.info("会话已创建", {
        sessionKey,
        totalSessions: this.sessions.size,
      });

      logMethodReturn(logger, {
        method,
        module,
        result: sanitize({ sessionKey }),
        duration: timer(),
      });
      return session;
    } catch (err: unknown) {
      const error = err as Error;
      logMethodError(logger, {
        method,
        module,
        error: {
          name: error.name,
          message: error.message,
          ...(error.stack ? { stack: error.stack } : {}),
        },
        params: { sessionKey },
        duration: timer(),
      });
      throw err;
    }
  }

  /**
   * 获取会话
   * @param sessionKey - Session 标识
   * @returns Session 实例，若不存在则返回 undefined
   */
  get(sessionKey: string): Session | undefined {
    const timer = createTimer();
    const module = MODULE_NAME;
    const method = "get";
    logMethodCall(logger, { method, module, params: { sessionKey } });

    try {
      const result = this.sessions.get(sessionKey);
      logMethodReturn(logger, {
        method,
        module,
        result: sanitize({ found: result !== undefined }),
        duration: timer(),
      });
      return result;
    } catch (err: unknown) {
      const error = err as Error;
      logMethodError(logger, {
        method,
        module,
        error: {
          name: error.name,
          message: error.message,
          ...(error.stack ? { stack: error.stack } : {}),
        },
        params: { sessionKey },
        duration: timer(),
      });
      throw err;
    }
  }

  /**
   * 获取或创建会话
   * @param sessionKey - Session 标识
   * @returns Session 实例
   */
  getOrCreate(sessionKey: string): Session {
    const timer = createTimer();
    const module = MODULE_NAME;
    const method = "getOrCreate";
    logMethodCall(logger, { method, module, params: { sessionKey } });

    try {
      let session = this.sessions.get(sessionKey);
      const existed = session !== undefined;

      if (!session) {
        session = this.create(sessionKey);
      }

      logger.info("获取或创建会话", {
        sessionKey,
        existed,
        totalSessions: this.sessions.size,
      });

      logMethodReturn(logger, {
        method,
        module,
        result: sanitize({ sessionKey, created: !existed }),
        duration: timer(),
      });
      return session;
    } catch (err: unknown) {
      const error = err as Error;
      logMethodError(logger, {
        method,
        module,
        error: {
          name: error.name,
          message: error.message,
          ...(error.stack ? { stack: error.stack } : {}),
        },
        params: { sessionKey },
        duration: timer(),
      });
      throw err;
    }
  }

  /**
   * 删除会话
   * @param sessionKey - Session 标识
   * @returns 是否删除成功
   */
  delete(sessionKey: string): boolean {
    const timer = createTimer();
    const module = MODULE_NAME;
    const method = "delete";
    logMethodCall(logger, { method, module, params: { sessionKey } });

    try {
      const result = this.sessions.delete(sessionKey);

      logger.info("会话已删除", {
        sessionKey,
        deleted: result,
        totalSessions: this.sessions.size,
      });

      logMethodReturn(logger, {
        method,
        module,
        result: sanitize({ deleted: result }),
        duration: timer(),
      });
      return result;
    } catch (err: unknown) {
      const error = err as Error;
      logMethodError(logger, {
        method,
        module,
        error: {
          name: error.name,
          message: error.message,
          ...(error.stack ? { stack: error.stack } : {}),
        },
        params: { sessionKey },
        duration: timer(),
      });
      throw err;
    }
  }

  /**
   * 列出所有会话
   * @returns Session 列表
   */
  list(): Session[] {
    const timer = createTimer();
    const module = MODULE_NAME;
    const method = "list";
    logMethodCall(logger, { method, module, params: {} });

    try {
      const result = Array.from(this.sessions.values());
      logMethodReturn(logger, {
        method,
        module,
        result: sanitize({ count: result.length }),
        duration: timer(),
      });
      return result;
    } catch (err: unknown) {
      const error = err as Error;
      logMethodError(logger, {
        method,
        module,
        error: {
          name: error.name,
          message: error.message,
          ...(error.stack ? { stack: error.stack } : {}),
        },
        params: {},
        duration: timer(),
      });
      throw err;
    }
  }

  /**
   * 清空所有会话
   */
  clear(): void {
    const timer = createTimer();
    const module = MODULE_NAME;
    const method = "clear";
    const previousCount = this.sessions.size;
    logMethodCall(logger, { method, module, params: {} });

    try {
      this.sessions.clear();

      logger.info("所有会话已清空", {
        previousCount,
      });

      logMethodReturn(logger, {
        method,
        module,
        result: sanitize({ cleared: true }),
        duration: timer(),
      });
    } catch (err: unknown) {
      const error = err as Error;
      logMethodError(logger, {
        method,
        module,
        error: {
          name: error.name,
          message: error.message,
          ...(error.stack ? { stack: error.stack } : {}),
        },
        params: {},
        duration: timer(),
      });
      throw err;
    }
  }

  /**
   * 保存所有会话
   */
  async saveAll(): Promise<void> {
    const timer = createTimer();
    const module = MODULE_NAME;
    const method = "saveAll";
    const sessionCount = this.sessions.size;
    logMethodCall(logger, { method, module, params: { sessionCount } });

    try {
      await Promise.all(Array.from(this.sessions.values()).map((s) => s.save()));

      logger.info("所有会话已保存", {
        sessionCount,
      });

      logMethodReturn(logger, {
        method,
        module,
        result: sanitize({ savedCount: sessionCount }),
        duration: timer(),
      });
    } catch (err: unknown) {
      const error = err as Error;
      logMethodError(logger, {
        method,
        module,
        error: {
          name: error.name,
          message: error.message,
          ...(error.stack ? { stack: error.stack } : {}),
        },
        params: { sessionCount },
        duration: timer(),
      });
      throw err;
    }
  }

  /**
   * 加载历史会话到指定 Session
   * @param sessionKey - Session 标识
   */
  async loadHistory(sessionKey: string): Promise<void> {
    const timer = createTimer();
    const module = MODULE_NAME;
    const method = "loadHistory";
    logMethodCall(logger, { method, module, params: { sessionKey } });

    try {
      const session = this.getOrCreate(sessionKey);
      const entries = await loadRecentSessions(0); // 0 表示加载所有消息

      for (const entry of entries) {
        session.addMessage(entryToMessage(entry));
      }

      // 更新消息计数
      const state = session.getState();
      if (state.messageCount === 0) {
        // 如果 session 之前没有消息，则使用加载的消息数量
        const sessionInternal = session as unknown as { state: SessionState };
        sessionInternal.state.messageCount = entries.length;
      }

      logger.info("历史会话已加载", {
        sessionKey,
        loadedEntries: entries.length,
      });

      logMethodReturn(logger, {
        method,
        module,
        result: sanitize({ loadedEntries: entries.length }),
        duration: timer(),
      });
    } catch (err: unknown) {
      const error = err as Error;
      logMethodError(logger, {
        method,
        module,
        error: {
          name: error.name,
          message: error.message,
          ...(error.stack ? { stack: error.stack } : {}),
        },
        params: { sessionKey },
        duration: timer(),
      });
      throw err;
    }
  }
}
