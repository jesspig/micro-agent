/**
 * 会话存储 - SQLite 格式
 * 
 * 会话存储在 ~/.micro-agent/data/sessions.db
 * 消息以 JSON 格式存储，类似 JSONL（每条消息一行 JSON）
 */

import { existsSync, mkdirSync } from 'fs';
import { resolve, join } from 'path';
import { homedir } from 'os';
import { Database } from 'bun:sqlite';
import { getLogger } from '@logtape/logtape';
import type { ContentPart } from '../../../../types';
import type { SessionMessage, Session, SessionStoreConfig, SessionKey } from './types';

const log = getLogger(['session']);

const DEFAULT_CONFIG: SessionStoreConfig = {
  sessionsDir: '~/.micro-agent/data',
  maxMessages: 500,
  sessionTimeout: 30 * 60 * 1000, // 30 分钟
};

/** 数据库文件名 */
const DB_FILE = 'sessions.db';

/**
 * 会话存储
 * 
 * 基于 SQLite 的会话管理，支持：
 * - 会话超时自动创建新会话
 * - 消息追加写入
 * - 元数据跟踪
 */
export class SessionStore {
  private config: SessionStoreConfig;
  private cache = new Map<string, Session>();
  private db?: Database;

  constructor(config?: Partial<SessionStoreConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.initDatabase();
  }

  /** 初始化数据库 */
  private initDatabase(): void {
    const dir = this.expandPath(this.config.sessionsDir);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const dbPath = join(dir, DB_FILE);
    this.db = new Database(dbPath);

    // 创建会话元数据表
    this.db.run(`
      CREATE TABLE IF NOT EXISTS sessions (
        key TEXT PRIMARY KEY,
        channel TEXT NOT NULL,
        chat_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        last_consolidated INTEGER DEFAULT 0
      )
    `);

    // 创建消息表（JSON 格式存储，类似 JSONL）
    this.db.run(`
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_key TEXT NOT NULL,
        seq_num INTEGER NOT NULL,
        message_json TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        FOREIGN KEY (session_key) REFERENCES sessions(key) ON DELETE CASCADE
      )
    `);

    // 创建索引
    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_messages_session_key ON messages(session_key)
    `);
    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_messages_seq ON messages(session_key, seq_num)
    `);

