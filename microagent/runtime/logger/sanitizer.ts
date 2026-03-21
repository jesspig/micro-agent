/**
 * 日志脱敏工具
 */

/** 敏感字段名称列表 */
const SENSITIVE_FIELDS = [
  "token",
  "accessToken",
  "access_token",
  "secret",
  "key",
  "password",
  "credential",
  "authorization",
  "clientSecret",
  "client_secret",
  "appSecret",
  "app_secret",
  "apiKey",
  "api_key",
  "corpId",
  "corp_id",
  "botId",
  "bot_id",
];

/** Token 可见长度 */
const TOKEN_VISIBLE_LENGTH = 8;

/**
 * 脱敏 token 显示
 */
export function maskToken(token: string): string {
  if (!token || token.length <= TOKEN_VISIBLE_LENGTH * 2) {
    return "***";
  }
  const start = token.substring(0, TOKEN_VISIBLE_LENGTH);
  const end = token.substring(token.length - TOKEN_VISIBLE_LENGTH);
  return `${start}...${end}`;
}

/**
 * 脱敏字符串中的敏感信息
 */
export function sanitizeString(str: string): string {
  let sanitized = str;

  sanitized = sanitized.replace(/(Bearer\s+|QQBot\s+)([A-Za-z0-9_-]+)/gi, (_, prefix) => `${prefix}***`);

  for (const field of SENSITIVE_FIELDS) {
    const jsonPattern = new RegExp(`("${field}"\\s*:\\s*")([^"]+)(")`, "gi");
    sanitized = sanitized.replace(jsonPattern, `$1***$3`);

    const kvPattern = new RegExp(`(${field}=)([^&\\s]+)`, "gi");
    sanitized = sanitized.replace(kvPattern, `$1***`);
  }

  return sanitized;
}

/**
 * 脱敏对象中的敏感字段
 */
export function sanitizeObject<T>(obj: T, depth: number = 0): T {
  if (depth > 10 || obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === "string") {
    return sanitizeString(obj) as T;
  }

  if (typeof obj !== "object") {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeObject(item, depth + 1)) as T;
  }

  if (obj instanceof Date) {
    return obj;
  }

  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_FIELDS.some((field) => key.toLowerCase().includes(field.toLowerCase()))) {
      result[key] = typeof value === "string" ? maskToken(value) : "[REDACTED]";
    } else if (typeof value === "object" && value !== null) {
      result[key] = sanitizeObject(value, depth + 1);
    } else if (typeof value === "string") {
      result[key] = sanitizeString(value);
    } else {
      result[key] = value;
    }
  }

  return result as T;
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
      return [...obj.slice(0, 10).map((v) => sanitize(v, maxDepth - 1)), `...${obj.length - 10} more items`];
    }
    return obj.map((v) => sanitize(v, maxDepth - 1));
  }

  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_FIELDS.some((sk) => key.toLowerCase().includes(sk))) {
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
