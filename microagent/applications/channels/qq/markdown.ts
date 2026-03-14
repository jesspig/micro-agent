/**
 * QQ Markdown 转换模块
 * 
 * 官方文档: https://bot.q.qq.com/wiki/develop/api-v2/server-inter/message/type/markdown.html
 * 
 * 支持：标题、加粗、斜体、删除线、链接、代码块、列表、引用、分割线
 * 不支持：表格、图片
 */

/**
 * 转换 Markdown 内容为 QQ 兼容格式
 */
export function convertMarkdown(content: string): string {
  let result = content;

  // 移除图片语法（QQ markdown 不支持外链图片）
  result = result.replace(/!\[([^\]]*)\]\([^)]+\)/g, '[$1]');

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
    const isTableSeparator = /^\|[\s\-:|]+\|$/.test(line.trim());

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
