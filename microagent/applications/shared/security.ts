/**
 * 安全工具模块
 * 
 * 提供 URL 验证、日志脱敏、消息长度限制等安全功能
 */

import { sharedLogger, createTimer, logMethodCall, logMethodReturn, logMethodError } from "./logger.js";

const logger = sharedLogger();

// ============================================================================
// 常量定义
// ============================================================================

/** 消息最大长度（默认值） */
export const MAX_MESSAGE_LENGTH = 8000;

/** Token 日志脱敏显示长度 */
const TOKEN_VISIBLE_LENGTH = 8;

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

/** 允许的 Webhook URL 协议 */
const ALLOWED_WEBHOOK_PROTOCOLS = ["https:"];

/** 允许的钉钉 Webhook 域名 */
const ALLOWED_DINGTALK_DOMAINS = [
  "oapi.dingtalk.com",
  "api.dingtalk.com",
];

/** 允许的飞书 Webhook 域名 */
const ALLOWED_FEISHU_DOMAINS = [
  "open.feishu.cn",
  "open.larksuite.com",
];

/** 允许的企微 Webhook 域名 */
const ALLOWED_WECHAT_DOMAINS = [
  "qyapi.weixin.qq.com",
];

/** 平台消息长度限制配置 */
const PLATFORM_MESSAGE_LIMITS: Record<string, { text: number; markdown: number }> = {
  // 企业微信
  wechatWork: { text: 2048, markdown: 4096 },
  // 钉钉
  dingtalk: { text: 20000, markdown: 20000 },
  // 飞书
  feishu: { text: 30000, markdown: 30000 },
  // QQ 频道
  qq: { text: 5000, markdown: 5000 },
  qqGuild: { text: 500, markdown: 500 },
};

/** 各平台消息长度限制（简化版，向后兼容） */
export const MESSAGE_LENGTH_LIMITS = {
  dingtalk: PLATFORM_MESSAGE_LIMITS.dingtalk?.text ?? MAX_MESSAGE_LENGTH,
  feishu: PLATFORM_MESSAGE_LIMITS.feishu?.text ?? MAX_MESSAGE_LENGTH,
  wechat: PLATFORM_MESSAGE_LIMITS.wechatWork?.text ?? MAX_MESSAGE_LENGTH,
  qq: PLATFORM_MESSAGE_LIMITS.qq?.text ?? MAX_MESSAGE_LENGTH,
} as const;

/** 危险的 HTML 标签 */
const DANGEROUS_TAGS = ["script", "iframe", "object", "embed", "form", "input"];

/** 危险的 Markdown 模式 */
const DANGEROUS_PATTERNS = [
  /<script\b[^>]*>[\s\S]*?<\/script>/gi,
  /<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi,
  /<object\b[^>]*>[\s\S]*?<\/object>/gi,
  /<embed\b[^>]*>/gi,
  /<form\b[^>]*>[\s\S]*?<\/form>/gi,
  /javascript:/gi,
  /on\w+\s*=/gi, // 事件处理器 onclick, onload 等
];

// ============================================================================
// 消息长度限制
// ============================================================================

/**
 * 获取平台消息长度限制
 * 
 * @param platform - 平台名称
 * @param useMarkdown - 是否使用 Markdown 格式（可选）
 * @returns 消息最大长度
 * 
 * @example
 * ```ts
 * const limit = getMessageLimit("wechatWork", true); // 4096
 * const limit = getMessageLimit("dingtalk", false); // 20000
 * const limit = getMessageLimit("feishu"); // 30000 (text limit)
 * ```
 */
export function getMessageLimit(platform: string, useMarkdown?: boolean): number {
  const timer = createTimer();
  logMethodCall(logger, { method: "getMessageLimit", module: "security", params: { platform, useMarkdown } });

  try {
    const limits = PLATFORM_MESSAGE_LIMITS[platform];
    let result: number;
    
    if (!limits) {
      result = MAX_MESSAGE_LENGTH;
    } else {
      // 如果未指定 useMarkdown，返回文本限制
      if (useMarkdown === undefined) {
        result = limits.text;
      } else {
        result = useMarkdown ? limits.markdown : limits.text;
      }
    }

    logMethodReturn(logger, { method: "getMessageLimit", module: "security", result, duration: timer() });
    return result;
  } catch (err) {
    const error = err as Error;
    logMethodError(logger, { method: "getMessageLimit", module: "security", error: { name: error.name, message: error.message, ...(error.stack ? { stack: error.stack } : {}) }, params: { platform, useMarkdown }, duration: timer() });
    throw error;
  }
}

