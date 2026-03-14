/**
 * 钉钉 Markdown 转换模块
 * 
 * 官方文档: https://open.dingtalk.com/document/robots/internal-chatbot-enables-group-chat-to-send-markdown-messages
 * 
 * 支持：标题、加粗、斜体、删除线、链接、代码块、列表、引用、图片
 * 不支持：表格
 * 
 * 钉钉 Markdown 支持最为完整，仅需处理表格转换
 */

/**
 * 转换 Markdown 内容为钉钉兼容格式
 */
export function convertMarkdown(content: string): string {
  let result = content;

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
        result.push('```');
        result.push(...tableLines);
        result.push('```');
        tableLines = [];
        inTable = false;
      }
      result.push(line);
    }
  }

  if (inTable && tableLines.length > 0) {
    result.push('```');
    result.push(...tableLines);
    result.push('```');
  }

  return result.join('\n');
}
