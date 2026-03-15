/**
 * Session 持久化模块
 *
 * 实现 Session 的文件存储和加载
 * - 存储路径：~/.micro-agent/sessions/YYYY-MM-DD.jsonl
 * - 格式：每行一个 JSON 对象
 */

import { join } from "node:path";
import { homedir } from "node:os";
import { appendFile, readFile, writeFile } from "node:fs/promises";
import { existsSync, mkdirSync } from "node:fs";
import type { Message, MessageRole, ToolCall } from "../types.js";

// ============================================================================
// 常量定义
// ============================================================================

/** Session 存储目录 */
export const SESSIONS_DIR = join(homedir(), ".micro-agent", "sessions");

// ============================================================================
// 类型定义
// ============================================================================

/** 持久化的会话条目 */
export interface SessionEntry {
  /** 时间戳 */
  timestamp: number;
  /** 消息角色 */
  role: MessageRole;
  /** 消息内容 */
  content: string;
  /** 可选：工具调用 */
  toolCalls?: ToolCall[];
  /** 可选：工具调用 ID */
  toolCallId?: string;
  /** 可选：工具名称 */
  name?: string;
}

// ============================================================================
// 持久化函数
// ============================================================================

/**
 * 获取当天的 Session 文件路径
 * @param date - 日期，默认为今天
 * @returns 文件绝对路径
 */
export function getSessionFilePath(date?: Date): string {
  const d = date ?? new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const filename = `${year}-${month}-${day}.jsonl`;
  return join(SESSIONS_DIR, filename);
}

/**
 * 确保存储目录存在
 */
export async function ensureSessionsDir(): Promise<void> {
  if (!existsSync(SESSIONS_DIR)) {
    mkdirSync(SESSIONS_DIR, { recursive: true });
  }
}

/**
 * 追加一条消息到 Session 文件
 * @param entry - 会话条目
 */
export async function appendSessionEntry(entry: SessionEntry): Promise<void> {
  await ensureSessionsDir();
  const filePath = getSessionFilePath();
  const line = JSON.stringify(entry) + "\n";
  await appendFile(filePath, line, "utf-8");
}

/**
 * 批量追加消息
 * @param entries - 会话条目数组
 */
export async function appendSessionEntries(entries: SessionEntry[]): Promise<void> {
  if (entries.length === 0) return;

  await ensureSessionsDir();
  const filePath = getSessionFilePath();
  const lines = entries.map((e) => JSON.stringify(e)).join("\n") + "\n";
  await appendFile(filePath, lines, "utf-8");
}

/**
 * 加载指定日期的 Session
 * @param date - 日期，默认为今天
 * @returns 会话条目数组
 */
export async function loadSessionFile(date?: Date): Promise<SessionEntry[]> {
  const filePath = getSessionFilePath(date);

  if (!existsSync(filePath)) {
    return [];
  }

  try {
    const content = await readFile(filePath, "utf-8");
    const lines = content.trim().split("\n").filter(Boolean);
    return lines.map((line) => JSON.parse(line) as SessionEntry);
  } catch {
    // 静默处理加载失败
    return [];
  }
}

/**
 * 加载最近的 Session（按消息数量限制）
 * @param contextWindow - 上下文窗口大小（消息条数），默认 20
 * @param maxDays - 最大加载天数，默认 30 天
 * @returns 会话条目数组（按时间正序排列，最多 contextWindow 条）
 */
export async function loadRecentSessions(contextWindow: number = 20, maxDays: number = 30): Promise<SessionEntry[]> {
  const entries: SessionEntry[] = [];

  // 按天加载，直到达到目标数量或超过最大天数
  for (let i = 0; i < maxDays && entries.length < contextWindow; i++) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dayEntries = await loadSessionFile(date);
    entries.unshift(...dayEntries); // 按时间正序排列
  }

  // 只保留最近 contextWindow 条消息
  if (entries.length > contextWindow) {
    return entries.slice(-contextWindow);
  }

  return entries;
}

/**
 * 清空当天的 Session 文件
 * @param date - 日期，默认为今天
 */
export async function clearSessionFile(date?: Date): Promise<void> {
  const filePath = getSessionFilePath(date);
  if (existsSync(filePath)) {
    await writeFile(filePath, "", "utf-8");
  }
}

/**
 * 将 Message 转换为 SessionEntry
 * @param message - 消息对象
 * @returns 会话条目
 */
export function messageToEntry(message: Message): SessionEntry {
  const entry: SessionEntry = {
    timestamp: message.timestamp ?? Date.now(),
    role: message.role,
    content: message.content,
  };

  // 只有在有值时才添加可选字段
  if (message.toolCalls !== undefined) {
    entry.toolCalls = message.toolCalls;
  }
  if (message.toolCallId !== undefined) {
    entry.toolCallId = message.toolCallId;
  }
  if (message.name !== undefined) {
    entry.name = message.name;
  }

  return entry;
}

/**
 * 将 SessionEntry 转换为 Message
 * @param entry - 会话条目
 * @returns 消息对象
 */
export function entryToMessage(entry: SessionEntry): Message {
  const message: Message = {
    role: entry.role,
    content: entry.content,
    timestamp: entry.timestamp,
  };

  // 只有在有值时才添加可选字段
  if (entry.toolCalls !== undefined) {
    message.toolCalls = entry.toolCalls;
  }
  if (entry.toolCallId !== undefined) {
    message.toolCallId = entry.toolCallId;
  }
  if (entry.name !== undefined) {
    message.name = entry.name;
  }

  return message;
}