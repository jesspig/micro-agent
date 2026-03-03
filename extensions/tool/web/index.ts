/**
 * Web 工具扩展
 *
 * 提供 Web 获取功能。
 *
 * 安全机制：
 * - SSRF 防护：禁止访问内网地址
 * - 协议限制：仅允许 HTTP/HTTPS
 * - 超时限制：防止长时间阻塞
 */

import { defineTool } from '@micro-agent/sdk';
import type { Tool, JSONSchema } from '@micro-agent/types';

/** 禁止访问的内网 IP 地址段 */
const BLOCKED_IP_RANGES = [
  /^127\./,                           // 127.0.0.0/8 (localhost)
  /^10\./,                            // 10.0.0.0/8 (私有网络 A 类)
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,  // 172.16.0.0/12 (私有网络 B 类)
  /^192\.168\./,                      // 192.168.0.0/16 (私有网络 C 类)
  /^169\.254\./,                      // 169.254.0.0/16 (链路本地)
  /^0\.0\.0\.0/,                      // 0.0.0.0/8 (当前网络)
  /^224\./,                           // 224.0.0.0/4 (组播)
  /^240\./,                           // 240.0.0.0/4 (保留)
  /^255\.255\.255\.255$/,             // 广播地址
];

/** 禁止访问的主机名 */
const BLOCKED_HOSTNAMES = [
  'localhost',
  'localhost.localdomain',
  'ip6-localhost',
  'ip6-loopback',
  'metadata.google.internal',  // GCP 元数据服务
  'metadata.azure',            // Azure 元数据服务
  '169.254.169.254',           // 云元数据服务 IP
  '[::1]',                     // IPv6 localhost
  '[0:0:0:0:0:0:0:1]',         // IPv6 localhost (完整形式)
];

/** 允许的协议 */
const ALLOWED_PROTOCOLS = ['http:', 'https:'];

/** 请求超时时间（毫秒） */
const REQUEST_TIMEOUT = 30000;

/** 最大响应内容长度 */
const MAX_CONTENT_LENGTH = 5000;

/**
 * 检查 IP 是否在禁止访问的范围内
 */
function isBlockedIP(ip: string): boolean {
  return BLOCKED_IP_RANGES.some(pattern => pattern.test(ip));
}

/**
 * 检查主机名是否在禁止访问的列表中
 */
function isBlockedHostname(hostname: string): boolean {
  const lowerHostname = hostname.toLowerCase();
  return BLOCKED_HOSTNAMES.some(blocked => 
    lowerHostname === blocked || lowerHostname.endsWith('.' + blocked)
  );
}

/**
 * 通过 DNS 解析获取实际 IP 地址并进行安全检查
 * 注意：这是异步操作，需要在实际请求前完成
 */
async function resolveAndValidateIP(hostname: string): Promise<{ safe: boolean; error?: string }> {
  // 如果是 IP 地址，直接检查
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
    if (isBlockedIP(hostname)) {
      return { safe: false, error: '禁止访问内网地址' };
    }
    return { safe: true };
  }

  // IPv6 地址检查
  if (hostname.startsWith('[') && hostname.endsWith(']')) {
    const ipv6 = hostname.slice(1, -1);
    if (ipv6 === '::1' || ipv6 === '0:0:0:0:0:0:0:1') {
      return { safe: false, error: '禁止访问本地主机' };
    }
    return { safe: true };
  }

  // DNS 解析并检查解析后的 IP
  try {
    // 使用 Bun 的 DNS 解析功能
    const { lookup } = await import('dns').then(m => m.promises);
    const addresses = await lookup(hostname, { all: true });
    
    for (const addr of addresses) {
      const ip = addr.address;
      if (isBlockedIP(ip)) {
        return { safe: false, error: `DNS 解析返回禁止访问的 IP: ${ip}` };
      }
    }
    
    return { safe: true };
  } catch {
    // DNS 解析失败时，允许请求继续（由后续网络请求处理错误）
    return { safe: true };
  }
}

/**
 * 验证 URL 是否安全
 * @returns 安全检查结果，不安全时返回错误信息
 */
function validateUrl(urlString: string): { safe: boolean; error?: string; url?: URL } {
  let url: URL;
  
  try {
    url = new URL(urlString);
  } catch {
    return { safe: false, error: '无效的 URL 格式' };
  }
  
  // 检查协议
  if (!ALLOWED_PROTOCOLS.includes(url.protocol)) {
    return { safe: false, error: `不支持的协议: ${url.protocol}，仅允许 HTTP/HTTPS` };
  }
  
  // 检查主机名
  if (isBlockedHostname(url.hostname)) {
    return { safe: false, error: '禁止访问本地主机' };
  }
  
  // 检查 IP 地址
  const hostname = url.hostname;
  // IPv4 地址检查
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
    if (isBlockedIP(hostname)) {
      return { safe: false, error: '禁止访问内网地址' };
    }
  }
  
  // IPv6 地址检查（简化版）
  if (hostname.startsWith('[') && hostname.endsWith(']')) {
    const ipv6 = hostname.slice(1, -1);
    if (ipv6 === '::1' || ipv6 === '0:0:0:0:0:0:0:1') {
      return { safe: false, error: '禁止访问本地主机' };
    }
  }
  
  return { safe: true, url };
}

/** Web 获取工具 */
export const WebFetchTool = defineTool({
  name: 'web_fetch',
  description: '获取网页内容',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: '网页 URL' },
    },
    required: ['url'],
  } satisfies JSONSchema,
  execute: async (input: unknown) => {
    // 兼容多种输入格式
    let url: string;
    if (typeof input === 'string') {
      url = input;
    } else if (input && typeof input === 'object') {
      const obj = input as Record<string, unknown>;
      url = String(obj.url ?? obj.action_input ?? '');
    } else {
      return '错误: 无效的输入格式，需要字符串或 { url: string }';
    }
    
    // 安全检查
    const validation = validateUrl(url);
    if (!validation.safe) {
      return `错误: ${validation.error}`;
    }

    // DNS 解析后的 IP 地址验证（防止 DNS 重绑定攻击）
    const dnsValidation = await resolveAndValidateIP(validation.url!.hostname);
    if (!dnsValidation.safe) {
      return `错误: ${dnsValidation.error}`;
    }
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
      
      const response = await fetch(validation.url!, {
        signal: controller.signal,
        redirect: 'follow',
      });
      
      clearTimeout(timeoutId);

      if (!response.ok) {
        return `获取失败: HTTP ${response.status}`;
      }

      const html = await response.text();
      // 简单提取文本（移除 HTML 标签）
      const text = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, MAX_CONTENT_LENGTH);

      return text || '(无内容)';
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return '获取失败: 请求超时';
      }
      return `获取失败: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
});

// 导出工具
export const webTools: Tool[] = [WebFetchTool];
