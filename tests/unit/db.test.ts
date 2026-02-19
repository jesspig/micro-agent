import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { existsSync, rmSync } from 'fs';
import { join, homedir } from 'path';
import { DatabaseManager, DEFAULT_DB_CONFIG } from '../../src/db/manager';

const TEST_DATA_DIR = join(import.meta.dir, '__db_test__');

describe('DatabaseManager', () => {
  let dbManager: DatabaseManager;

  beforeEach(() => {
    dbManager = new DatabaseManager({
      dataDir: TEST_DATA_DIR,
      sessionsDb: join(TEST_DATA_DIR, 'sessions.db'),
      cronDb: join(TEST_DATA_DIR, 'cron.db'),
      memoryDb: join(TEST_DATA_DIR, 'memory.db'),
    });
  });

  afterEach(() => {
    dbManager?.close();
    if (existsSync(TEST_DATA_DIR)) {
      rmSync(TEST_DATA_DIR, { recursive: true, force: true });
    }
  });

  describe('init', () => {
    it('should create data directory', () => {
      dbManager.init();
      expect(existsSync(TEST_DATA_DIR)).toBe(true);
    });

    it('should create database files', () => {
      dbManager.init();
      expect(existsSync(join(TEST_DATA_DIR, 'sessions.db'))).toBe(true);
      expect(existsSync(join(TEST_DATA_DIR, 'cron.db'))).toBe(true);
      expect(existsSync(join(TEST_DATA_DIR, 'memory.db'))).toBe(true);
    });

    it('should create tables', () => {
      dbManager.init();
      const db = dbManager.getSessionsDb();
      const tables = db
        .query<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table'")
        .all();
      expect(tables.some(t => t.name === 'sessions')).toBe(true);
    });
  });

  describe('getSessionsDb', () => {
    it('should throw before init', () => {
      expect(() => dbManager.getSessionsDb()).toThrow('数据库未初始化');
    });

    it('should return database after init', () => {
      dbManager.init();
      const db = dbManager.getSessionsDb();
      expect(db).toBeDefined();
    });
  });

  describe('close', () => {
    it('should close all connections', () => {
      dbManager.init();
      dbManager.close();
      expect(() => dbManager.getSessionsDb()).toThrow('数据库未初始化');
    });
  });

  describe('table structures', () => {
    it('should have correct sessions table columns', () => {
      dbManager.init();
      const db = dbManager.getSessionsDb();
      const info = db.query('PRAGMA table_info(sessions)').all() as { name: string }[];
      const columns = info.map(col => col.name);
      expect(columns).toContain('key');
      expect(columns).toContain('channel');
      expect(columns).toContain('chat_id');
      expect(columns).toContain('messages');
    });

    it('should have correct cron_jobs table columns', () => {
      dbManager.init();
      const db = dbManager.getCronDb();
      const info = db.query('PRAGMA table_info(cron_jobs)').all() as { name: string }[];
      const columns = info.map(col => col.name);
      expect(columns).toContain('id');
      expect(columns).toContain('name');
      expect(columns).toContain('schedule_kind');
    });

    it('should have correct memories table columns', () => {
      dbManager.init();
      const db = dbManager.getMemoryDb();
      const info = db.query('PRAGMA table_info(memories)').all() as { name: string }[];
      const columns = info.map(col => col.name);
      expect(columns).toContain('id');
      expect(columns).toContain('type');
      expect(columns).toContain('date');
    });
  });
});
