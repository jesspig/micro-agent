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
import {
  createTimer,
  sanitize,
  logMethodCall,
  logMethodReturn,
  logMethodError,
  createDefaultLogger,
} from "../logger/index.js";

const logger = createDefaultLogger("debug", ["runtime", "session", "persistence"]);

// ============================================================================
// 常量定义
// ============================================================================

/** 模块名称 */
const MODULE_NAME = "SessionPersistence";

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
  const timer = createTimer();
  const module = MODULE_NAME;
  const method = "getSessionFilePath";
  logMethodCall(logger, { method, module, params: { date } });

  try {
    const d = date ?? new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const filename = `${year}-${month}-${day}.jsonl`;
    const result = join(SESSIONS_DIR, filename);

    logMethodReturn(logger, {
      method,
      module,
      result: sanitize({ filePath: result }),
      duration: timer(),
    });
    return result;
  } catch (err: unknown) {
    const error = err as Error;
    logMethodError(logger, {
      method,
      module,
      error: {
        name: error.name,
        message: error.message,
        ...(error.stack ? { stack: error.stack } : {}),
      },
      params: { date },
      duration: timer(),
    });
    throw err;
  }
}

/**
 * 确保存储目录存在
 */
export async function ensureSessionsDir(): Promise<void> {
  const timer = createTimer();
  const module = MODULE_NAME;
  const method = "ensureSessionsDir";
  logMethodCall(logger, { method, module, params: {} });

  try {
    if (!existsSync(SESSIONS_DIR)) {
      mkdirSync(SESSIONS_DIR, { recursive: true });
      logger.info("会话目录已创建", { path: SESSIONS_DIR });
    }

    logMethodReturn(logger, {
      method,
      module,
      result: sanitize({ path: SESSIONS_DIR }),
      duration: timer(),
    });
  } catch (err: unknown) {
    const error = err as Error;
    logMethodError(logger, {
      method,
      module,
      error: {
        name: error.name,
        message: error.message,
        ...(error.stack ? { stack: error.stack } : {}),
      },
      params: {},
      duration: timer(),
    });
    throw err;
  }
}

/**
 * 追加一条消息到 Session 文件
 * @param entry - 会话条目
 */
export async function appendSessionEntry(entry: SessionEntry): Promise<void> {
  const timer = createTimer();
  const module = MODULE_NAME;
  const method = "appendSessionEntry";
  logMethodCall(logger, {
    method,
    module,
    params: { role: entry.role, timestamp: entry.timestamp },
  });

  try {
    await ensureSessionsDir();
    const filePath = getSessionFilePath();
    const line = JSON.stringify(entry) + "\n";
    await appendFile(filePath, line, "utf-8");

    logger.info("会话条目已追加", {
      filePath,
      role: entry.role,
    });

    logMethodReturn(logger, {
      method,
      module,
      result: sanitize({ success: true }),
      duration: timer(),
    });
  } catch (err: unknown) {
    const error = err as Error;
    logMethodError(logger, {
      method,
      module,
      error: {
        name: error.name,
        message: error.message,
        ...(error.stack ? { stack: error.stack } : {}),
      },
      params: { role: entry.role },
      duration: timer(),
    });
    throw err;
  }
}

/**
 * 批量追加消息
 * @param entries - 会话条目数组
 */
export async function appendSessionEntries(entries: SessionEntry[]): Promise<void> {
  const timer = createTimer();
  const module = MODULE_NAME;
  const method = "appendSessionEntries";
  logMethodCall(logger, {
    method,
    module,
    params: { entryCount: entries.length },
  });

  try {
    if (entries.length === 0) {
      logMethodReturn(logger, {
        method,
        module,
        result: sanitize({ skipped: true, reason: "empty_entries" }),
        duration: timer(),
      });
      return;
    }

    await ensureSessionsDir();
    const filePath = getSessionFilePath();
    const lines = entries.map((e) => JSON.stringify(e)).join("\n") + "\n";
    await appendFile(filePath, lines, "utf-8");

    logger.info("会话条目批量已追加", {
      filePath,
      entryCount: entries.length,
    });

    logMethodReturn(logger, {
      method,
      module,
      result: sanitize({ success: true, entryCount: entries.length }),
      duration: timer(),
    });
  } catch (err: unknown) {
    const error = err as Error;
    logMethodError(logger, {
      method,
      module,
      error: {
        name: error.name,
        message: error.message,
        ...(error.stack ? { stack: error.stack } : {}),
      },
      params: { entryCount: entries.length },
      duration: timer(),
    });
    throw err;
  }
}

