/**
 * Web 工具扩展
 *
 * 提供 Web 获取功能。
 */

import { defineTool } from '@microbot/sdk';
import type { Tool, JSONSchema } from '@microbot/types';

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
  execute: async (input: { url: string }) => {
    try {
      const response = await fetch(input.url);

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
        .slice(0, 5000);

      return text || '(无内容)';
    } catch (error) {
      return `获取失败: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
});

// 导出工具
export const webTools: Tool[] = [WebFetchTool];
