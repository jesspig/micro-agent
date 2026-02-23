/**
 * 会话存储 - JSONL 格式
 * 
 * 会话以 JSONL 格式存储在 ~/.microbot/sessions/ 目录
 * 每个会话一个文件，格式：
 *   第一行：元数据 {"_type":"metadata",...}
 *   后续行：消息 {"role":"user","content":"...",...}
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, readdirSync, unlinkSync } from 'fs';
import { resolve, join } from 'path';
import { homedir } from 'os';
import { getLogger } from '@logtape/logtape';
import type { SessionKey, ContentPart } from '@microbot/types';
import type { SessionMessage, SessionMetadata, Session, SessionStoreConfig } from './types';

const log = getLogger(['session']);

const DEFAULT_CONFIG: SessionStoreConfig = {
  sessionsDir: '~/.microbot/sessions',
  maxMessages: 500,
  sessionTimeout: 30 * 60 * 1000, // 30 分钟
};

/** 安全文件名 */
function safeFilename(key: string): string {
  return key.replace(/[:/\\?%*:|"<>]/g, '_');
}

/**
 * 会话存储
 * 
 * 基于 JSONL 的会话管理，支持：
 * - 会话超时自动创建新会话
 * - 消息追加写入
 * - 元数据跟踪
 */
export class SessionStore {
  private config: SessionStoreConfig;
  private cache = new Map<string, Session>();

  constructor(config?: Partial<SessionStoreConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.ensureDir();
  }

  /** 确保会话目录存在 */
  private ensureDir(): void {
    const dir = this.expandPath(this.config.sessionsDir);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  /** 展开路径 */
  private expandPath(path: string): string {
    if (path.startsWith('~/')) {
      return resolve(homedir(), path.slice(2));
    }
    return resolve(path);
  }

  /** 获取会话文件路径 */
  private getSessionPath(key: string): string {
    const safeKey = safeFilename(key);
    return join(this.expandPath(this.config.sessionsDir), `${safeKey}.jsonl`);
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
    const session: Session = {
      key, channel, chatId,
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      lastConsolidated: 0,
    };
    this.save(session);
    this.cache.set(key, session);
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
    const path = this.getSessionPath(key);
    if (!existsSync(path)) return null;

    try {
      const content = readFileSync(path, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim());
      
      let metadata: SessionMetadata | null = null;
      const messages: SessionMessage[] = [];

      for (const line of lines) {
        const data = JSON.parse(line);
        if (data._type === 'metadata') {
          metadata = data as SessionMetadata;
        } else {
          messages.push(data as SessionMessage);
        }
      }

      if (!metadata) {
        const [channel, chatId] = key.split(':');
        metadata = this.createDefaultMetadata(channel, chatId);
      }

      return {
        key,
        channel: metadata.channel,
        chatId: metadata.chatId,
        messages,
        createdAt: new Date(metadata.createdAt),
        updatedAt: new Date(metadata.updatedAt),
        lastConsolidated: metadata.lastConsolidated,
      };
    } catch (e) {
      log.error('加载会话失败: {key}', { key, error: e });
      return null;
    }
  }

  /** 创建默认元数据 */
  private createDefaultMetadata(channel: string, chatId: string): SessionMetadata {
    return {
      _type: 'metadata',
      channel, chatId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastConsolidated: 0,
    };
  }

  /** 保存会话 */
  save(session: Session): void {
    const path = this.getSessionPath(session.key);
    const now = new Date();

    const metadata: SessionMetadata = {
      _type: 'metadata',
      channel: session.channel,
      chatId: session.chatId,
      createdAt: session.createdAt.toISOString(),
      updatedAt: now.toISOString(),
      lastConsolidated: session.lastConsolidated,
    };

    const lines: string[] = [JSON.stringify(metadata)];
    for (const msg of session.messages) {
      lines.push(JSON.stringify(msg));
    }

    writeFileSync(path, lines.join('\n') + '\n', 'utf-8');
    session.updatedAt = now;
    this.cache.set(session.key, session);
  }

  /** 追加消息到会话 */
  appendMessage(key: SessionKey, message: SessionMessage): void {
    const session = this.getOrCreate(key);
    session.messages.push(message);
    session.updatedAt = new Date();

    const path = this.getSessionPath(key);
    if (!existsSync(path)) {
      this.save(session);
      return;
    }

    appendFileSync(path, JSON.stringify(message) + '\n', 'utf-8');
    this.updateMetadata(path, session);
  }

  /** 更新元数据行 */
  private updateMetadata(path: string, session: Session): void {
    const content = readFileSync(path, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim());
    
    if (lines.length === 0) {
      this.save(session);
      return;
    }

    const metadata: SessionMetadata = {
      _type: 'metadata',
      channel: session.channel,
      chatId: session.chatId,
      createdAt: session.createdAt.toISOString(),
      updatedAt: new Date().toISOString(),
      lastConsolidated: session.lastConsolidated,
    };

    lines[0] = JSON.stringify(metadata);
    writeFileSync(path, lines.join('\n') + '\n', 'utf-8');
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

  /** 清除会话缓存 */
  invalidate(key: SessionKey): void {
    this.cache.delete(key);
  }

  /** 删除会话 */
  delete(key: SessionKey): void {
    const path = this.getSessionPath(key);
    if (existsSync(path)) {
      unlinkSync(path);
    }
    this.cache.delete(key);
  }

  /** 清空会话消息 */
  clear(key: SessionKey): void {
    const session = this.getOrCreate(key, true);
    session.messages = [];
    session.lastConsolidated = 0;
    session.createdAt = new Date();
    session.updatedAt = new Date();
    this.save(session);
  }

  /** 列出所有会话 */
  list(): Array<{ key: string; createdAt: string; updatedAt: string; messageCount: number }> {
    const dir = this.expandPath(this.config.sessionsDir);
    if (!existsSync(dir)) return [];

    const sessions: Array<{ key: string; createdAt: string; updatedAt: string; messageCount: number }> = [];

    for (const file of readdirSync(dir)) {
      if (!file.endsWith('.jsonl')) continue;

      try {
        const path = join(dir, file);
        const content = readFileSync(path, 'utf-8');
        const lines = content.split('\n').filter(line => line.trim());
        
        if (lines.length === 0) continue;

        const firstLine = JSON.parse(lines[0]);
        if (firstLine._type !== 'metadata') continue;

        sessions.push({
          key: file.replace('.jsonl', '').replace(/_/g, ':'),
          createdAt: firstLine.createdAt,
          updatedAt: firstLine.updatedAt,
          messageCount: lines.length - 1,
        });
      } catch {
        continue;
      }
    }

    return sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
}
