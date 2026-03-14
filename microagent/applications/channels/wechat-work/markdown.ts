/**
 * 企业微信 Markdown 转换模块
 * 
 * 官方文档: https://developer.work.weixin.qq.com/document/path/90248
 * 
 * 支持：标题、加粗、斜体、链接、引用、列表、颜色字体
 * 不支持：删除线、代码块、表格、图片
 * 
 * 特殊语法：
 * - 颜色字体：<font color="info/warning/comment">text</font>
 *   - info: 绿色
 *   - warning: 橙红色
 *   - comment: 灰色
 * - @群成员：<@userid>
 */

/**
 * 转换 Markdown 内容为企业微信兼容格式
 */
export function convertMarkdown(content: string): string {
  let result = content;

  // 移除图片语法
  result = result.replace(/!\[([^\]]*)\]\([^)]+\)/g, '[$1]');

  // 转换删除线为普通文本
  result = result.replace(/~~([^~]+)~~/g, '$1');

  // 转换代码块为引用块
  result = result.replace(/```(\w*)\n([\s\S]*?)```/g, '\n> ```$1\n$2\n> ```\n');

  // 转换行内代码为加粗
  result = result.replace(/`([^`]+)`/g, '**$1**');

  // 转换表格为文本列表
  result = convertTableToText(result);

  return result;
}

/**
 * 将表格转换为文本列表格式
 */
function convertTableToText(content: string): string {
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
        // 转换表格为列表
        for (const tableLine of tableLines) {
          const cells = tableLine.split('|').filter(c => c.trim());
          result.push('• ' + cells.join(' | '));
        }
        tableLines = [];
        inTable = false;
      }
      result.push(line);
    }
  }

  // 处理最后的表格
  if (inTable && tableLines.length > 0) {
    for (const tableLine of tableLines) {
      const cells = tableLine.split('|').filter(c => c.trim());
      result.push('• ' + cells.join(' | '));
    }
  }

  return result.join('\n');
}
