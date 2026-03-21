/**
 * 历史记录整理器
 *
 * 负责将对话消息整理为历史记录，写入 history/YYYY-MM-DD.md 文件
 * 
 * 功能：
 * - 检测是否需要整理（token 超过阈值）
 * - 选择合适的整理边界
 * - 调用 LLM 生成历史条目
 * - 写入历史文件
 */

import { appendFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Message } from "../types.js";
import { estimateMessagesTokens } from "../../applications/shared/token-estimator.js";
import {
  createTimer,
  logMethodCall,
  logMethodReturn,
  logMethodError,
  sanitize,
  createDefaultLogger,
} from "../logger/index.js";
import { HISTORY_DIR } from "../../applications/shared/constants.js";

const logger = createDefaultLogger("debug", ["runtime", "memory", "consolidator"]);
const MODULE_NAME = "HistoryConsolidator";

// ============================================================================
// 类型定义
// ============================================================================

/** 历史条目 */
export interface HistoryEntry {
  /** 时间戳 (HH:MM) */
  timestamp: string;
  /** 标题 */
  title: string;
  /** 要点列表 */
  points: string[];
}

/** 整理结果 */
export interface ConsolidationResult {
  /** 历史条目列表 */
  entries: HistoryEntry[];
  /** 可选：更新 MEMORY.md 的内容 */
  memoryUpdate?: string;
  /** 整理的消息数量 */
  messageCount: number;
  /** 释放的 token 数 */
  releasedTokens: number;
}

/** 整理器配置 */
export interface ConsolidatorConfig {
  /** 是否启用整理 */
  enabled: boolean;
  /** 触发整理的阈值（0-1，相对于 contextWindow） */
  threshold: number;
  /** 保留最近消息数 */
  keepRecentMessages: number;
  /** 整理目标比例（整理后上下文占 contextWindow 的比例） */
  targetRatio: number;
}

/** 默认配置 */
export const DEFAULT_CONSOLIDATOR_CONFIG: ConsolidatorConfig = {
  enabled: true,
  threshold: 0.7,
  keepRecentMessages: 10,
  targetRatio: 0.5,
};

/** LLM 调用函数类型 */
export type LLMCallFunction = (prompt: string) => Promise<string>;

// ============================================================================
// 历史记录整理器
// ============================================================================

/**
 * 历史记录整理器
 *
 * 将对话消息整理为可搜索的历史记录
 */
export class HistoryConsolidator {
  private config: ConsolidatorConfig;
  private llmCall: LLMCallFunction | null = null;

  constructor(
    config: Partial<ConsolidatorConfig> = {},
    llmCall?: LLMCallFunction,
  ) {
    this.config = { ...DEFAULT_CONSOLIDATOR_CONFIG, ...config };
    this.llmCall = llmCall ?? null;

    logger.info("历史整理器已初始化", {
      config: sanitize(this.config),
      hasLLMCall: !!this.llmCall,
    });
  }

  /**
   * 设置 LLM 调用函数
   */
  setLLMCall(fn: LLMCallFunction): void {
    this.llmCall = fn;
  }

  /**
   * 检查是否需要整理
   * @param currentTokens 当前 token 数
   * @param contextWindow 上下文窗口大小
   */
  shouldConsolidate(currentTokens: number, contextWindow: number): boolean {
    if (!this.config.enabled || !this.llmCall) {
      return false;
    }
    return currentTokens >= contextWindow * this.config.threshold;
  }

