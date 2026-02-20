/**
 * Agent 工具函数
 */

import type { LLMMessage, ContentPart } from '../providers/base';

/** Zod Schema 类型（支持 Zod 4.x 的 .toJSONSchema() 方法） */
export interface ZodSchemaWithJsonSchema {
  toJSONSchema?: () => Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * 格式化参数
 * @param args - 参数对象
 * @returns 格式化后的字符串
 */
export function formatArgs(args: Record<string, unknown>): string {
  const parts = Object.entries(args).map(([k, v]) => `${k}=${truncate(JSON.stringify(v), 50)}`);
  const result = parts.join(', ');
  return result.length > 200 ? result.slice(0, 200) + '...' : result;
}

/**
 * 格式化结果
 * @param result - 结果字符串
 * @returns 格式化后的字符串
 */
export function formatResult(result: string): string {
  return truncate(result.replace(/\n/g, ' '), 150);
}

/**
 * 预览文本
 * @param text - 原始文本
 * @param max - 最大长度
 * @returns 截断后的预览文本
 */
export function preview(text: string, max = 30): string {
  const preview = text.slice(0, max).replace(/\n/g, ' ');
  return preview + (text.length > max ? '...' : '');
}

/**
 * 截断字符串
 * @param str - 原始字符串
 * @param max - 最大长度
 * @returns 截断后的字符串
 */
export function truncate(str: string, max: number): string {
  return str.length <= max ? str : str.slice(0, max) + '...';
}

/**
 * 获取错误消息
 * @param error - 错误对象
 * @returns 错误消息字符串
 */
export function errorMsg(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * 将多模态消息转换为纯文本格式
 * 用于不支持 vision 的模型
 */
export function convertToPlainText(messages: LLMMessage[]): LLMMessage[] {
  return messages.map(msg => {
    if (typeof msg.content === 'string') return msg;

    // ContentPart[] -> 纯文本
    const textParts: string[] = [];
    for (const part of msg.content) {
      if (part.type === 'text') {
        textParts.push(part.text);
      } else if (part.type === 'image_url') {
        textParts.push('[图片]');
      }
    }

    return { ...msg, content: textParts.join('\n') };
  });
}
