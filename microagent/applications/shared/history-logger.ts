/**
 * 历史日志管理器
 *
 * 将压缩的对话历史归档到 `~/.micro-agent/workspace/.agent/history/YYYY-MM-DD.md`
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { Message } from "../../runtime/types.js";

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 确保目录存在
 */
async function ensureDir(dir: string): Promise<void> {
  try {
    await mkdir(dir, { recursive: true });
  } catch {
    // 忽略错误
  }
}

// ============================================================================
// 历史日志管理器
// ============================================================================

/**
 * 历史日志管理器
 *
 * 负责将消息归档到历史日志文件
 */
export class HistoryLogger {
  private historyDir: string;
  private agentDir: string;

  constructor(workspaceDir: string) {
    this.agentDir = join(workspaceDir, ".agent");
    this.historyDir = join(this.agentDir, "history");
  }

  /**
   * 确保历史日志目录存在
   */
  private async ensureHistoryDir(): Promise<void> {
    await ensureDir(this.historyDir);
  }

  /**
   * 获取历史日志文件路径
   * @param date 日期（可选，默认为今天）
   * @returns 历史日志文件路径
   */
  private getHistoryFilePath(date?: Date): string {
    const targetDate = date || new Date();
    const year = targetDate.getFullYear();
    const month = String(targetDate.getMonth() + 1).padStart(2, "0");
    const day = String(targetDate.getDate()).padStart(2, "0");
    return join(this.historyDir, `${year}-${month}-${day}.md`);
  }

  /**
   * 格式化消息为 Markdown 格式
   * @param message 消息对象
   * @returns Markdown 格式的消息文本
   */
  private formatMessage(message: Message): string {
    const timestamp = message.timestamp
      ? new Date(message.timestamp).toISOString().slice(0, 16).replace("T", " ")
      : new Date().toISOString().slice(0, 16).replace("T", " ");

    const role = message.role === "user" ? "用户" : "助手";

    let content = "";

    // 处理内容
    if (typeof message.content === "string") {
      content = message.content;
    } else if (Array.isArray(message.content)) {
      // 处理多模态内容
      const textParts: string[] = [];
      for (const part of message.content) {
        if (typeof part === "string") {
          textParts.push(part);
        } else if (part.type === "text" && typeof part.text === "string") {
          textParts.push(part.text);
        } else if (part.type === "image_url") {
          textParts.push("[图片]");
        }
      }
      content = textParts.join("\n");
    }

    // 处理工具调用
    if (message.tool_calls && message.tool_calls.length > 0) {
      const toolCalls = message.tool_calls
        .map((tc) => `- \`${tc.function.name}\`(${JSON.stringify(tc.function.arguments)})`)
        .join("\n");
      content = `${content}\n\n**工具调用**:\n${toolCalls}`;
    }

    // 处理工具结果
    if (message.role === "tool" && message.tool_call_id) {
      content = `**工具结果** (${message.tool_call_id}):\n\n${content}`;
    }

    return `[${timestamp}] ${role}:\n\n${content}`;
  }

  /**
   * 格式化消息列表为 Markdown 格式
   * @param messages 消息列表
   * @returns Markdown 格式的消息列表文本
   */
  private formatMessages(messages: Message[]): string {
    return messages.map((msg) => this.formatMessage(msg)).join("\n\n---\n\n");
  }

  /**
   * 将消息列表归档到历史日志
   * @param messages 要归档的消息列表
   * @param date 日期（可选，默认为今天）
   * @returns 是否成功
   */
  async appendToHistory(messages: Message[], date?: Date): Promise<boolean> {
    if (messages.length === 0) {
      return false;
    }

    try {
      await this.ensureHistoryDir();

      const filePath = this.getHistoryFilePath(date);
      const formattedContent = this.formatMessages(messages);

      // 读取现有内容
      let existingContent = "";
      try {
        existingContent = await readFile(filePath, "utf-8");
      } catch {
        // 文件不存在，忽略错误
      }

      // 追加新内容
      const separator = existingContent ? "\n\n---\n\n" : "";
      const newContent = existingContent + separator + formattedContent;

      await writeFile(filePath, newContent, "utf-8");

      return true;
    } catch (error) {
      console.error(`归档历史日志失败: ${error}`);
      return false;
    }
  }

  /**
   * 读取指定日期的历史日志
   * @param date 日期
   * @returns 历史日志内容
   */
  async readHistory(date: Date): Promise<string> {
    try {
      await this.ensureHistoryDir();
      const filePath = this.getHistoryFilePath(date);
      return await readFile(filePath, "utf-8");
    } catch {
      return "";
    }
  }

  /**
   * 列出所有历史日志文件
   * @returns 历史日志文件路径列表
   */
  async listHistoryFiles(): Promise<string[]> {
    try {
      await this.ensureHistoryDir();
      const { readdir } = await import("node:fs/promises");
      const files = await readdir(this.historyDir);
      return files.filter((f) => f.endsWith(".md")).sort().reverse();
    } catch {
      return [];
    }
  }
}

// ============================================================================
// 导出便捷函数
// ============================================================================

/**
 * 创建历史日志管理器
 * @param workspaceDir 工作目录
 * @returns 历史日志管理器实例
 */
export function createHistoryLogger(workspaceDir: string): HistoryLogger {
  return new HistoryLogger(workspaceDir);
}