/** 日志消息最大长度 */
const MAX_LOG_LENGTH = 1000;

/**
 * 截断日志消息到最大长度
 * 
 * 用于在日志中记录消息内容时截断过长的消息
 * 
 * @param message - 原始消息
 * @param maxLength - 最大长度（默认 1000）
 * @returns 截断后的消息
 */
export function truncateForLog(
  message: string,
  maxLength: number = MAX_LOG_LENGTH,
): string {
  if (!message || message.length <= maxLength) {
    return message;
  }
  return message.substring(0, maxLength) + "...";
}

/**
 * 截断消息到最大长度
 * 
 * @param message - 原始消息
 * @param maxLength - 最大长度（默认 8000）
 * @param suffix - 截断后缀（可选）
 * @returns 截断后的消息
 */
export function truncateMessage(
  message: string,
  maxLength: number = MAX_MESSAGE_LENGTH,
  suffix = "\n\n...[消息过长已截断]",
): string {
  const timer = createTimer();
  logMethodCall(logger, { method: "truncateMessage", module: "security", params: { messageLength: message.length, maxLength, hasSuffix: !!suffix } });

  try {
    let result: string;
    
    if (message.length <= maxLength) {
      result = message;
    } else {
      const truncatedLength = maxLength - suffix.length;
      result = message.substring(0, truncatedLength) + suffix;
    }

    logMethodReturn(logger, { method: "truncateMessage", module: "security", result: { length: result.length, wasTruncated: message.length > maxLength }, duration: timer() });
    return result;
  } catch (err) {
    const error = err as Error;
    logMethodError(logger, { method: "truncateMessage", module: "security", error: { name: error.name, message: error.message, ...(error.stack ? { stack: error.stack } : {}) }, params: { messageLength: message.length, maxLength }, duration: timer() });
    throw error;
  }
}

// ============================================================================
// 日志脱敏
// ============================================================================

/**
 * 脱敏 token 显示
 * 
 * @param token - 原始 token
 * @returns 脱敏后的 token（只显示前后几位）
 */
export function maskToken(token: string): string {
  const timer = createTimer();
  logMethodCall(logger, { method: "maskToken", module: "security", params: { tokenLength: token?.length } });

  try {
    let result: string;
    
    if (!token || token.length <= TOKEN_VISIBLE_LENGTH * 2) {
      result = "***";
    } else {
      const start = token.substring(0, TOKEN_VISIBLE_LENGTH);
      const end = token.substring(token.length - TOKEN_VISIBLE_LENGTH);
      result = `${start}...${end}`;
    }

    logMethodReturn(logger, { method: "maskToken", module: "security", result: { masked: true }, duration: timer() });
    return result;
  } catch (err) {
    const error = err as Error;
    logMethodError(logger, { method: "maskToken", module: "security", error: { name: error.name, message: error.message, ...(error.stack ? { stack: error.stack } : {}) }, params: {}, duration: timer() });
    throw error;
  }
}

/**
 * 脱敏日志中的敏感信息
 * 
 * @param message - 原始日志消息
 * @returns 脱敏后的消息
 */
export function sanitizeLog(message: string): string {
  const timer = createTimer();
  logMethodCall(logger, { method: "sanitizeLog", module: "security", params: { messageLength: message?.length } });

  try {
    let sanitized = message;

    // 替换常见的 token 格式
    // 匹配 Authorization: Bearer xxx 或 QQBot xxx 格式
    sanitized = sanitized.replace(
      /(Bearer\s+|QQBot\s+)([A-Za-z0-9_-]+)/gi,
      (_, prefix) => `${prefix}***`
    );

    // 匹配 JSON 中的敏感字段
    for (const field of SENSITIVE_FIELDS) {
      // 匹配 "field": "value" 格式
      const jsonPattern = new RegExp(
        `("${field}"\\s*:\\s*")([^"]+)(")`,
        "gi"
      );
      sanitized = sanitized.replace(jsonPattern, `$1***$3`);

      // 匹配 field=value 格式
      const kvPattern = new RegExp(
        `(${field}=)([^&\\s]+)`,
        "gi"
      );
      sanitized = sanitized.replace(kvPattern, `$1***`);
    }

    logMethodReturn(logger, { method: "sanitizeLog", module: "security", result: { length: sanitized.length }, duration: timer() });
    return sanitized;
  } catch (err) {
    const error = err as Error;
    logMethodError(logger, { method: "sanitizeLog", module: "security", error: { name: error.name, message: error.message, ...(error.stack ? { stack: error.stack } : {}) }, params: {}, duration: timer() });
    throw error;
  }
}