  /**
   * 选择待整理的消息边界
   * @param messages 消息列表
   * @param currentTokens 当前 token 数
   * @param contextWindow 上下文窗口大小
   * @returns 待整理的消息索引范围 [start, end)
   */
  selectConsolidationBoundary(
    messages: Message[],
    currentTokens: number,
    contextWindow: number,
  ): { start: number; end: number } | null {
    const timer = createTimer();
    logMethodCall(logger, {
      method: "selectConsolidationBoundary",
      module: MODULE_NAME,
      params: {
        messageCount: messages.length,
        currentTokens,
        contextWindow,
        threshold: this.config.threshold,
      },
    });

    // 计算需要释放的 token 数
    const targetTokens = contextWindow * this.config.targetRatio;
    const tokensToRemove = currentTokens - targetTokens;

    if (tokensToRemove <= 0) {
      logMethodReturn(logger, {
        method: "selectConsolidationBoundary",
        module: MODULE_NAME,
        result: { boundary: null, reason: "no_tokens_to_remove" },
        duration: timer(),
      });
      return null;
    }

    // 保留最近的消息
    const keepCount = this.config.keepRecentMessages;
    const maxEndIndex = Math.max(0, messages.length - keepCount);

    if (maxEndIndex === 0) {
      logMethodReturn(logger, {
        method: "selectConsolidationBoundary",
        module: MODULE_NAME,
        result: { boundary: null, reason: "all_recent" },
        duration: timer(),
      });
      return null;
    }

    // 从旧到新遍历，找到合适的边界
    let accumulatedTokens = 0;
    let boundaryEnd = 0;

    for (let i = 0; i < maxEndIndex; i++) {
      const msgTokens = estimateMessagesTokens([messages[i]!]);

      // 边界条件：在 user 消息处截断，且已积累足够 token
      if (
        messages[i]?.role === "user" &&
        accumulatedTokens >= tokensToRemove * 0.8 // 至少释放 80% 目标
      ) {
        boundaryEnd = i;
      }

      accumulatedTokens += msgTokens;

      // 已积累足够 token，找最近边界
      if (accumulatedTokens >= tokensToRemove && boundaryEnd > 0) {
        break;
      }
    }

    // 没找到合适的边界，使用最大范围
    if (boundaryEnd === 0 && accumulatedTokens >= tokensToRemove * 0.5) {
      // 找最后一个 user 消息作为边界
      for (let i = maxEndIndex - 1; i >= 0; i--) {
        if (messages[i]?.role === "user") {
          boundaryEnd = i;
          break;
        }
      }
    }

    if (boundaryEnd === 0) {
      logMethodReturn(logger, {
        method: "selectConsolidationBoundary",
        module: MODULE_NAME,
        result: { boundary: null, reason: "no_valid_boundary" },
        duration: timer(),
      });
      return null;
    }

    const result = { start: 0, end: boundaryEnd };

    logMethodReturn(logger, {
      method: "selectConsolidationBoundary",
      module: MODULE_NAME,
      result: sanitize({
        boundary: result,
        messageCount: boundaryEnd,
        estimatedTokens: accumulatedTokens,
      }),
      duration: timer(),
    });

    return result;
  }

  /**
   * 执行整理
   * @param messages 待整理的消息列表
   */
  async consolidate(messages: Message[]): Promise<ConsolidationResult> {
    const timer = createTimer();
    logMethodCall(logger, {
      method: "consolidate",
      module: MODULE_NAME,
      params: { messageCount: messages.length },
    });

    try {
      if (!this.llmCall) {
        throw new Error("LLM 调用函数未设置");
      }

      if (messages.length === 0) {
        return {
          entries: [],
          messageCount: 0,
          releasedTokens: 0,
        };
      }

      // 格式化消息用于整理
      const formattedMessages = this.formatMessagesForConsolidation(messages);

      // 调用 LLM 生成历史条目
      const prompt = this.buildConsolidationPrompt(formattedMessages);
      const response = await this.llmCall(prompt);

      // 解析响应
      const entries = this.parseConsolidationResponse(response);

      const result: ConsolidationResult = {
        entries,
        messageCount: messages.length,
        releasedTokens: estimateMessagesTokens(messages),
      };

      logMethodReturn(logger, {
        method: "consolidate",
        module: MODULE_NAME,
        result: sanitize({
          entryCount: entries.length,
          messageCount: messages.length,
          releasedTokens: result.releasedTokens,
        }),
        duration: timer(),
      });

      return result;
    } catch (err) {
      const error = err as Error;
      logMethodError(logger, {
        method: "consolidate",
        module: MODULE_NAME,
        error: {
          name: error.name,
          message: error.message,
          ...(error.stack ? { stack: error.stack } : {}),
        },
        params: { messageCount: messages.length },
        duration: timer(),
      });
      throw error;
    }
  }

