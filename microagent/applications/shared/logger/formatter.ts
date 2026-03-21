/**
 * 日志格式化器
 */

import type { LogRecord } from "@logtape/logtape";

const COLORS = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  gray: "\x1b[90m",
};

const LEVEL_BG_COLORS: Record<string, string> = {
  debug: "\x1b[100m",
  info: "\x1b[44m",
  warning: "\x1b[43m",
  error: "\x1b[41m",
};

export function jsonFormatter(record: LogRecord): string {
  const entry = {
    timestamp: new Date(record.timestamp).toISOString(),
    level: record.level,
    category: record.category,
    message: record.message,
    properties: sanitizeProperties(record.properties),
  };
  return JSON.stringify(entry) + "\n";
}

export function humanReadableFormatter(record: LogRecord, colorEnabled: boolean): string {
  const timestamp = new Date(record.timestamp).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const level = record.level.toUpperCase().padEnd(7);
  const category = record.category.slice(1).join(".");
  const message = typeof record.message === "string"
    ? record.message
    : JSON.stringify(record.message);

  let propsStr = "";
  if (record.properties && Object.keys(record.properties).length > 0) {
    const sanitizedProps = sanitizeProperties(record.properties);
    propsStr = " | " + formatProperties(sanitizedProps);
  }

  if (colorEnabled) {
    const bgLevel = LEVEL_BG_COLORS[record.level] ?? "";
    const coloredLevel = `${bgLevel}${COLORS.bold}${COLORS.white} ${level.trim()} ${COLORS.reset}`;
    const coloredTimestamp = `${COLORS.dim}${timestamp}${COLORS.reset}`;
    const coloredCategory = `${COLORS.cyan}${category}${COLORS.reset}`;

    return `${coloredTimestamp} ${coloredLevel} [${coloredCategory}] ${message}${propsStr}`;
  }

  return `[${timestamp}] ${level} [${category}] ${message}${propsStr}`;
}

export function sanitizeProperties(props: Record<string, unknown>): Record<string, unknown> {
  return sanitizeObject(props);
}

export function formatProperties(props: Record<string, unknown>, _indent = 0): string {
  const entries: string[] = [];

  for (const [key, value] of Object.entries(props)) {
    const formattedValue = formatValue(value, _indent);
    entries.push(`${key}=${formattedValue}`);
  }

  return entries.join(" ");
}

export function formatValue(value: unknown, indent = 0): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";

  if (typeof value === "string") {
    if (value.length > 100) {
      return `"${value.substring(0, 100)}..."`;
    }
    return `"${value}"`;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    if (value.length <= 3 && value.every(v => typeof v !== "object")) {
      return `[${value.map(v => formatValue(v, indent)).join(", ")}]`;
    }
    return `[${value.length} items]`;
  }

  if (typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>);
    if (keys.length === 0) return "{}";
    if (keys.length <= 3) {
      const inner = Object.entries(value as Record<string, unknown>)
        .map(([k, v]) => `${k}:${formatValue(v, indent + 1)}`)
        .join(", ");
      return `{${inner}}`;
    }
    return `{${keys.length} keys}`;
  }

  return String(value);
}

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

const SENSITIVE_FIELDS = [
  "token", "accessToken", "access_token", "secret", "key", "password",
  "credential", "authorization", "clientSecret", "client_secret",
  "appSecret", "app_secret", "apiKey", "api_key", "corpId", "corp_id",
  "botId", "bot_id",
];

const TOKEN_VISIBLE_LENGTH = 8;

export function maskToken(token: string): string {
  if (!token || token.length <= TOKEN_VISIBLE_LENGTH * 2) {
    return "***";
  }
  const start = token.substring(0, TOKEN_VISIBLE_LENGTH);
  const end = token.substring(token.length - TOKEN_VISIBLE_LENGTH);
  return `${start}...${end}`;
}

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