/**
 * 脱敏日志消息（别名）
 * 
 * @param message - 日志消息
 * @returns 脱敏后的消息
 */
export function sanitizeLogMessage(message: string): string {
  return sanitizeLog(message);
}

// ============================================================================
// 对象脱敏
// ============================================================================

/**
 * 脱敏对象中的敏感字段
 * 
 * @param obj - 要脱敏的对象
 * @param depth - 递归深度（防止循环引用）
 * @returns 脱敏后的对象副本
 */
export function sanitizeObject<T>(obj: T, depth: number = 0): T {
  const timer = createTimer();
  logMethodCall(logger, { method: "sanitizeObject", module: "security", params: { depth, objType: typeof obj } });

  try {
    const result = doSanitizeObject(obj, depth);
    logMethodReturn(logger, { method: "sanitizeObject", module: "security", result: { sanitized: true }, duration: timer() });
    return result;
  } catch (err) {
    const error = err as Error;
    logMethodError(logger, { method: "sanitizeObject", module: "security", error: { name: error.name, message: error.message, ...(error.stack ? { stack: error.stack } : {}) }, params: { depth }, duration: timer() });
    throw error;
  }
}

/**
 * 内部脱敏对象实现
 */
function doSanitizeObject<T>(obj: T, depth: number = 0): T {
  // 防止无限递归
  if (depth > 10) {
    return obj;
  }

  // 处理 null 和 undefined
  if (obj === null || obj === undefined) {
    return obj;
  }

  // 处理基本类型
  if (typeof obj !== "object") {
    return obj;
  }

  // 处理数组
  if (Array.isArray(obj)) {
    return obj.map((item) => doSanitizeObject(item, depth + 1)) as T;
  }

  // 处理 Date 等特殊对象
  if (obj instanceof Date) {
    return obj;
  }

  // 处理普通对象
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    // 检查是否为敏感字段
    if (SENSITIVE_FIELDS.some((field) => key.toLowerCase().includes(field.toLowerCase()))) {
      if (typeof value === "string") {
        result[key] = maskToken(value);
      } else {
        result[key] = "[REDACTED]";
      }
    } else if (typeof value === "object" && value !== null) {
      result[key] = doSanitizeObject(value, depth + 1);
    } else {
      result[key] = value;
    }
  }

  return result as T;
}

/**
 * 安全日志输出选项
 */
export interface SanitizeOptions {
  /** 最大日志长度 */
  maxLength?: number;
  /** 是否脱敏敏感字段 */
  redactSensitive?: boolean;
}

/**
 * 响应数据脱敏
 * 
 * @param data - 响应数据
 * @param options - 脱敏选项
 * @returns 脱敏后的数据
 */
export function sanitizeResponse<T>(data: T, options?: SanitizeOptions): T {
  const timer = createTimer();
  logMethodCall(logger, { method: "sanitizeResponse", module: "security", params: { hasOptions: !!options, redactSensitive: options?.redactSensitive } });

  try {
    const { redactSensitive = true } = options ?? {};

    let result: T;
    if (!redactSensitive) {
      result = data;
    } else {
      result = sanitizeObject(data);
    }

    logMethodReturn(logger, { method: "sanitizeResponse", module: "security", result: { sanitized: redactSensitive }, duration: timer() });
    return result;
  } catch (err) {
    const error = err as Error;
    logMethodError(logger, { method: "sanitizeResponse", module: "security", error: { name: error.name, message: error.message, ...(error.stack ? { stack: error.stack } : {}) }, params: {}, duration: timer() });
    throw error;
  }
}