/**
 * 加载指定日期的 Session
 * @param date - 日期，默认为今天
 * @returns 会话条目数组
 */
export async function loadSessionFile(date?: Date): Promise<SessionEntry[]> {
  const timer = createTimer();
  const module = MODULE_NAME;
  const method = "loadSessionFile";
  const dateStr = date ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}` : "today";
  logMethodCall(logger, { method, module, params: { date: dateStr } });

  try {
    const filePath = getSessionFilePath(date);

    if (!existsSync(filePath)) {
      logger.debug("会话文件不存在", { filePath, date: dateStr });
      logMethodReturn(logger, {
        method,
        module,
        result: sanitize({ entries: [], reason: "file_not_found" }),
        duration: timer(),
      });
      return [];
    }

    try {
      const content = await readFile(filePath, "utf-8");
      const lines = content.trim().split("\n").filter(Boolean);
      const entries = lines.map((line) => JSON.parse(line) as SessionEntry);

      logger.info("会话文件已加载", {
        filePath,
        entryCount: entries.length,
        date: dateStr,
      });

      logMethodReturn(logger, {
        method,
        module,
        result: sanitize({ entryCount: entries.length }),
        duration: timer(),
      });
      return entries;
    } catch {
      // 静默处理加载失败
      logger.warn("会话文件加载失败", { filePath, date: dateStr });
      logMethodReturn(logger, {
        method,
        module,
        result: sanitize({ entries: [], reason: "parse_error" }),
        duration: timer(),
      });
      return [];
    }
  } catch (err: unknown) {
    const error = err as Error;
    logMethodError(logger, {
      method,
      module,
      error: {
        name: error.name,
        message: error.message,
        ...(error.stack ? { stack: error.stack } : {}),
      },
      params: { date: dateStr },
      duration: timer(),
    });
    throw err;
  }
}

/**
 * 加载最近的 Session（按 token 数量限制）
 * @param contextWindowTokens - 上下文窗口大小（token 数量），默认 65535
 * @param maxDays - 最大加载天数，默认 30 天
 * @returns 会话条目数组（按时间正序排列，token 总数不超过 contextWindowTokens）
 */
export async function loadRecentSessions(
  contextWindowTokens: number = 65535,
  maxDays: number = 30,
): Promise<SessionEntry[]> {
  const timer = createTimer();
  const module = MODULE_NAME;
  const method = "loadRecentSessions";
  logMethodCall(logger, {
    method,
    module,
    params: { contextWindowTokens, maxDays },
  });

  try {
    // 如果 sessions 目录不存在，直接返回空数组
    if (!existsSync(SESSIONS_DIR)) {
      logger.debug("会话目录不存在，跳过历史加载", { path: SESSIONS_DIR });
      logMethodReturn(logger, {
        method,
        module,
        result: sanitize({ entryCount: 0, reason: "dir_not_found" }),
        duration: timer(),
      });
      return [];
    }

    const entries: SessionEntry[] = [];

    // 按天加载历史记录
    for (let i = 0; i < maxDays; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dayEntries = await loadSessionFile(date);
      entries.unshift(...dayEntries); // 按时间正序排列
    }

    // 按 token 数量筛选消息（从末尾开始选择）
    const result: SessionEntry[] = [];
    let currentTokens = 0;

    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i]!;
      const entryTokens = estimateEntryTokens(entry);

      // 检查添加此条目是否会超过限制
      if (currentTokens + entryTokens > contextWindowTokens) {
        // 如果是用户消息且已选择了一些消息，强制包含此用户消息
        if (entry.role === "user" && result.length > 0) {
          result.length = 0;
          currentTokens = 0;
          result.unshift(entry);
          currentTokens += entryTokens;
        }
        break;
      }

      result.unshift(entry);
      currentTokens += entryTokens;
    }

    // 确保从用户消息开始（避免孤立的 tool_result）
    for (let i = 0; i < result.length; i++) {
      if (result[i]!.role === "user") {
        const finalResult = result.slice(i);
        logger.info("最近会话已加载", {
          totalEntries: entries.length,
          returnedEntries: finalResult.length,
          contextWindowTokens,
          totalTokens: currentTokens,
          maxDays,
        });

        logMethodReturn(logger, {
          method,
          module,
          result: sanitize({ entryCount: finalResult.length, totalTokens: currentTokens }),
          duration: timer(),
        });
        return finalResult;
      }
    }

    // 如果没有用户消息，返回空列表
    logger.info("最近会话已加载（无用户消息）", {
      totalEntries: entries.length,
      returnedEntries: 0,
      contextWindowTokens,
      maxDays,
    });

    logMethodReturn(logger, {
      method,
      module,
      result: sanitize({ entryCount: 0 }),
      duration: timer(),
    });
    return [];
  } catch (err: unknown) {
    const error = err as Error;
    logMethodError(logger, {
      method,
      module,
      error: {
        name: error.name,
        message: error.message,
        ...(error.stack ? { stack: error.stack } : {}),
      },
      params: { contextWindowTokens, maxDays },
      duration: timer(),
    });
    throw err;
  }
}

/**
 * 估算会话条目的 token 数量
 * @param entry - 会话条目
 * @returns 估算的 token 数量
 */
function estimateEntryTokens(entry: SessionEntry): number {
  let tokens = 0;

  // 内容 token
  if (entry.content) {
    // 中文字符约 1.5 字符/token，英文字符约 4 字符/token
    const chineseChars = (entry.content.match(/[\u4e00-\u9fff]/g) || []).length;
    const otherChars = entry.content.length - chineseChars;
    tokens += Math.ceil(chineseChars / 1.5) + Math.ceil(otherChars / 4);
  }

  // 工具调用固定估算 15 tokens/tool
  if (entry.toolCalls?.length) {
    tokens += entry.toolCalls.length * 15;
  }

  // 工具调用 ID
  if (entry.toolCallId) {
    tokens += Math.ceil(entry.toolCallId.length / 4);
  }

  // 名称
  if (entry.name) {
    tokens += Math.ceil(entry.name.length / 4);
  }

  return Math.max(1, tokens);
}

/**
 * 清空当天的 Session 文件
 * @param date - 日期，默认为今天
 */
export async function clearSessionFile(date?: Date): Promise<void> {
  const timer = createTimer();
  const module = MODULE_NAME;
  const method = "clearSessionFile";
  logMethodCall(logger, { method, module, params: { date } });

  try {
    const filePath = getSessionFilePath(date);

    if (existsSync(filePath)) {
      await writeFile(filePath, "", "utf-8");
      logger.info("会话文件已清空", { filePath });
    } else {
      logger.info("会话文件不存在，无需清空", { filePath });
    }

    logMethodReturn(logger, {
      method,
      module,
      result: sanitize({ success: true }),
      duration: timer(),
    });
  } catch (err: unknown) {
    const error = err as Error;
    logMethodError(logger, {
      method,
      module,
      error: {
        name: error.name,
        message: error.message,
        ...(error.stack ? { stack: error.stack } : {}),
      },
      params: { date },
      duration: timer(),
    });
    throw err;
  }
}

/**
 * 将 Message 转换为 SessionEntry
 * @param message - 消息对象
 * @returns 会话条目
 */
export function messageToEntry(message: Message): SessionEntry {
  const timer = createTimer();
  const module = MODULE_NAME;
  const method = "messageToEntry";
  logMethodCall(logger, {
    method,
    module,
    params: { role: message.role },
  });

  try {
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

    logMethodReturn(logger, {
      method,
      module,
      result: sanitize({ role: entry.role, timestamp: entry.timestamp }),
      duration: timer(),
    });
    return entry;
  } catch (err: unknown) {
    const error = err as Error;
    logMethodError(logger, {
      method,
      module,
      error: {
        name: error.name,
        message: error.message,
        ...(error.stack ? { stack: error.stack } : {}),
      },
      params: { role: message.role },
      duration: timer(),
    });
    throw err;
  }
}

/**
 * 将 SessionEntry 转换为 Message
 * @param entry - 会话条目
 * @returns 消息对象
 */
export function entryToMessage(entry: SessionEntry): Message {
  const timer = createTimer();
  const module = MODULE_NAME;
  const method = "entryToMessage";
  logMethodCall(logger, {
    method,
    module,
    params: { role: entry.role },
  });

  try {
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

    logMethodReturn(logger, {
      method,
      module,
      result: sanitize({ role: message.role, timestamp: message.timestamp }),
      duration: timer(),
    });
    return message;
  } catch (err: unknown) {
    const error = err as Error;
    logMethodError(logger, {
      method,
      module,
      error: {
        name: error.name,
        message: error.message,
        ...(error.stack ? { stack: error.stack } : {}),
      },
      params: { role: entry.role },
      duration: timer(),
    });
    throw err;
  }
}