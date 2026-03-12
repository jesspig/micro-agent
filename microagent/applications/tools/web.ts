/**
 * Web 搜索和获取工具
 *
 * 提供网络搜索和网页内容获取能力
 */

import { BaseTool } from "../../runtime/tool/base.js";
import type { ToolParameterSchema, ToolResult } from "../../runtime/tool/types.js";
import { TOOL_EXECUTION_TIMEOUT } from "../shared/constants.js";

// ============================================================================
// 类型定义
// ============================================================================

/** 搜索结果项 */
interface SearchResult {
  /** 标题 */
  title: string;
  /** 摘要 */
  snippet: string;
  /** URL */
  url: string;
}

/** 网页内容 */
interface WebContent {
  /** 标题 */
  title: string | undefined;
  /** 内容 */
  content: string;
  /** URL */
  url: string;
  /** 内容类型 */
  contentType: string | undefined;
}

// ============================================================================
// 搜索引擎配置
// ============================================================================

/** DuckDuckGo 搜索 API URL */
const DDG_API_URL = "https://api.duckduckgo.com/";

/** 备用搜索方案（HTML 解析） */
const DDG_HTML_URL = "https://html.duckduckgo.com/html/";

// ============================================================================
// Web 工具实现
// ============================================================================

/**
 * Web 搜索和获取工具
 *
 * 提供网络访问能力：
 * - search: 使用 DuckDuckGo 搜索
 * - fetch: 获取网页内容
 */
export class WebTool extends BaseTool<Record<string, unknown>> {
  readonly name = "web";
  readonly description = `Web 搜索和获取工具。

支持的操作：
- search: 使用 DuckDuckGo 搜索网络信息
- fetch: 获取网页内容

特点：
- 无需 API Key
- 支持自定义超时
- 自动处理常见错误`;

