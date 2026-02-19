/**
 * 会话存储 - JSONL 格式
 * 
 * 会话以 JSONL 格式存储在 ~/.microbot/sessions/ 目录
 * 每个会话一个文件，格式：
 *   第一行：元数据 {"_type":"metadata",...}
 *   后续行：消息 {"role":"user","content":"...",...}
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, readdirSync } from 'fs';
import { resolve, join } from 'path';
import { homedir } from 'os';
import type { SessionKey } from '../../bus/events';
import type { ContentPart } from '../../providers/base';

/** 会话消息 */
export interface SessionMessage {
  role: 'user' | 'assistant' | 'system';
  content: string | ContentPart[];
  timestamp: number;
  /** 工具调用（可选） */
  tool_calls?: unknown;
  /** 工具调用 ID（可选） */
  tool_call_id?: string;
  /** 工具名称（可选） */
  name?: string;
}

/** 会话元数据 */
interface SessionMetadata {
  _type: 'metadata';
  channel: string;
  chatId: string;
  createdAt: string;
  updatedAt: string;
  /** 已整合的消息数量 */
  lastConsolidated: number;
}

/** 会话数据 */
export interface Session {
  key: SessionKey;
  channel: string;
  chatId: string;
  messages: SessionMessage[];
  createdAt: Date;
  updatedAt: Date;
  lastConsolidated: number;
}

/** 会话存储配置 */
interface SessionStoreConfig {
  /** 会话目录 */
  sessionsDir: string;
  /** 最大消息数 */
  maxMessages: number;
  /** 会话超时时间（毫秒），超过此时间创建新会话 */
  sessionTimeout: number;
}

const DEFAULT_CONFIG: SessionStoreConfig = {
  sessionsDir: '~/.microbot/sessions',
  maxMessages: 500,
  sessionTimeout: 30 * 60 * 1000, // 30 分钟
};

/**
 * 安全文件名
 */
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
    // 检查缓存
    const cached = this.cache.get(key);
    if (cached && !forceNew) {
      // 检查是否超时
      const elapsed = Date.now() - cached.updatedAt.getTime();
      if (elapsed < this.config.sessionTimeout) {
        return cached;
      }
      // 超时，保存旧会话（写入文件），然后创建新会话
      this.save(cached);
      // 创建新会话（清空消息，重置时间）
      const newSession: Session = {
        key,
        channel: cached.channel,
        chatId: cached.chatId,
        messages: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        lastConsolidated: 0,
      };
      // 写入空文件（覆盖旧会话）
      this.save(newSession);
      this.cache.set(key, newSession);
      return newSession;
    }

    // 加载或创建（仅在非强制新建时）
    if (!forceNew) {
      const loaded = this.load(key);
      if (loaded) {
        const elapsed = Date.now() - loaded.updatedAt.getTime();
        if (elapsed < this.config.sessionTimeout) {
          this.cache.set(key, loaded);
          return loaded;
        }
        // 超时，创建新会话覆盖旧会话
        const newSession: Session = {
          key,
          channel: loaded.channel,
          chatId: loaded.chatId,
          messages: [],
          createdAt: new Date(),
          updatedAt: new Date(),
          lastConsolidated: 0,
        };
        this.save(newSession);
        this.cache.set(key, newSession);
        return newSession;
      }
    }

    // 创建新会话
    const [channel, chatId] = key.split(':');
    const session: Session = {
      key,
      channel,
      chatId,
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      lastConsolidated: 0,
    };
    this.cache.set(key, session);
    return session;
  }

  /**
   * 获取会话（仅获取，不创建）
   */
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
        // 旧格式，创建默认元数据
        const [channel, chatId] = key.split(':');
        metadata = {
          _type: 'metadata',
          channel,
          chatId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          lastConsolidated: 0,
        };
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
      console.error(`加载会话失败: ${key}`, e);
      return null;
    }
  }

  /**
   * 保存会话
   */
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

  /**
   * 追加消息到会话
   * 直接追加到文件，避免重写整个文件
   */
  appendMessage(key: SessionKey, message: SessionMessage): void {
    const session = this.getOrCreate(key);
    session.messages.push(message);
    session.updatedAt = new Date();

    // 直接追加到文件
    const path = this.getSessionPath(key);
    if (!existsSync(path)) {
      // 新文件，写入元数据
      this.save(session);
      return;
    }

    // 追加消息
    appendFileSync(path, JSON.stringify(message) + '\n', 'utf-8');
    
    // 更新元数据行
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

  /**
   * 添加消息
   */
  addMessage(key: SessionKey, role: 'user' | 'assistant' | 'system', content: string | ContentPart[]): void {
    this.appendMessage(key, {
      role,
      content,
      timestamp: Date.now(),
    });
  }

  /**
   * 获取消息历史（LLM 格式）
   */
  getHistory(key: SessionKey, maxMessages = 500): Array<{ role: string; content: string }> {
    const session = this.getOrCreate(key);
    const messages = session.messages.slice(-maxMessages);
    
    return messages.map(m => {
      const entry: { role: string; content: string; tool_calls?: unknown; tool_call_id?: string; name?: string } = {
        role: m.role,
        content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
      };
      // 保留工具调用元数据
      if (m.tool_calls) entry.tool_calls = m.tool_calls;
      if (m.tool_call_id) entry.tool_call_id = m.tool_call_id;
      if (m.name) entry.name = m.name;
      return entry;
    });
  }

  /**
   * 清除会话缓存
   */
  invalidate(key: SessionKey): void {
    this.cache.delete(key);
  }

  /**
   * 删除会话
   */
  delete(key: SessionKey): void {
    const path = this.getSessionPath(key);
    if (existsSync(path)) {
      const { unlinkSync } = require('fs');
      unlinkSync(path);
    }
    this.cache.delete(key);
  }

  /**
   * 清空会话消息
   */
  clear(key: SessionKey): void {
    const session = this.getOrCreate(key, true);
    session.messages = [];
    session.lastConsolidated = 0;
    session.createdAt = new Date();
    session.updatedAt = new Date();
    this.save(session);
  }

  /**
   * 列出所有会话
   */
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