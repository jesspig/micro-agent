import { Database } from 'bun:sqlite';
import { mkdirSync, existsSync } from 'fs';
import { resolve } from 'path';
import { homedir } from 'os';
import type { DatabaseConfig } from '../core/types/interfaces';

/** 默认数据库配置 */
export const DEFAULT_DB_CONFIG: DatabaseConfig = {
  dataDir: '~/.microbot/data',
  sessionsDb: '~/.microbot/data/sessions.db',
  cronDb: '~/.microbot/data/cron.db',
  memoryDb: '~/.microbot/data/memory.db',
};

/**
 * 数据库管理器
 * 
 * 管理三个 SQLite 数据库：sessions、cron、memory
 */
export class DatabaseManager {
  private sessions: Database | null = null;
  private cron: Database | null = null;
  private memory: Database | null = null;

  constructor(private config: DatabaseConfig = DEFAULT_DB_CONFIG) {}

  /** 初始化所有数据库 */
  init(): void {
    const dataDir = this.expandPath(this.config.dataDir);
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }

    this.sessions = new Database(this.expandPath(this.config.sessionsDb));
    this.cron = new Database(this.expandPath(this.config.cronDb));
    this.memory = new Database(this.expandPath(this.config.memoryDb));

    this.createTables();
  }

  /** 创建表结构 */
  private createTables(): void {
    // 会话表
    this.sessions?.run(`
      CREATE TABLE IF NOT EXISTS sessions (
        key TEXT PRIMARY KEY,
        channel TEXT NOT NULL,
        chat_id TEXT NOT NULL,
        messages TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        last_active_at INTEGER NOT NULL
      )
    `);
    this.sessions?.run(
      'CREATE INDEX IF NOT EXISTS idx_sessions_last_active ON sessions(last_active_at)'
    );

    // Cron 任务表
    this.cron?.run(`
      CREATE TABLE IF NOT EXISTS cron_jobs (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        enabled INTEGER NOT NULL,
        schedule_kind TEXT NOT NULL,
        schedule_value TEXT,
        message TEXT NOT NULL,
        channel TEXT,
        to_address TEXT,
        next_run_at INTEGER,
        last_run_at INTEGER,
        last_status TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    // 记忆索引表
    this.memory?.run(`
      CREATE TABLE IF NOT EXISTS memories (
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
    this.memory?.run(
      'CREATE INDEX IF NOT EXISTS idx_memories_date ON memories(date)'
    );
    this.memory?.run(
      'CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type)'
    );
  }

  /** 展开路径 */
  private expandPath(path: string): string {
    if (path.startsWith('~/')) {
      return resolve(homedir(), path.slice(2));
    }
    return resolve(path);
  }

  getSessionsDb(): Database {
    return this.getDb('sessions');
  }

  getCronDb(): Database {
    return this.getDb('cron');
  }

  getMemoryDb(): Database {
    return this.getDb('memory');
  }

  private getDb(name: 'sessions' | 'cron' | 'memory'): Database {
    const db = this[name];
    if (!db) {
      throw new Error(`数据库未初始化: ${name}`);
    }
    return db;
  }

  /** 关闭所有数据库连接 */
  close(): void {
    this.sessions?.close();
    this.cron?.close();
    this.memory?.close();
    this.sessions = null;
    this.cron = null;
    this.memory = null;
  }
}