    log.info('SessionStore 数据库已初始化', { path: dbPath });
  }

  /** 展开路径 */
  private expandPath(path: string): string {
    if (path.startsWith('~/')) {
      return resolve(homedir(), path.slice(2));
    }
    return resolve(path);
  }

  /**
   * 获取或创建会话
   * @param key - 会话键（channel:chatId）
   * @param forceNew - 强制创建新会话
   */
  getOrCreate(key: SessionKey, forceNew = false): Session {
    const cached = this.cache.get(key);
    if (cached && !forceNew) {
      const elapsed = Date.now() - cached.updatedAt.getTime();
      if (elapsed < this.config.sessionTimeout) {
        return cached;
      }
      this.save(cached);
      return this.createNewSession(key, cached.channel, cached.chatId);
    }

    if (!forceNew) {
      const loaded = this.load(key);
      if (loaded) {
        const elapsed = Date.now() - loaded.updatedAt.getTime();
        if (elapsed < this.config.sessionTimeout) {
          this.cache.set(key, loaded);
          return loaded;
        }
        return this.createNewSession(key, loaded.channel, loaded.chatId);
      }
    }

    const [channel, chatId] = key.split(':');
    const session = this.createNewSession(key, channel, chatId);
    this.cache.set(key, session);
    return session;
  }

  /** 创建新会话 */
  private createNewSession(key: SessionKey, channel: string, chatId: string): Session {
    const now = Date.now();
    const session: Session = {
      key, channel, chatId,
      messages: [],
      createdAt: new Date(now),
      updatedAt: new Date(now),
      lastConsolidated: 0,
    };

    // 保存到数据库
    if (this.db) {
      this.db.run(`
        INSERT OR REPLACE INTO sessions (key, channel, chat_id, created_at, updated_at, last_consolidated)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [key, channel, chatId, now, now, 0]);
    }

    this.cache.set(key, session);
    log.debug('创建新会话', { key, channel, chatId });
    return session;
  }

  /** 获取会话（仅获取，不创建） */
  get(key: SessionKey): Session | null {
    const cached = this.cache.get(key);
    if (cached) return cached;
    return this.load(key);
  }

  /** 加载会话 */
  private load(key: SessionKey): Session | null {
    if (!this.db) return null;

    try {
      // 加载元数据
      const metaRow = this.db.query<{
        channel: string;
        chat_id: string;
        created_at: number;
        updated_at: number;
        last_consolidated: number;
      }, [string]>(`
        SELECT channel, chat_id, created_at, updated_at, last_consolidated
        FROM sessions WHERE key = ?
      `).get(key);

      if (!metaRow) return null;

      // 加载消息
      const msgRows = this.db.query<{ message_json: string }, [string]>(`
        SELECT message_json FROM messages
        WHERE session_key = ?
        ORDER BY seq_num ASC
      `).all(key);

      const messages: SessionMessage[] = msgRows.map(row => 
        JSON.parse(row.message_json) as SessionMessage
      );

      return {
        key,
        channel: metaRow.channel,
        chatId: metaRow.chat_id,
        messages,
        createdAt: new Date(metaRow.created_at),
        updatedAt: new Date(metaRow.updated_at),
        lastConsolidated: metaRow.last_consolidated,
      };
    } catch (e) {
      log.error('加载会话失败', { key, error: e });
      return null;
    }
  }

  /** 保存会话元数据 */
  save(session: Session): void {
    if (!this.db) return;

    const now = Date.now();

    this.db.run(`
      INSERT OR REPLACE INTO sessions (key, channel, chat_id, created_at, updated_at, last_consolidated)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [
      session.key,
      session.channel,
      session.chatId,
      session.createdAt.getTime(),
      now,
      session.lastConsolidated,
    ]);

    session.updatedAt = new Date(now);
    this.cache.set(session.key, session);
  }

  /** 追加消息到会话 */
  appendMessage(key: SessionKey, message: SessionMessage): void {
    if (!this.db) return;

    const session = this.getOrCreate(key);
    const seqNum = session.messages.length;
    session.messages.push(message);
    session.updatedAt = new Date();

    // 插入消息
    this.db.run(`
      INSERT INTO messages (session_key, seq_num, message_json, timestamp)
      VALUES (?, ?, ?, ?)
    `, [key, seqNum, JSON.stringify(message), message.timestamp]);

    // 更新会话时间
    this.save(session);
  }

  /** 添加消息 */
  addMessage(key: SessionKey, role: 'user' | 'assistant' | 'system', content: string | ContentPart[]): void {
    this.appendMessage(key, { role, content, timestamp: Date.now() });
  }

  /** 获取消息历史（LLM 格式） */
  getHistory(key: SessionKey, maxMessages = 500): Array<{ role: string; content: string }> {
    const session = this.getOrCreate(key);
    const messages = session.messages.slice(-maxMessages);
    
    return messages.map(m => ({
      role: m.role,
      content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
    }));
  }

  /** 清空会话消息 */
  clear(key: SessionKey): void {
    if (!this.db) return;

    const session = this.getOrCreate(key);
    session.messages = [];
    session.updatedAt = new Date();
    session.lastConsolidated = 0;

    // 删除消息
    this.db.run(`DELETE FROM messages WHERE session_key = ?`, [key]);
    
    // 更新元数据
    this.save(session);
  }

  /**
   * 裁剪旧消息（保留最近的 N 条）
   * @param key 会话键
   * @param deleteCount 要删除的旧消息数量
   */
  trimOldMessages(key: SessionKey, deleteCount: number): void {
    if (!this.db || deleteCount <= 0) return;

    // 删除最旧的 N 条消息
    this.db.run(`
      DELETE FROM messages 
      WHERE session_key = ? 
      AND id IN (
        SELECT id FROM messages 
        WHERE session_key = ? 
        ORDER BY seq_num ASC 
        LIMIT ?
      )
    `, [key, key, deleteCount]);

    // 重新编号 seq_num（保持连续）
    this.db.run(`
      UPDATE messages SET seq_num = (
        SELECT COUNT(*) FROM messages m2 
        WHERE m2.session_key = messages.session_key 
        AND m2.id <= messages.id
      ) - 1
      WHERE session_key = ?
    `, [key]);

    // 更新缓存
    const session = this.cache.get(key);
    if (session) {
      session.messages = session.messages.slice(deleteCount);
    }

    log.debug('裁剪旧消息', { key, deleteCount });
  }

  /** 删除会话 */
  delete(key: SessionKey): void {
    if (!this.db) return;

    // 删除消息（级联删除）
    this.db.run(`DELETE FROM messages WHERE session_key = ?`, [key]);
    
    // 删除会话
    this.db.run(`DELETE FROM sessions WHERE key = ?`, [key]);
    
    this.cache.delete(key);
  }

  /** 获取所有会话键 */
  getAllKeys(): SessionKey[] {
    if (!this.db) return [];

    const rows = this.db.query<{ key: string }, []>(`
      SELECT key FROM sessions ORDER BY updated_at DESC
    `).all();

    return rows.map(r => r.key as SessionKey);
  }

  /** 获取最近活跃的会话 */
  getRecentSessions(limit = 10): Session[] {
    if (!this.db) return [];

    const rows = this.db.query<{
      key: string;
      channel: string;
      chat_id: string;
      created_at: number;
      updated_at: number;
      last_consolidated: number;
    }, [number]>(`
      SELECT key, channel, chat_id, created_at, updated_at, last_consolidated
      FROM sessions
      ORDER BY updated_at DESC
      LIMIT ?
    `).all(limit);

    return rows.map(row => ({
      key: row.key as SessionKey,
      channel: row.channel,
      chatId: row.chat_id,
      messages: [], // 不加载消息，仅元数据
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      lastConsolidated: row.last_consolidated,
    }));
  }

  /** 更新整合计数 */
  updateConsolidated(key: SessionKey, count: number): void {
    if (!this.db) return;

    this.db.run(`
      UPDATE sessions SET last_consolidated = ? WHERE key = ?
    `, [count, key]);

    const session = this.cache.get(key);
    if (session) {
      session.lastConsolidated = count;
    }
  }

  /** 清理过期会话 */
  cleanup(maxAge = 7 * 24 * 60 * 60 * 1000): number {
    if (!this.db) return 0;

    const cutoff = Date.now() - maxAge;
    
    // 获取过期会话键
    const rows = this.db.query<{ key: string }, [number]>(`
      SELECT key FROM sessions WHERE updated_at < ?
    `).all(cutoff);

    // 删除过期会话
    for (const row of rows) {
      this.delete(row.key as SessionKey);
    }

    if (rows.length > 0) {
      log.info('清理过期会话', { count: rows.length });
    }

    return rows.length;
  }

  /** 关闭数据库 */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = undefined;
    }
  }
}
