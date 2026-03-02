/**
 * 知识库内容提取器
 * 
 * 根据文件类型提取文档内容
 * 支持：Markdown, Text, PDF, Word, Excel, CSV, PowerPoint 等
 */

import { readFile } from 'fs/promises';
import { basename, extname } from 'path';
import type { KnowledgeDocType } from './types';
import { getLogger } from '@logtape/logtape';

const log = getLogger(['knowledge', 'extractor']);

// 可选依赖的类型定义
export interface MammothModule {
  extractRawText(input: { path: string }): Promise<{ value: string; messages: string[] }>;
}

export interface XLSXModule {
  readFile(path: string): {
    SheetNames: string[];
    Sheets: Record<string, unknown>;
  };
  utils: {
    sheet_to_json<T>(worksheet: unknown, opts?: { header?: number }): T[];
  };
}

// pdf-parse v2 API 类型定义
export interface PDFParseResult {
  text: string;
  total: number;
  pages?: unknown[];
}

export interface PDFParseClass {
  new (params: { data: Buffer }): PDFParseClass;
  getText(): Promise<PDFParseResult>;
  destroy(): Promise<void>;
}

// 兼容类型（用于动态导入时的类型断言）
interface MammothResult {
  value: string;
  messages: Array<{ type: string; message: string }>;
}

/**
 * 提取文档内容
 * 根据文件类型使用不同的提取策略
 * 支持懒加载可选依赖
 */
export async function extractDocumentContent(
  filePath: string,
  fileType: KnowledgeDocType
): Promise<string> {
  const ext = extname(filePath).toLowerCase();

  // CSV/TSV 文件 - 解析为表格文本
  if (fileType === 'csv' || ext === '.csv' || ext === '.tsv') {
    const rawContent = await readFile(filePath, 'utf-8');
    return parseCSVContent(rawContent, ext === '.tsv' ? '\t' : ',');
  }

  // Word 文档 (.docx)
  if (fileType === 'word' && ext === '.docx') {
    try {
      const mammoth = (await import('mammoth')) as unknown as MammothModule;
      const result = await mammoth.extractRawText({ path: filePath });
      return `[Word 文档: ${basename(filePath)}]\n\n${result.value}`;
    } catch (error) {
      return `[Word 文档: ${basename(filePath)}]\n\n注意: 解析失败。请安装解析库: bun add mammoth\n错误: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  // Excel 表格 (.xlsx, .xls)
  if (fileType === 'excel' && (ext === '.xlsx' || ext === '.xls')) {
    try {
      const xlsx = (await import('xlsx')) as unknown as XLSXModule;
      const workbook = xlsx.readFile(filePath);

      const result: string[] = [];
      result.push(`[Excel 表格: ${basename(filePath)}]`);
      result.push(`工作表数量: ${workbook.SheetNames.length}`);
      result.push('');

      // 解析每个工作表
      for (const sheetName of workbook.SheetNames.slice(0, 3)) {
        // 最多3个工作表
        const worksheet = workbook.Sheets[sheetName];
        const data = xlsx.utils.sheet_to_json(worksheet, { header: 1 }) as unknown[][];

        result.push(`--- 工作表: ${sheetName} ---`);
        result.push(`行数: ${data.length}`);

        // 前10行数据预览
        const previewRows = Math.min(data.length, 10);
        for (let i = 0; i < previewRows; i++) {
          const row = data[i];
          if (Array.isArray(row) && row.length > 0) {
            result.push(`行 ${i + 1}: ${row.join(' | ')}`);
          }
        }

        if (data.length > 10) {
          result.push(`... (还有 ${data.length - 10} 行)`);
        }
        result.push('');
      }

      if (workbook.SheetNames.length > 3) {
        result.push(`... (还有 ${workbook.SheetNames.length - 3} 个工作表)`);
      }

      return result.join('\n');
    } catch (error) {
      return `[Excel 表格: ${basename(filePath)}]\n\n注意: 解析失败。请安装解析库: bun add xlsx\n错误: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  // 旧版 Word (.doc) 不支持，提示转换
  if (fileType === 'word' && ext === '.doc') {
    return `[Word 文档: ${basename(filePath)}]\n\n注意: .doc 格式需要额外工具。建议转换为 .docx 或 .txt 格式后重新上传。`;
  }

  // PowerPoint 演示文稿 - 暂不支持，提示转换
  if (fileType === 'powerpoint' || ext === '.pptx' || ext === '.ppt') {
    return `[PowerPoint 演示文稿: ${basename(filePath)}]\n\n注意: PowerPoint 解析暂不支持。建议:\n1. 转换为 PDF 后上传\n2. 或使用 "另存为图片" 导出后通过图片方式查看`;
  }

  // PDF 文档
  if (fileType === 'pdf' || ext === '.pdf') {
    try {
      // pdf-parse v2 API: new PDFParse({ data: buffer }) + getText()
      const { PDFParse } = await import('pdf-parse');
      const dataBuffer = await readFile(filePath);
      const parser = new PDFParse({ data: dataBuffer });
      const result = await parser.getText();
      await parser.destroy();
      log.info('PDF 解析成功', { file: basename(filePath), pages: result.total, textLength: result.text.length });
      return `[PDF 文档: ${basename(filePath)}]\n\n${result.text}`;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      log.error('PDF 解析失败', { file: basename(filePath), error: errorMsg });
      return `[PDF 文档: ${basename(filePath)}]\n\n注意: PDF 解析失败。\n错误: ${errorMsg}`;
    }
  }

  // 其他类型 - 直接读取为文本
  return await readFile(filePath, 'utf-8');
}

/**
 * 解析 CSV/TSV 内容为可读文本
 */
export function parseCSVContent(content: string, delimiter: string = ','): string {
  const lines = content.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length === 0) return '';

  // 解析表头
  const headers = lines[0].split(delimiter).map((h) => h.trim().replace(/^["']|["']$/g, ''));

  // 构建表格文本表示
  const result: string[] = [];
  result.push('表格数据:');
  result.push('');
  result.push(`列数: ${headers.length}, 行数: ${lines.length - 1}`);
  result.push(`列名: ${headers.join(', ')}`);
  result.push('');

  // 前10行数据预览
  const previewRows = Math.min(lines.length - 1, 10);
  for (let i = 1; i <= previewRows; i++) {
    const values = lines[i].split(delimiter).map((v) => v.trim().replace(/^["']|["']$/g, ''));
    result.push(`行 ${i}: ${values.join(' | ')}`);
  }

  if (lines.length > 11) {
    result.push(`... (还有 ${lines.length - 11} 行)`);
  }

  return result.join('\n');
}
