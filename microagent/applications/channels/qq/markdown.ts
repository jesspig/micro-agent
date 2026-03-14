/**
 * QQ Markdown 转换模块
 * 
 * 官方文档: https://bot.q.qq.com/wiki/develop/api-v2/server-inter/message/type/markdown.html
 * 
 * 支持：标题、加粗、斜体、删除线、链接、代码块、列表、引用、分割线
 * 不支持：表格、图片
 */

// ============================================================================
// 预编译正则表达式（模块加载时只编译一次，避免重复编译开销）
// ============================================================================

/** 图片语法正则：匹配 ![alt](url) 格式 */
const IMAGE_SYNTAX_REGEX = /!\[([^\]]*)\]\([^)]+\)/g;

/** 表格分隔行正则：匹配 |---|---| 格式的分隔行 */
const TABLE_SEPARATOR_REGEX = /^\|[\s\-:|]+\|$/;

// ============================================================================

/**
 * 转换 Markdown 内容为 QQ 兼容格式
 */
export function convertMarkdown(content: string): string {
  let result = content;

  // 移除图片语法（QQ markdown 不支持外链图片）
  // 重置正则 lastIndex（全局正则需要重置）
  IMAGE_SYNTAX_REGEX.lastIndex = 0;
  result = result.replace(IMAGE_SYNTAX_REGEX, '[$1]');

  // 转换表格为代码块
  result = convertTableToCodeBlock(result);

  return result;
}

/**
 * 将表格转换为代码块格式
 */
function convertTableToCodeBlock(content: string): string {
  const lines = content.split('\n');
  const result: string[] = [];
  let inTable = false;
  let tableLines: string[] = [];

  for (const line of lines) {
    const isTableRow = line.trim().startsWith('|') && line.trim().endsWith('|');
    const isTableSeparator = TABLE_SEPARATOR_REGEX.test(line.trim());

    if (isTableRow && !isTableSeparator) {
      if (!inTable) {
        inTable = true;
        tableLines = [];
      }
      tableLines.push(line);
    } else {
      if (inTable) {
        // 转换表格为代码块
        result.push('```');
        result.push(...tableLines);
        result.push('```');
        tableLines = [];
        inTable = false;
      }
      result.push(line);
    }
  }

  // 处理最后的表格
  if (inTable && tableLines.length > 0) {
    result.push('```');
    result.push(...tableLines);
    result.push('```');
  }

  return result.join('\n');
}
