import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { mkdirSync, rmSync, existsSync, writeFileSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import { homedir } from 'os';
import { MemoryStore, type MemoryEntry } from '../../src/core/storage/memory/store';

describe('MemoryStore', () => {
  let db: Database;
  let store: MemoryStore;
  const memoryPath = resolve(homedir(), '.microbot/memory');
  const testDate = new Date().toISOString().split('T')[0];
  const diaryFile = join(memoryPath, `${testDate}.md`);
  const longtermFile = join(memoryPath, 'MEMORY.md');
  
  // 保存原始文件内容
  let originalDiary = '';
  let originalLongterm = '';
  let diaryExisted = false;
  let longtermExisted = false;

  beforeEach(() => {
    db = new Database(':memory:');
    db.run(`
      CREATE TABLE memories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        date TEXT,
        title TEXT,
        summary TEXT,
        file_path TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);
    
    // 备份原始文件
    if (existsSync(diaryFile)) {
      originalDiary = readFileSync(diaryFile, 'utf-8');
      diaryExisted = true;
      rmSync(diaryFile, { force: true });
    } else {
      diaryExisted = false;
    }
    
    if (existsSync(longtermFile)) {
      originalLongterm = readFileSync(longtermFile, 'utf-8');
      longtermExisted = true;
      rmSync(longtermFile, { force: true });
    } else {
      longtermExisted = false;
    }
    
    // 确保目录存在
    if (!existsSync(memoryPath)) {
      mkdirSync(memoryPath, { recursive: true });
    }
    
    store = new MemoryStore(db);
  });

  afterEach(() => {
    db.close();
    
    // 恢复原始文件
    if (diaryExisted) {
      writeFileSync(diaryFile, originalDiary);
    } else if (existsSync(diaryFile)) {
      rmSync(diaryFile, { force: true });
    }
    
    if (longtermExisted) {
      writeFileSync(longtermFile, originalLongterm);
    } else if (existsSync(longtermFile)) {
      rmSync(longtermFile, { force: true });
    }
    
    // 重置
    originalDiary = '';
    originalLongterm = '';
    diaryExisted = false;
    longtermExisted = false;
  });

  describe('日记读写', () => {
    it('should return empty string when diary does not exist', () => {
      const content = store.readToday();
      expect(content).toBe('');
    });

    it('should append to diary', () => {
      store.appendToday('## 今日完成\n- 任务 1');
      const content = store.readToday();
      expect(content).toContain('## 今日完成');
      expect(content).toContain('任务 1');
    });

    it('should append multiple times', () => {
      store.appendToday('第一行');
      store.appendToday('第二行');
      const content = store.readToday();
      expect(content).toContain('第一行');
      expect(content).toContain('第二行');
    });
  });

  describe('长期记忆读写', () => {
    it('should return empty string when longterm memory does not exist', () => {
      const content = store.readLongTerm();
      expect(content).toBe('');
    });

    it('should write and read longterm memory', () => {
      store.writeLongTerm('# 长期记忆\n这是重要信息');
      const content = store.readLongTerm();
      expect(content).toContain('长期记忆');
      expect(content).toContain('重要信息');
    });

    it('should overwrite longterm memory', () => {
      store.writeLongTerm('旧内容');
      store.writeLongTerm('新内容');
      const content = store.readLongTerm();
      expect(content).toBe('新内容');
    });
  });

  describe('最近记忆查询', () => {
    it('should return empty array when no memories', () => {
      const memories = store.getRecent(7);
      expect(memories).toHaveLength(0);
    });

    it('should return recent memories', () => {
      store.appendToday('今天的日记');
      const memories = store.getRecent(7);
      expect(memories.length).toBeGreaterThanOrEqual(1);
    });
  });
});