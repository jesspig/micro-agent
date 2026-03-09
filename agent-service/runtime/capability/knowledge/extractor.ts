/**
 * 知识库内容提取器
 */

import { readFile } from 'fs/promises';
import { basename, extname } from 'path';
import type { KnowledgeDocType } from './types';

// getLogger 已导入但 log 变量未使用，此处保留 getLogger 供将来使用
// import { getLogger } from '@logtape/logtape';

/**
 * 提取文档内容
 */
export async function extractDocumentContent(
  filePath: string,
  fileType: KnowledgeDocType
): Promise<string> {
  const ext = extname(filePath).toLowerCase();

  // CSV/TSV 文件
  if (fileType === 'csv' || ext === '.csv' || ext === '.tsv') {
    const rawContent = await readFile(filePath, 'utf-8');
    return parseCSVContent(rawContent, ext === '.tsv' ? '\t' : ',');
  }

  // Word 文档
  if (fileType === 'word' && ext === '.docx') {
    try {
      const mammoth = await import('mammoth');
      const result = await mammoth.extractRawText({ path: filePath });
      return `[Word 文档: ${basename(filePath)}]\n\n${result.value}`;
    } catch (error) {
      return `[Word 文档: ${basename(filePath)}]\n\n解析失败，请安装: bun add mammoth`;
    }
  }

  // Excel 表格
  if (fileType === 'excel' && (ext === '.xlsx' || ext === '.xls')) {
    try {
      const xlsx = await import('xlsx');
      const workbook = xlsx.readFile(filePath);
      const result: string[] = [`[Excel 表格: ${basename(filePath)}]`, ''];

      for (const sheetName of workbook.SheetNames.slice(0, 3)) {
        const worksheet = workbook.Sheets[sheetName];
        const data = xlsx.utils.sheet_to_json(worksheet, { header: 1 }) as unknown[][];
        result.push(`--- 工作表: ${sheetName} ---`);
        for (let i = 0; i < Math.min(data.length, 10); i++) {
          const row = data[i];
          if (Array.isArray(row)) {
            result.push(`行 ${i + 1}: ${row.join(' | ')}`);
          }
        }
        result.push('');
      }

      return result.join('\n');
    } catch (error) {
      return `[Excel 表格: ${basename(filePath)}]\n\n解析失败，请安装: bun add xlsx`;
    }
  }

  // PDF 文档
  if (fileType === 'pdf' || ext === '.pdf') {
    try {
      const { PDFParse } = await import('pdf-parse');
      const dataBuffer = await readFile(filePath);
      const parser = new PDFParse({ data: dataBuffer });
      const result = await parser.getText();
      await parser.destroy();
      return `[PDF 文档: ${basename(filePath)}]\n\n${result.text}`;
    } catch (error) {
      return `[PDF 文档: ${basename(filePath)}]\n\n解析失败: ${String(error)}`;
    }
  }

  // 其他类型 - 直接读取
  return await readFile(filePath, 'utf-8');
}

/**
 * 解析 CSV 内容
 */
export function parseCSVContent(content: string, delimiter: string = ','): string {
  const lines = content.split(/\r?\n/).filter(line => line.trim());
  if (lines.length === 0) return '';

  const headers = lines[0].split(delimiter).map(h => h.trim().replace(/^["']|["']$/g, ''));

  const result: string[] = [
    '表格数据:',
    '',
    `列数: ${headers.length}, 行数: ${lines.length - 1}`,
    `列名: ${headers.join(', ')}`,
    '',
  ];

  for (let i = 1; i <= Math.min(lines.length - 1, 10); i++) {
    const values = lines[i].split(delimiter).map(v => v.trim().replace(/^["']|["']$/g, ''));
    result.push(`行 ${i}: ${values.join(' | ')}`);
  }

  if (lines.length > 11) {
    result.push(`... (还有 ${lines.length - 11} 行)`);
  }

  return result.join('\n');
}
