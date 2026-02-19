import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { SessionStore, type Session, type SessionMessage } from '../../src/core/storage/session/store';

describe('SessionStore', () => {
  let db: Database;
  let store: SessionStore;

  beforeEach(() => {
    db = new Database(':memory:');
    db.run(`
      CREATE TABLE sessions (
        key TEXT PRIMARY KEY,
        channel TEXT NOT NULL,
        chat_id TEXT NOT NULL,
        messages TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        last_active_at INTEGER NOT NULL
      )
    `);
    store = new SessionStore(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('CRUD 操作', () => {
    it('should create and retrieve session', () => {
      store.addMessage('feishu:123', 'user', 'Hello');
      const session = store.get('feishu:123');
      
      expect(session).not.toBeNull();
      expect(session?.channel).toBe('feishu');
      expect(session?.chatId).toBe('123');
      expect(session?.messages).toHaveLength(1);
    });

    it('should return null for non-existent session', () => {
      const session = store.get('feishu:nonexistent');
      expect(session).toBeNull();
    });

    it('should delete session', () => {
      store.addMessage('feishu:123', 'user', 'Hello');
      store.delete('feishu:123');
      
      const session = store.get('feishu:123');
      expect(session).toBeNull();
    });

    it('should add multiple messages', () => {
      store.addMessage('feishu:123', 'user', 'Hello');
      store.addMessage('feishu:123', 'assistant', 'Hi there!');
      
      const session = store.get('feishu:123');
      expect(session?.messages).toHaveLength(2);
      expect(session?.messages[0].role).toBe('user');
      expect(session?.messages[1].role).toBe('assistant');
    });
  });

  describe('消息数量限制', () => {
    it('should limit messages to 50', () => {
      for (let i = 0; i < 60; i++) {
        store.addMessage('feishu:123', 'user', `Message ${i}`);
      }
      
      const session = store.get('feishu:123');
      expect(session?.messages).toHaveLength(50);
      
      // 验证保留最新的 50 条
      expect(session?.messages[0].content).toBe('Message 10');
      expect(session?.messages[49].content).toBe('Message 59');
    });
  });

  describe('过期清理', () => {
    it('should cleanup expired sessions', () => {
      const now = Date.now();
      const oldTime = now - 25 * 60 * 60 * 1000; // 25 小时前
      
      // 手动插入过期会话
      db.run(`
        INSERT INTO sessions (key, channel, chat_id, messages, created_at, last_active_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `, ['feishu:old', 'feishu', 'old', '[]', oldTime, oldTime]);
      
      // 插入活跃会话
      store.addMessage('feishu:active', 'user', 'Hello');
      
      const cleaned = store.cleanup();
      expect(cleaned).toBe(1);
      
      expect(store.get('feishu:old')).toBeNull();
      expect(store.get('feishu:active')).not.toBeNull();
    });
  });
});
