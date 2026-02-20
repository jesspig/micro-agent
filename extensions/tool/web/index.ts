/**
 * Web 工具扩展
 * 
 * 提供 Web 获取功能。
 */
import { z } from 'zod';
import type { Tool, ToolContext } from '@microbot/core';

/** Web 获取工具 */
export class WebFetchTool implements Tool {
  readonly name = 'web_fetch';
  readonly description = '获取网页内容';
  readonly inputSchema = z.object({
    url: z.string().describe('网页 URL'),
  });

  async execute(input: { url: string }): Promise<string> {
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
  }
}

// 导出工具
export const webTools = [WebFetchTool];