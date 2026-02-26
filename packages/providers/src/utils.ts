/**
 * Provider 工具函数
 */

import type { LLMMessage, ProviderContentPart, MessageContent } from './base';

/** 图片扩展名 */
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'];

/** 允许的 URL 协议 */
const ALLOWED_PROTOCOLS = ['http:', 'https:', 'data:'];

/** 禁止访问的主机（SSRF 防护） */
const BLOCKED_HOSTS = [
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '169.254.169.254', // AWS 元数据
  'metadata.google.internal', // GCP 元数据
  'metadata.azure.com', // Azure 元数据
];

/** 最大媒体数量 */
const MAX_MEDIA_COUNT = 10;

/**
 * 验证图片 URL 安全性
 *
 * 防止 SSRF 攻击，阻止访问本地文件和内网资源
 *
 * @param url - 待验证的 URL
 * @returns 是否为安全的图片 URL
 */
export function isValidImageUrl(url: string): boolean {
  // 处理 data URI
  if (url.toLowerCase().startsWith('data:image/')) {
    return true;
  }

  try {
    const parsed = new URL(url);

    // 检查协议
    if (!ALLOWED_PROTOCOLS.includes(parsed.protocol)) {
      return false;
    }

    // data URI 已在上面处理，这里检查主机
    if (parsed.protocol === 'data:') {
      return url.toLowerCase().startsWith('data:image/');
    }

    // 检查是否为禁止的主机
    const hostname = parsed.hostname.toLowerCase();
    for (const blocked of BLOCKED_HOSTS) {
      if (hostname === blocked || hostname.endsWith('.' + blocked)) {
        return false;
      }
    }

    // 检查是否为内网 IP
    if (isPrivateIP(hostname)) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * 检查是否为内网 IP 地址
 */
function isPrivateIP(hostname: string): boolean {
  // IPv4 内网地址
  const privatePatterns = [
    /^10\./,
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
    /^192\.168\./,
    /^192\.0\.0\./,
    /^100\.6[4-9]\./,
    /^100\.[7-9][0-9]\./,
    /^100\.1[0-1][0-9]\./,
    /^100\.12[0-7]\./,
  ];

  for (const pattern of privatePatterns) {
    if (pattern.test(hostname)) {
      return true;
    }
  }

  return false;
}

/**
 * 判断是否为图片 URL
 *
 * @param url - 待判断的 URL
 * @returns 是否为图片 URL
 */
export function isImageUrl(url: string): boolean {
  const lower = url.toLowerCase();

  // data URI 格式
  if (lower.startsWith('data:image/')) {
    return true;
  }

  // HTTP(S) URL - 检查路径扩展名
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      const pathname = parsed.pathname.toLowerCase();
      return IMAGE_EXTENSIONS.some(ext => pathname.endsWith(ext));
    }
  } catch {
    // URL 解析失败，尝试简单匹配
    return IMAGE_EXTENSIONS.some(ext => lower.endsWith(ext));
  }

  return false;
}

/**
 * 构建用户消息内容
 *
 * 如果有媒体文件，返回多模态数组格式（OpenAI 推荐顺序：先图片，后文本）
 *
 * @param text - 文本内容
 * @param media - 媒体文件列表（data URI 或 URL 格式）
 * @returns 单文本或 ContentPart 数组
 */
export function buildUserContent(text: string, media?: string[]): MessageContent {
  if (!media || media.length === 0) {
    return text;
  }

  // 限制媒体数量
  const limitedMedia = media.slice(0, MAX_MEDIA_COUNT);

  const content: ProviderContentPart[] = [];
  let validCount = 0;
  let invalidCount = 0;

  // 先添加图片（OpenAI 推荐顺序）
  for (const m of limitedMedia) {
    // 严格的图片类型检测
    if (!isImageUrl(m)) {
      continue;
    }

    // URL 安全验证
    if (!isValidImageUrl(m)) {
      invalidCount++;
      continue;
    }

    content.push({
      type: 'image_url',
      image_url: {
        url: m,
        detail: 'auto',
      },
    });
    validCount++;
  }

  // 再添加文本
  if (text) {
    content.push({
      type: 'text',
      text: text,
    });
  }

  // 如果没有有效图片，返回纯文本
  if (validCount === 0) {
    const suffix = invalidCount > 0 ? `\n\n[${invalidCount} 个无效或受限的媒体链接已忽略]` : '';
    return text + suffix;
  }

  return content.length > 0 ? content : text;
}

/**
 * 将消息转换为纯文本格式
 *
 * 用于非视觉模型，将多模态消息中的图片替换为 `[图片]` 占位符。
 *
 * @param messages - 原始消息列表
 * @returns 转换后的纯文本消息列表
 */
export function convertToPlainText(messages: LLMMessage[]): LLMMessage[] {
  return messages.map(msg => {
    // 如果内容已经是字符串，直接返回
    if (typeof msg.content === 'string') return msg;

    // ContentPart[] -> 纯文本
    const textParts: string[] = [];
    for (const part of msg.content as ProviderContentPart[]) {
      if (part.type === 'text') {
        textParts.push(part.text);
      } else if (part.type === 'image_url') {
        textParts.push('[图片]');
      }
    }

    return { ...msg, content: textParts.join('\n') };
  });
}