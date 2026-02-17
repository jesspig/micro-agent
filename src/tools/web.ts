import { z } from 'zod';
import type { Tool, ToolContext } from './base';

/** Web 搜索工具 */
export class WebSearchTool implements Tool {
  readonly name = 'web_search';
  readonly description = 'Web 搜索（需要 Brave API Key）';
  readonly inputSchema = z.object({
    query: z.string().describe('搜索关键词'),
    maxResults: z.number().optional().describe('最大结果数'),
  });

  private apiKey?: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey;
  }

  async execute(input: { query: string; maxResults?: number }): Promise<string> {
    if (!this.apiKey) {
      return '错误: 未配置 Brave API Key';
    }

    try {
      const url = new URL('https://api.search.brave.com/res/v1/web/search');
      url.searchParams.set('q', input.query);
      url.searchParams.set('count', String(input.maxResults ?? 5));

      const response = await fetch(url.toString(), {
        headers: { 'X-Subscription-Token': this.apiKey },
      });

      if (!response.ok) {
        return `搜索失败: HTTP ${response.status}`;
      }

      const data = await response.json() as { 
        web?: { 
          results?: Array<{ title: string; url: string; description?: string }> 
        } 
      };
      
      const results = data.web?.results ?? [];

      if (results.length === 0) {
        return '未找到结果';
      }

      return results
        .map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}${r.description ? `\n   ${r.description}` : ''}`)
        .join('\n\n');
    } catch (error) {
      return `搜索失败: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
}

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
