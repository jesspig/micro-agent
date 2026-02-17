import type { Database } from 'bun:sqlite';
import type { SessionKey } from '../bus/events';

/** 会话消息 */
export interface SessionMessage {
  /** 消息角色 */
  role: 'user' | 'assistant' | 'system';
  /** 消息内容 */
  content: string;
  /** 时间戳（ms） */
  timestamp: number;
}

/** 会话数据 */
export interface Session {
  /** 会话键 */
  key: SessionKey;
  /** 通道类型 */
  channel: string;
  /** 聊天 ID */
  chatId: string;
  /** 消息历史 */
  messages: SessionMessage[];
  /** 创建时间（ms） */
  createdAt: number;
  /** 最后活跃时间（ms） */
  lastActiveAt: number;
}

/** 会话存储配置 */
interface SessionStoreConfig {
  /** 最大消息数，默认 50 */
  maxMessages: number;
  /** 过期时间（毫秒），默认 24h */
  maxAge: number;
}

const DEFAULT_CONFIG: SessionStoreConfig = {
  maxMessages: 50,
  maxAge: 24 * 60 * 60 * 1000,
};

/**
 * 会话存储
 * 
 * 基于 SQLite 的会话管理，支持消息限制和自动过期。
 */
export class SessionStore {
  constructor(
    private db: Database,
    private config: SessionStoreConfig = DEFAULT_CONFIG
  ) {}

  /**
   * 获取会话
   * @param key - 会话键
   */
  get(key: SessionKey): Session | null {
    const row = this.db.query<{
      channel: string;
      chat_id: string;
      messages: string;
      created_at: number;
      last_active_at: number;
    }, [string]>(
      'SELECT channel, chat_id, messages, created_at, last_active_at FROM sessions WHERE key = ?'
    ).get(key);

    if (!row) return null;

    return {
      key,
      channel: row.channel,
      chatId: row.chat_id,
      messages: JSON.parse(row.messages),
      createdAt: row.created_at,
      lastActiveAt: row.last_active_at,
    };
  }

  /**
   * 保存会话
   * @param session - 会话数据
   */
  set(session: Session): void {
    const now = Date.now();
    const messages = session.messages.slice(-this.config.maxMessages);
    const messagesJson = JSON.stringify(messages);

    this.db.run(`
      INSERT INTO sessions (key, channel, chat_id, messages, created_at, last_active_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        messages = excluded.messages,
        last_active_at = excluded.last_active_at
    `, [session.key, session.channel, session.chatId, messagesJson, session.createdAt || now, now]);
  }

  /**
   * 添加消息到会话
   * @param key - 会话键
   * @param role - 消息角色
   * @param content - 消息内容
   */
  addMessage(key: SessionKey, role: 'user' | 'assistant' | 'system', content: string): void {
    const session = this.get(key) || this.createSession(key);
    session.messages.push({ role, content, timestamp: Date.now() });
    this.set(session);
  }

  /**
   * 删除会话
   * @param key - 会话键
   */
  delete(key: SessionKey): void {
    this.db.run('DELETE FROM sessions WHERE key = ?', [key]);
  }

  /**
   * 清理过期会话
   * @returns 清理的会话数量
   */
  cleanup(): number {
    const threshold = Date.now() - this.config.maxAge;
    const result = this.db.run('DELETE FROM sessions WHERE last_active_at < ?', [threshold]);
    return result.changes;
  }

  /** 创建新会话 */
  private createSession(key: SessionKey): Session {
    const [channel, chatId] = key.split(':');
    return {
      key,
      channel,
      chatId,
      messages: [],
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
    };
  }
}
