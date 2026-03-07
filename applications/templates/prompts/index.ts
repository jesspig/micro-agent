/**
 * Prompt 模板索引
 *
 * 导出提示词模板相关内容
 */

import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * 获取提示词模板目录
 */
export function getPromptsDir(): string {
  return import.meta.dir;
}

/**
 * 列出可用提示词模板
 */
export function listPromptTemplates(): string[] {
  const dir = getPromptsDir();
  try {
    return readdirSync(dir, { recursive: true, withFileTypes: true })
      .filter(f => f.isFile() && (f.name.endsWith('.md') || f.name.endsWith('.mdx')))
      .map(f => f.name);
  } catch {
    return [];
  }
}

/**
 * 读取提示词模板
 */
export function readPromptTemplate(name: string): string | null {
  const dir = getPromptsDir();
  try {
    const filePath = join(dir, name);
    return readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

// 空模块导出
export {};