  /**
   * 写入历史文件
   * @param entries 历史条目列表
   * @param date 日期（默认今天）
   */
  async appendHistory(entries: HistoryEntry[], date?: Date): Promise<string> {
    const timer = createTimer();
    const targetDate = date ?? new Date();
    const dateStr = this.formatDate(targetDate);

    logMethodCall(logger, {
      method: "appendHistory",
      module: MODULE_NAME,
      params: { entryCount: entries.length, date: dateStr },
    });

    try {
      // 确保目录存在
      if (!existsSync(HISTORY_DIR)) {
        await mkdir(HISTORY_DIR, { recursive: true });
      }

      // 构建内容
      const filePath = join(HISTORY_DIR, `${dateStr}.md`);
      const content = this.formatHistoryEntries(entries, targetDate);

      // 追加到文件
      if (existsSync(filePath)) {
        // 文件已存在，追加内容（去掉标题）
        const entriesContent = entries
          .map((e) => this.formatEntry(e))
          .join("\n\n");
        await appendFile(filePath, `\n\n${entriesContent}`, "utf-8");
      } else {
        // 文件不存在，创建新文件
        await appendFile(filePath, content, "utf-8");
      }

      logMethodReturn(logger, {
        method: "appendHistory",
        module: MODULE_NAME,
        result: sanitize({ filePath, entryCount: entries.length }),
        duration: timer(),
      });

      return filePath;
    } catch (err) {
      const error = err as Error;
      logMethodError(logger, {
        method: "appendHistory",
        module: MODULE_NAME,
        error: {
          name: error.name,
          message: error.message,
          ...(error.stack ? { stack: error.stack } : {}),
        },
        params: { entryCount: entries.length, date: dateStr },
        duration: timer(),
      });
      throw error;
    }
  }

  // ============================================================================
  // 私有方法
  // ============================================================================

  /**
   * 格式化消息用于整理
   */
  private formatMessagesForConsolidation(messages: Message[]): string {
    const lines: string[] = [];

    for (const msg of messages) {
      if (!msg.content) continue;

      const timestamp = msg.timestamp
        ? this.formatTime(new Date(msg.timestamp))
        : "??:??";

      const role =
        msg.role === "user"
          ? "用户"
          : msg.role === "assistant"
            ? "助手"
            : msg.role;

      let content = msg.content;

      // 截断过长的内容
      if (content.length > 500) {
        content = content.slice(0, 500) + "...";
      }

      lines.push(`[${timestamp}] ${role}: ${content}`);
    }

    return lines.join("\n");
  }

  /**
   * 构建整理提示词
   */
  private buildConsolidationPrompt(formattedMessages: string): string {
    return `你是记忆整理助手。分析以下对话，生成历史记录条目。

## 输出格式
每条记录包含：
- 时间戳 [HH:MM]
- 标题（简洁概括主题，不超过20字）
- 要点列表（关键事件、决策、涉及文件）

## 输出格式示例
## [14:32] 用户登录功能开发
- 实现了 JWT 认证中间件
- 修复了 token 过期处理逻辑
- 决策：选择 HS256 算法而非 RS256
- 相关文件：src/middleware/auth.ts

## [16:45] API 响应格式统一
- 重构了所有接口返回格式
- 添加了统一错误处理

## 输入对话
${formattedMessages}

## 输出
直接输出 Markdown 格式的历史条目，不要代码块包裹。`;
  }

  /**
   * 解析整理响应
   */
  private parseConsolidationResponse(response: string): HistoryEntry[] {
    const entries: HistoryEntry[] = [];
    const lines = response.split("\n");

    let currentEntry: HistoryEntry | null = null;

    for (const line of lines) {
      const trimmed = line.trim();

      // 匹配标题行: ## [HH:MM] 标题
      const titleMatch = trimmed.match(/^##\s*\[(\d{2}:\d{2})\]\s*(.+)$/);
      if (titleMatch) {
        // 保存之前的条目
        if (currentEntry) {
          entries.push(currentEntry);
        }
        currentEntry = {
          timestamp: titleMatch[1]!,
          title: titleMatch[2]!.trim(),
          points: [],
        };
        continue;
      }

      // 匹配要点行: - 内容
      if (currentEntry && trimmed.startsWith("- ")) {
        currentEntry.points.push(trimmed.slice(2));
      }
    }

    // 保存最后一个条目
    if (currentEntry) {
      entries.push(currentEntry);
    }

    return entries;
  }

  /**
   * 格式化历史条目列表
   */
  private formatHistoryEntries(entries: HistoryEntry[], date: Date): string {
    const dateStr = this.formatDate(date);
    const lines: string[] = [`# ${dateStr} 历史记录`, ""];

    for (const entry of entries) {
      lines.push(this.formatEntry(entry));
    }

    return lines.join("\n");
  }

  /**
   * 格式化单个历史条目
   */
  private formatEntry(entry: HistoryEntry): string {
    const lines = [`## [${entry.timestamp}] ${entry.title}`];

    for (const point of entry.points) {
      lines.push(`- ${point}`);
    }

    return lines.join("\n");
  }

  /**
   * 格式化日期
   */
  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  /**
   * 格式化时间
   */
  private formatTime(date: Date): string {
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${hours}:${minutes}`;
  }
}
