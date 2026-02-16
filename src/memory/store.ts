import type { Database } from 'bun:sqlite';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

/** 记忆类型 */
export type MemoryType = 'diary' | 'longterm';

/** 记忆条目 */
export interface MemoryEntry {
  /** 主键 ID */
  id?: number;
  /** 记忆类型 */
  type: MemoryType;
  /** 日期（YYYY-MM-DD），仅 diary */
  date?: string;
  /** 标题 */
  title?: string;
  /** 摘要 */
  summary?: string;
  /** Markdown 文件路径 */
  filePath?: string;
  /** 创建时间（ms） */
  createdAt: number;
  /** 更新时间（ms） */
  updatedAt: number;
}

/**
 * 记忆存储
 * 
 * 使用 SQLite 存储索引，Markdown 文件存储内容。
 */
export class MemoryStore {
  constructor(
    private db: Database,
    private workspacePath: string
  ) {
    this.ensureMemoryDir();
  }

  /** 确保记忆目录存在 */
  private ensureMemoryDir(): void {
    const memoryDir = join(this.workspacePath, 'memory');
    if (!existsSync(memoryDir)) {
      mkdirSync(memoryDir, { recursive: true });
    }
  }

  /**
   * 读取今日日记
   * @returns 日记内容，不存在则返回空字符串
   */
  readToday(): string {
    const date = this.formatDate(new Date());
    const filePath = this.getDiaryPath(date);
    return existsSync(filePath) ? readFileSync(filePath, 'utf-8') : '';
  }

  /**
   * 追加到今日日记
   * @param content - 要追加的内容
   */
  appendToday(content: string): void {
    const date = this.formatDate(new Date());
    const filePath = this.getDiaryPath(date);
    const existing = existsSync(filePath) ? readFileSync(filePath, 'utf-8') : '';
    writeFileSync(filePath, existing + content + '\n');
    this.updateIndex('diary', date, content.slice(0, 100));
  }

  /**
   * 读取长期记忆
   * @returns 长期记忆内容，不存在则返回空字符串
   */
  readLongTerm(): string {
    const filePath = join(this.workspacePath, 'memory', 'MEMORY.md');
    return existsSync(filePath) ? readFileSync(filePath, 'utf-8') : '';
  }

  /**
   * 写入长期记忆
   * @param content - 长期记忆内容
   */
  writeLongTerm(content: string): void {
    const filePath = join(this.workspacePath, 'memory', 'MEMORY.md');
    writeFileSync(filePath, content);
    this.updateIndex('longterm', undefined, content.slice(0, 100));
  }

  /**
   * 获取最近 N 天记忆
   * @param days - 天数
   * @returns 记忆条目列表
   */
  getRecent(days: number): MemoryEntry[] {
    const rows = this.db.query<MemoryEntry, [number]>(`
      SELECT id, type, date, title, summary, file_path as filePath, 
             created_at as createdAt, updated_at as updatedAt
      FROM memories 
      WHERE type = 'diary' AND date >= date('now', '-' || $days || ' days')
      ORDER BY date DESC
    `).all(days);

    return rows;
  }

  /** 格式化日期为 YYYY-MM-DD */
  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  /** 获取日记文件路径 */
  private getDiaryPath(date: string): string {
    return join(this.workspacePath, 'memory', `${date}.md`);
  }

  /** 更新索引 */
  private updateIndex(type: MemoryType, date?: string, summary?: string): void {
    const now = Date.now();
    const filePath = date ? this.getDiaryPath(date) : null;
    this.db.run(`
      INSERT INTO memories (type, date, summary, file_path, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [type, date ?? null, summary ?? null, filePath, now, now]);
  }
}