/**
 * 错误信息脱敏
 * 
 * @param error - 错误对象或消息
 * @returns 脱敏后的错误信息
 */
export function sanitizeError(error: unknown): string {
  const timer = createTimer();
  logMethodCall(logger, { method: "sanitizeError", module: "security", params: { errorType: typeof error } });

  try {
    let result: string;

    if (error === null || error === undefined) {
      result = "未知错误";
    } else if (error instanceof Error) {
      result = sanitizeLog(error.message);
    } else if (typeof error === "string") {
      result = sanitizeLog(error);
    } else {
      // 尝试序列化
      try {
        const str = JSON.stringify(error);
        result = sanitizeLog(str);
      } catch {
        result = String(error);
      }
    }

    logMethodReturn(logger, { method: "sanitizeError", module: "security", result: { length: result.length }, duration: timer() });
    return result;
  } catch (err) {
    const err2 = err as Error;
    logMethodError(logger, { method: "sanitizeError", module: "security", error: { name: err2.name, message: err2.message, ...(err2.stack ? { stack: err2.stack } : {}) }, params: {}, duration: timer() });
    throw err2;
  }
}

// ============================================================================
// 消息 ID 验证
// ============================================================================

/** messageId 格式正则 */
const MESSAGE_ID_PATTERNS = {
  // 频道消息: {channel_id}:{message_id}
  channel: /^[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$/,
  // 群聊消息: group:{group_id}:{message_id}
  group: /^group:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$/,
  // 单聊消息: c2c:{user_openid}:{message_id}
  c2c: /^c2c:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$/,
  // 私聊消息: dms:{user_id}:{message_id}
  dms: /^dms:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$/,
};

/**
 * 验证消息 ID 格式
 * 
 * @param messageId - 消息 ID
 * @returns 是否为有效格式
 */
export function isValidMessageId(messageId: string): boolean {
  const timer = createTimer();
  logMethodCall(logger, { method: "isValidMessageId", module: "security", params: { messageId } });

  try {
    let result = false;
    
    if (!messageId || typeof messageId !== "string") {
      result = false;
    } else {
      // 检查所有支持的格式
      for (const pattern of Object.values(MESSAGE_ID_PATTERNS)) {
        if (pattern.test(messageId)) {
          result = true;
          break;
        }
      }
    }

    logMethodReturn(logger, { method: "isValidMessageId", module: "security", result, duration: timer() });
    return result;
  } catch (err) {
    const error = err as Error;
    logMethodError(logger, { method: "isValidMessageId", module: "security", error: { name: error.name, message: error.message, ...(error.stack ? { stack: error.stack } : {}) }, params: { messageId }, duration: timer() });
    throw error;
  }
}

/**
 * 解析消息 ID
 * 
 * @param messageId - 消息 ID
 * @returns 解析结果，包含类型和各部分 ID
 */
export function parseMessageId(
  messageId: string
): { type: "channel" | "group" | "c2c" | "dms"; parts: string[] } | null {
  const timer = createTimer();
  logMethodCall(logger, { method: "parseMessageId", module: "security", params: { messageId } });

  try {
    if (!messageId) {
      logMethodReturn(logger, { method: "parseMessageId", module: "security", result: null, duration: timer() });
      return null;
    }

    const parts = messageId.split(":");

    // 频道消息: {channel_id}:{message_id}
    if (parts.length === 2 && MESSAGE_ID_PATTERNS.channel.test(messageId)) {
      const result = { type: "channel" as const, parts };
      logMethodReturn(logger, { method: "parseMessageId", module: "security", result, duration: timer() });
      return result;
    }

    // 其他格式需要 3 部分
    if (parts.length !== 3) {
      logMethodReturn(logger, { method: "parseMessageId", module: "security", result: null, duration: timer() });
      return null;
    }

    const [prefix, id1, id2] = parts;

    if (prefix === "group" && MESSAGE_ID_PATTERNS.group.test(messageId)) {
      const result = { type: "group" as const, parts: [id1!, id2!] };
      logMethodReturn(logger, { method: "parseMessageId", module: "security", result, duration: timer() });
      return result;
    }

    if (prefix === "c2c" && MESSAGE_ID_PATTERNS.c2c.test(messageId)) {
      const result = { type: "c2c" as const, parts: [id1!, id2!] };
      logMethodReturn(logger, { method: "parseMessageId", module: "security", result, duration: timer() });
      return result;
    }

    if (prefix === "dms" && MESSAGE_ID_PATTERNS.dms.test(messageId)) {
      const result = { type: "dms" as const, parts: [id1!, id2!] };
      logMethodReturn(logger, { method: "parseMessageId", module: "security", result, duration: timer() });
      return result;
    }

    logMethodReturn(logger, { method: "parseMessageId", module: "security", result: null, duration: timer() });
    return null;
  } catch (err) {
    const error = err as Error;
    logMethodError(logger, { method: "parseMessageId", module: "security", error: { name: error.name, message: error.message, ...(error.stack ? { stack: error.stack } : {}) }, params: { messageId }, duration: timer() });
    throw error;
  }
}

// ============================================================================
// URL 验证
// ============================================================================

/**
 * 验证 URL 是否为允许的域名
 * 
 * @param url - 要验证的 URL
 * @param allowedDomains - 允许的域名列表
 * @returns 是否为允许的域名
 */
export function isAllowedDomain(
  url: string,
  allowedDomains: string[]
): boolean {
  const timer = createTimer();
  logMethodCall(logger, { method: "isAllowedDomain", module: "security", params: { url, domainCount: allowedDomains.length } });

  try {
    let result = false;
    
    try {
      const parsedUrl = new URL(url);
      result = allowedDomains.some(
        (domain) =>
          parsedUrl.hostname === domain ||
          parsedUrl.hostname.endsWith(`.${domain}`)
      );
    } catch {
      result = false;
    }

    logMethodReturn(logger, { method: "isAllowedDomain", module: "security", result, duration: timer() });
    return result;
  } catch (err) {
    const error = err as Error;
    logMethodError(logger, { method: "isAllowedDomain", module: "security", error: { name: error.name, message: error.message, ...(error.stack ? { stack: error.stack } : {}) }, params: { url }, duration: timer() });
    throw error;
  }
}

/**
 * 检查 URL 是否安全（HTTPS 且为允许的域名）
 * 
 * @param url - 要验证的 URL
 * @returns 是否为安全的 URL
 */
export function isUrlSafe(url: string): boolean {
  return isSafeWebhookUrl(url);
}

/**
 * 检查 URL 是否在允许的域名列表中
 * 
 * @param url - 要验证的 URL
 * @param allowedDomains - 允许的域名列表
 * @returns 是否为允许的域名
 */
export function isUrlDomainAllowed(url: string, allowedDomains: string[]): boolean {
  return isAllowedDomain(url, allowedDomains);
}

/**
 * 检查 URL 是否为安全的 Webhook URL
 * 
 * @param url - 要验证的 URL
 * @returns 是否为安全的 Webhook URL
 */
export function isSafeWebhookUrl(url: string): boolean {
  const timer = createTimer();
  logMethodCall(logger, { method: "isSafeWebhookUrl", module: "security", params: { url } });

  try {
    let result = false;
    
    try {
      const parsed = new URL(url);

      // 检查协议
      if (!ALLOWED_WEBHOOK_PROTOCOLS.includes(parsed.protocol)) {
        result = false;
      } else {
        // 检查域名
        const allDomains = [
          ...ALLOWED_DINGTALK_DOMAINS,
          ...ALLOWED_FEISHU_DOMAINS,
          ...ALLOWED_WECHAT_DOMAINS,
        ];

        result = allDomains.some(
          (domain) =>
            parsed.hostname === domain ||
            parsed.hostname.endsWith(`.${domain}`)
        );
      }
    } catch {
      result = false;
    }

    logMethodReturn(logger, { method: "isSafeWebhookUrl", module: "security", result, duration: timer() });
    return result;
  } catch (err) {
    const error = err as Error;
    logMethodError(logger, { method: "isSafeWebhookUrl", module: "security", error: { name: error.name, message: error.message, ...(error.stack ? { stack: error.stack } : {}) }, params: { url }, duration: timer() });
    throw error;
  }
}

/**
 * 检查 URL 是否为特定平台的安全 Webhook URL
 * 
 * @param url - 要验证的 URL
 * @param platform - 平台名称
 * @returns 是否为安全的 Webhook URL
 */
export function isSafeWebhookUrlForPlatform(
  url: string,
  platform: "dingtalk" | "feishu" | "wechat" | "qq"
): boolean {
  const timer = createTimer();
  logMethodCall(logger, { method: "isSafeWebhookUrlForPlatform", module: "security", params: { url, platform } });

  try {
    let result = false;
    
    try {
      const parsed = new URL(url);

      // 检查协议
      if (!ALLOWED_WEBHOOK_PROTOCOLS.includes(parsed.protocol)) {
        result = false;
      } else {
        let allowedDomains: string[];

        switch (platform) {
          case "dingtalk":
            allowedDomains = ALLOWED_DINGTALK_DOMAINS;
            break;
          case "feishu":
            allowedDomains = ALLOWED_FEISHU_DOMAINS;
            break;
          case "wechat":
            allowedDomains = ALLOWED_WECHAT_DOMAINS;
            break;
          case "qq":
            // QQ 暂无官方 Webhook
            result = false;
            logMethodReturn(logger, { method: "isSafeWebhookUrlForPlatform", module: "security", result, duration: timer() });
            return result;
        }

        result = allowedDomains.some(
          (domain) =>
            parsed.hostname === domain ||
            parsed.hostname.endsWith(`.${domain}`)
        );
      }
    } catch {
      result = false;
    }

    logMethodReturn(logger, { method: "isSafeWebhookUrlForPlatform", module: "security", result, duration: timer() });
    return result;
  } catch (err) {
    const error = err as Error;
    logMethodError(logger, { method: "isSafeWebhookUrlForPlatform", module: "security", error: { name: error.name, message: error.message, ...(error.stack ? { stack: error.stack } : {}) }, params: { url, platform }, duration: timer() });
    throw error;
  }
}

// ============================================================================
// Markdown 安全处理
// ============================================================================

/**
 * 清理 Markdown 内容中的危险元素
 * 
 * 移除可能导致 XSS 攻击的 HTML 标签和属性
 * 
 * @param content - 原始 Markdown 内容
 * @returns 清理后的安全内容
 * 
 * @example
 * ```ts
 * sanitizeMarkdown('Hello <script>alert(1)</script> World');
 * // 'Hello  World'
 * ```
 */
export function sanitizeMarkdown(content: string): string {
  const timer = createTimer();
  logMethodCall(logger, { method: "sanitizeMarkdown", module: "security", params: { contentLength: content?.length } });

  try {
    if (!content || typeof content !== "string") {
      const result = content ?? "";
      logMethodReturn(logger, { method: "sanitizeMarkdown", module: "security", result: { length: result.length }, duration: timer() });
      return result;
    }

    let sanitized = content;

    // 移除危险的 HTML 标签和属性
    for (const pattern of DANGEROUS_PATTERNS) {
      sanitized = sanitized.replace(pattern, "");
    }

    // 移除所有 HTML 标签（保留安全的）
    for (const tag of DANGEROUS_TAGS) {
      const openTagPattern = new RegExp(`<${tag}\\b[^>]*>`, "gi");
      const closeTagPattern = new RegExp(`</${tag}>`, "gi");
      sanitized = sanitized.replace(openTagPattern, "");
      sanitized = sanitized.replace(closeTagPattern, "");
    }

    // 移除可能导致问题的 Markdown 链接
    // 保留正常链接，移除 javascript: 协议
    sanitized = sanitized.replace(
      /\[([^\]]*)\]\(([^)]+)\)/g,
      (match, text, url) => {
        if (/^(javascript|data|vbscript):/i.test(url.trim())) {
          return `[${text}]()`; // 移除危险 URL
        }
        return match;
      }
    );

    logMethodReturn(logger, { method: "sanitizeMarkdown", module: "security", result: { length: sanitized.length }, duration: timer() });
    return sanitized;
  } catch (err) {
    const error = err as Error;
    logMethodError(logger, { method: "sanitizeMarkdown", module: "security", error: { name: error.name, message: error.message, ...(error.stack ? { stack: error.stack } : {}) }, params: { contentLength: content?.length }, duration: timer() });
    throw error;
  }
}
