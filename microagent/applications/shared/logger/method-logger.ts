/**
 * 方法调用日志辅助函数
 */

import type { Logger } from "@logtape/logtape";
import { SENSITIVE_FIELDS } from "./sensitive.js";

/**
 * 方法调用日志数据
 */
export interface MethodCallLogData {
  method: string;
  module: string;
  params?: Record<string, unknown>;
  caller?: string;
}

/**
 * 方法返回日志数据
 */
export interface MethodReturnLogData {
  method: string;
  module: string;
  result?: unknown;
  duration?: number;
}

/**
 * 方法错误日志数据
 */
export interface MethodErrorLogData {
  method: string;
  module: string;
  error: {
    name: string;
    message: string;
    stack?: string | undefined;
  };
  params?: Record<string, unknown>;
  duration?: number;
}

/**
 * 记录方法调用开始
 */
export function logMethodCall(logger: Logger, data: MethodCallLogData): void {
  logger.debug("方法调用开始", {
    ...data,
    timestamp: Date.now(),
  });
}

/**
 * 记录方法调用返回
 */
export function logMethodReturn(logger: Logger, data: MethodReturnLogData): void {
  logger.debug("方法调用返回", {
    ...data,
    timestamp: Date.now(),
  });
}

/**
 * 记录方法调用错误
 */
export function logMethodError(logger: Logger, data: MethodErrorLogData): void {
  logger.error("方法调用错误", {
    ...data,
    timestamp: Date.now(),
  });
}

/**
 * 创建计时器
 */
export function createTimer(): () => number {
  const start = Date.now();
  return () => Date.now() - start;
}

/**
 * 脱敏对象（移除敏感信息）
 */
export function sanitize(obj: unknown, maxDepth = 3): unknown {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj !== "object") {
    if (typeof obj === "string" && obj.length > 500) {
      return obj.substring(0, 500) + "...[truncated]";
    }
    return obj;
  }

  if (maxDepth <= 0) {
    return "[max depth reached]";
  }

  if (Array.isArray(obj)) {
    if (obj.length > 10) {
      return [...obj.slice(0, 10).map(v => sanitize(v, maxDepth - 1)), `...${obj.length - 10} more items`];
    }
    return obj.map(v => sanitize(v, maxDepth - 1));
  }

  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_FIELDS.some(sk => key.toLowerCase().includes(sk))) {
      result[key] = "[REDACTED]";
    } else {
      result[key] = sanitize(value, maxDepth - 1);
    }
  }

  return result;
}

/**
 * 截断文本到指定长度
 */
export function truncateText(text: string, maxLength: number = 2000): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + `... (已截断，总长度：${text.length})`;
}