  readonly parameters: ToolParameterSchema = {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["search", "fetch"],
        description: "操作类型",
      },
      query: {
        type: "string",
        description: "搜索查询词或网页 URL",
      },
      limit: {
        type: "number",
        description: "搜索结果数量限制（默认 5，最大 10）",
      },
      timeout: {
        type: "number",
        description: "请求超时（毫秒，默认 30000）",
      },
      headers: {
        type: "object",
        description: "自定义请求头（仅 fetch 操作）",
      },
    },
    required: ["action", "query"],
  };

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    try {
      const action = this.readStringParam(params, "action", { required: true });
      const query = this.readStringParam(params, "query", { required: true });

      if (!action || !query) {
        return {
          content: "缺少必需参数: action 或 query",
          isError: true,
        };
      }

      switch (action) {
        case "search":
          return await this.handleSearch(params);
        case "fetch":
          return await this.handleFetch(params);
        default:
          return {
            content: `未知的操作类型: ${action}`,
            isError: true,
          };
      }
    } catch (error) {
      return {
        content: `Web 操作失败: ${error instanceof Error ? error.message : String(error)}`,
        isError: true,
      };
    }
  }

  // ============================================================================
  // 搜索功能
  // ============================================================================

  /**
   * 执行搜索
   */
  private async handleSearch(params: Record<string, unknown>): Promise<ToolResult> {
    const query = this.readStringParam(params, "query", { required: true });
    const limitInput = this.readNumberParam(params, "limit");
    const timeoutInput = this.readNumberParam(params, "timeout");

    if (!query) {
      return {
        content: "缺少搜索查询词",
        isError: true,
      };
    }

    // 限制结果数量
    const limit = Math.min(limitInput ?? 5, 10);
    const timeout = timeoutInput ?? TOOL_EXECUTION_TIMEOUT;

    try {
      // 使用 DuckDuckGo Instant Answer API
      const results = await this.searchDuckDuckGo(query, limit, timeout);

      if (results.length === 0) {
        return {
          content: `未找到相关结果: "${query}"`,
          isError: false,
          metadata: {
            query,
            count: 0,
          },
        };
      }

      // 格式化输出
      const output = this.formatSearchResults(results, query);

      return {
        content: output,
        isError: false,
        metadata: {
          query,
          count: results.length,
        },
      };
    } catch (error) {
      // 如果 API 失败，尝试备用方案
      try {
        const results = await this.searchDuckDuckGoHtml(query, limit, timeout);

        if (results.length > 0) {
          const output = this.formatSearchResults(results, query);
          return {
            content: output,
            isError: false,
            metadata: {
              query,
              count: results.length,
              method: "html",
            },
          };
        }
      } catch {
        // 备用方案也失败
      }

      return {
        content: `搜索失败: ${error instanceof Error ? error.message : String(error)}`,
        isError: true,
      };
    }
  }

  /**
   * 使用 DuckDuckGo API 搜索
   */
  private async searchDuckDuckGo(
    query: string,
    limit: number,
    timeout: number
  ): Promise<SearchResult[]> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const searchParams = new URLSearchParams({
        q: query,
        format: "json",
        no_html: "1",
        skip_disambig: "1",
      });

      const response = await fetch(`${DDG_API_URL}?${searchParams}`, {
        signal: controller.signal,
        headers: {
          "User-Agent": "MicroAgent/1.0",
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = (await response.json()) as {
        AbstractText?: string;
        AbstractURL?: string;
        Heading?: string;
        RelatedTopics?: Array<{
          Text?: string;
          FirstURL?: string;
          Result?: string;
        }>;
      };

      const results: SearchResult[] = [];

      // 添加主要摘要（如果有）
      if (data.AbstractText && data.AbstractURL) {
        results.push({
          title: data.Heading ?? "摘要",
          snippet: data.AbstractText,
          url: data.AbstractURL,
        });
      }

      // 添加相关主题
      if (data.RelatedTopics) {
        for (const topic of data.RelatedTopics) {
          if (results.length >= limit) break;

          if (topic.Text && topic.FirstURL) {
            // 解析标题（通常在 Text 的开头）
            const match = topic.Text.match(/^(.+?)\s*-/);
            const title = (match?.[1] ?? topic.Text.slice(0, 50)) as string;

            results.push({
              title,
              snippet: topic.Text,
              url: topic.FirstURL,
            });
          }
        }
      }

      return results;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * 使用 DuckDuckGo HTML 版本搜索（备用方案）
   */
  private async searchDuckDuckGoHtml(
    query: string,
    limit: number,
    timeout: number
  ): Promise<SearchResult[]> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const searchParams = new URLSearchParams({ q: query });
      const response = await fetch(`${DDG_HTML_URL}?${searchParams}`, {
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; MicroAgent/1.0)",
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const html = await response.text();
      return this.parseSearchResults(html, limit);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * 解析 HTML 搜索结果
   */
  private parseSearchResults(html: string, limit: number): SearchResult[] {
    const results: SearchResult[] = [];

    // 简单的正则匹配（生产环境应使用 HTML 解析器）
    const resultPattern =
      /<a[^>]+class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/g;
    const snippetPattern =
      /<a[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([^<]*(?:<[^>]+>[^<]*)*)<\/a>/g;

    let match;
    while ((match = resultPattern.exec(html)) !== null && results.length < limit) {
      const url = match[1] ?? "";
      const title = this.stripHtmlTags(match[2] ?? "");

      // 查找对应的摘要
      const snippetMatch = snippetPattern.exec(html);
      const snippet = snippetMatch ? this.stripHtmlTags(snippetMatch[1] ?? "") : "";

      results.push({
        title,
        snippet: snippet || title,
        url,
      });
    }

    return results;
  }

  /**
   * 移除 HTML 标签
   */
  private stripHtmlTags(html: string): string {
    return html
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .trim();
  }

  /**
   * 格式化搜索结果
   */
  private formatSearchResults(results: SearchResult[], query: string): string {
    const parts: string[] = [];

    parts.push(`搜索结果: "${query}"`);
    parts.push(`找到 ${results.length} 条结果`);
    parts.push("─".repeat(50));

    for (const result of results) {
      parts.push("");
      parts.push(`【${results.indexOf(result) + 1}】${result.title}`);
      parts.push(`    ${result.snippet}`);
      parts.push(`    URL: ${result.url}`);
    }

    return parts.join("\n");
  }

  // ============================================================================
  // 网页获取功能
  // ============================================================================

  /**
   * 获取网页内容
   */
  private async handleFetch(params: Record<string, unknown>): Promise<ToolResult> {
    const url = this.readStringParam(params, "query", { required: true });
    const timeoutInput = this.readNumberParam(params, "timeout");
    const headersInput = this.readObjectParam<Record<string, string>>(params, "headers");

    if (!url) {
      return {
        content: "缺少 URL 参数",
        isError: true,
      };
    }

    // 验证 URL
    if (!this.isValidUrl(url)) {
      return {
        content: `无效的 URL: ${url}`,
        isError: true,
      };
    }

    const timeout = timeoutInput ?? TOOL_EXECUTION_TIMEOUT;
    const headers = headersInput ?? {};

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; MicroAgent/1.0)",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          ...headers,
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return {
          content: `HTTP 错误: ${response.status} ${response.statusText}`,
          isError: true,
          metadata: {
            url,
            status: response.status,
          },
        };
      }

      const contentType = response.headers.get("content-type") ?? undefined;
      const content = await response.text();

      // 提取标题
      const title = this.extractTitle(content);

      // 简单的文本提取（移除脚本和样式）
      const text = this.extractText(content);

      const webContent: WebContent = {
        title,
        content: text.slice(0, 50000), // 限制内容长度
        url,
        contentType,
      };

      return {
        content: this.formatWebContent(webContent),
        isError: false,
        metadata: {
          url,
          title,
          contentLength: text.length,
          contentType,
        },
      };
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        return {
          content: `请求超时: ${url}`,
          isError: true,
        };
      }

      return {
        content: `获取网页失败: ${error instanceof Error ? error.message : String(error)}`,
        isError: true,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * 验证 URL 格式
   */
  private isValidUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
      return false;
    }
  }

  /**
   * 提取网页标题
   */
  private extractTitle(html: string): string | undefined {
    const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    return match ? this.stripHtmlTags(match[1] ?? "").trim() : undefined;
  }

  /**
   * 提取网页文本内容
   */
  private extractText(html: string): string {
    return html
      // 移除脚本和样式
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      // 移除注释
      .replace(/<!--[\s\S]*?-->/g, "")
      // 移除所有标签
      .replace(/<[^>]+>/g, "\n")
      // 清理空白
      .replace(/\n\s*\n/g, "\n\n")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .trim();
  }

  /**
   * 格式化网页内容
   */
  private formatWebContent(content: WebContent): string {
    const parts: string[] = [];

    parts.push(`URL: ${content.url}`);
    if (content.title) {
      parts.push(`标题: ${content.title}`);
    }
    if (content.contentType) {
      parts.push(`类型: ${content.contentType}`);
    }
    parts.push("─".repeat(50));
    parts.push("");
    parts.push(content.content);

    return parts.join("\n");
  }
}