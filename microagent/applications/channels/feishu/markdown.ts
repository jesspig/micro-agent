/**
 * 飞书 Markdown 转换模块
 *
 * 飞书富文本（Markdown）组件支持大部分标准 Markdown 语法：
 * - 标题：# ~ ######
 * - 加粗：**text** 或 __text__
 * - 斜体：*text*
 * - 删除线：~~text~~
 * - 链接：[text](url) 或 <a href='url'>text</a>
 * - 代码块：```language\ncode\n```
 * - 行内代码：`code`
 * - 有序/无序列表
 * - 引用：> quote
 * - 表格：标准 Markdown 表格
 * - 分割线：<hr> 或 ---
 *
 * 特殊处理：
 * - 图片语法转为链接（飞书 markdown 不支持图片）
 * - 提取一级标题到卡片 header（可选优化）
 *
 * 官方文档: https://open.feishu.cn/document/feishu-cards/card-json-v2-components/content-components/rich-text
 */

// ============================================================================
// 预编译正则表达式（模块加载时只编译一次，避免重复编译开销）
// ============================================================================

/** 图片语法正则：匹配 ![alt](url) 格式，用于转换为链接 */
const IMAGE_SYNTAX_REGEX = /!\[([^\]]*)\]\(([^)]+)\)/g;

/** 一级标题正则：匹配 # 标题 格式 */
const H1_HEADER_REGEX = /^#\s+(.+?)(?:\n|$)/m;

/** 一级标题完整匹配正则（用于移除标题行） */
const H1_HEADER_FULL_REGEX = /^#\s+.+(?:\n|$)/m;

/** 表格分隔行正则：匹配 |---|---| 格式的分隔行 */
const TABLE_SEPARATOR_REGEX = /^\|[\s\-:|]+\|$/;

// ============================================================================

/** 飞书 markdown 组件 */
export interface FeishuMarkdownComponent {
  tag: "markdown";
  content: string;
  text_size?: string;
  text_align?: "left" | "center" | "right";
  margin?: string;
}

/** 解析结果 */
export interface ParseResult {
  /** 卡片标题（从一级标题提取） */
  title: string;
  /** 内容元素 */
  elements: FeishuMarkdownComponent[];
}

/**
 * 预处理 Markdown 内容
 * 将不支持的语法转换为支持的格式
 */
export function preprocessMarkdown(content: string): string {
  let result = content;

  // 图片语法转为链接格式（飞书 markdown 不支持图片渲染）
  // ![alt](url) -> [alt](url)
  // 重置正则 lastIndex（全局正则需要重置）
  IMAGE_SYNTAX_REGEX.lastIndex = 0;
  result = result.replace(IMAGE_SYNTAX_REGEX, '[$1]($2)');

  return result;
}

/**
 * 提取飞书卡片标题
 * 从内容中提取第一个一级标题，并从内容中移除
 */
export function extractTitle(content: string): { title: string; content: string } {
  const match = content.match(H1_HEADER_REGEX);
  if (match) {
    const title = match[1] || "";
    const newContent = content.replace(H1_HEADER_FULL_REGEX, "");
    return { title, content: newContent.trim() };
  }
  return { title: "", content };
}

/**
 * 将 Markdown 内容转换为飞书富文本组件
 *
 * @param content - Markdown 内容
 * @param options - 转换选项
 * @returns 解析结果
 */
export function convertToFeishuElements(
  content: string,
  options?: {
    /** 是否提取一级标题作为卡片标题 */
    extractHeader?: boolean;
    /** 文本对齐方式 */
    textAlign?: "left" | "center" | "right";
    /** 文本大小 */
    textSize?: string;
  }
): ParseResult {
  const { extractHeader = true, textAlign = "left", textSize = "normal" } = options || {};

  // 预处理
  let processedContent = preprocessMarkdown(content);

  // 提取标题
  let title = "";
  if (extractHeader) {
    const result = extractTitle(processedContent);
    title = result.title;
    processedContent = result.content;
  }

  // 如果内容为空，返回空元素
  if (!processedContent.trim()) {
    return {
      title,
      elements: [],
    };
  }

  // 构建单个 markdown 组件（飞书 markdown 组件支持完整的 Markdown 语法）
  const element: FeishuMarkdownComponent = {
    tag: "markdown",
    content: processedContent,
    text_align: textAlign,
    text_size: textSize,
  };

  return {
    title,
    elements: [element],
  };
}

/**
 * 转换 Markdown 内容为飞书兼容格式（向后兼容）
 * @deprecated 请使用 convertToFeishuElements
 */
export function convertMarkdown(content: string): string {
  return preprocessMarkdown(content);
}

/**
 * 解析 Markdown 表格
 * @deprecated 飞书 markdown 组件原生支持表格，无需单独处理
 */
export function parseMarkdownTable(tableText: string): { rows: string[][]; success: boolean } {
  const lines = tableText.trim().split('\n');
  const rows: string[][] = [];

  for (const line of lines) {
    if (TABLE_SEPARATOR_REGEX.test(line.trim())) {
      continue;
    }
    const cells = line
      .split('|')
      .map(cell => cell.trim())
      .filter(cell => cell.length > 0);
    if (cells.length > 0) {
      rows.push(cells);
    }
  }

  return { rows, success: rows.length > 0 };
}

/**
 * 飞书 Table 组件类型（向后兼容）
 * @deprecated 飞书 markdown 组件原生支持表格
 */
export interface FeishuTableComponent {
  tag: "table";
  columns: Array<{ name: string; display_name: string; data_type: "text" }>;
  rows: Record<string, string>[];
}

/**
 * 将 Markdown 表格转换为飞书 Table 组件
 * @deprecated 飞书 markdown 组件原生支持表格，建议直接使用 markdown 组件
 */
export function convertTableToFeishuComponent(_tableText: string): FeishuTableComponent | null {
  // 已废弃，飞书 markdown 组件原生支持表格
  return null;
}

/**
 * 从内容中提取表格并转换为卡片元素
 * @deprecated 飞书 markdown 组件原生支持表格，请使用 convertToFeishuElements
 */
export function extractTablesAsElements(content: string): {
  elements: FeishuMarkdownComponent[];
  remainingContent: string;
} {
  const result = convertToFeishuElements(content, { extractHeader: false });
  return {
    elements: result.elements,
    remainingContent: "",
  };
}
