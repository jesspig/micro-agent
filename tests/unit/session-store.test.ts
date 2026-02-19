import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { SessionStore } from '@microbot/core/storage';

const TEST_DIR = join(homedir(), '.microbot', 'test-sessions');

describe('SessionStore', () => {
  let store: SessionStore;

  beforeEach(() => {
    // 清理测试目录
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
    
    store = new SessionStore({
      sessionsDir: TEST_DIR,
      sessionTimeout: 100, // 100ms 方便测试超时
    });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
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

  describe('会话超时', () => {
    it('should create new session after timeout', () => {
      // 创建第一个会话
      const session1 = store.getOrCreate('feishu:123');
      session1.messages.push({ role: 'user', content: 'First', timestamp: Date.now() });
      store.save(session1);
      
      // 模拟超时：使用新的 store 实例，并设置很长的超时时间
      const store2 = new SessionStore({
        sessionsDir: TEST_DIR,
        sessionTimeout: 1, // 1ms 超时
      });
      
      // 等待超时
      const start = Date.now();
      while (Date.now() - start < 10) {
        // busy wait
      }
      
      // 获取会话应该是新的（因为超时）
      const session2 = store2.getOrCreate('feishu:123');
      expect(session2.messages).toHaveLength(0);
    });

    it('should reuse session within timeout', () => {
      const session1 = store.getOrCreate('feishu:123');
      session1.messages.push({ role: 'user', content: 'First', timestamp: Date.now() });
      store.save(session1);
      
      // 立即获取应该是同一个会话
      const session2 = store.getOrCreate('feishu:123');
      expect(session2.messages).toHaveLength(1);
    });
  });

  describe('JSONL 格式', () => {
    it('should persist session to JSONL file', () => {
      store.addMessage('feishu:123', 'user', 'Hello');
      store.addMessage('feishu:123', 'assistant', 'Hi!');
      
      const session = store.get('feishu:123');
      expect(session).not.toBeNull();
      expect(session?.messages).toHaveLength(2);
    });

    it('should load existing session from file', () => {
      // 创建会话
      store.addMessage('feishu:123', 'user', 'Hello');
      
      // 创建新的 store 实例
      const store2 = new SessionStore({ sessionsDir: TEST_DIR, sessionTimeout: 60000 });
      const session = store2.get('feishu:123');
      
      expect(session).not.toBeNull();
      expect(session?.messages).toHaveLength(1);
      expect(session?.messages[0].content).toBe('Hello');
    });
  });

  describe('历史记录', () => {
    it('should get history in LLM format', () => {
      store.addMessage('feishu:123', 'user', 'Hello');
      store.addMessage('feishu:123', 'assistant', 'Hi there!');
      
      const history = store.getHistory('feishu:123');
      expect(history).toHaveLength(2);
      expect(history[0].role).toBe('user');
      expect(history[0].content).toBe('Hello');
    });

    it('should limit history length', () => {
      // 使用长超时时间的 store
      const longTimeoutStore = new SessionStore({
        sessionsDir: TEST_DIR,
        sessionTimeout: 60000, // 60 秒
      });
      
      for (let i = 0; i < 50; i++) {
        longTimeoutStore.addMessage('feishu:456', 'user', `Message ${i}`);
      }
      
      const history = longTimeoutStore.getHistory('feishu:456', 20);
      expect(history).toHaveLength(20);
    });
  });

  describe('清空会话', () => {
    it('should clear session messages', () => {
      store.addMessage('feishu:123', 'user', 'Hello');
      store.clear('feishu:123');
      
      const session = store.get('feishu:123');
      expect(session?.messages).toHaveLength(0);
    });
  });
});
