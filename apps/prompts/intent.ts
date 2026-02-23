/**
 * 应用层意图识别提示词
 *
 * 这些提示词是应用逻辑的一部分，用户不应该修改
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// 缓存 markdown 模板
let cachedTemplate: string | null = null;

/**
 * 读取意图识别提示词模板
 */
function loadTemplate(): string {
  if (cachedTemplate) return cachedTemplate;

  const templatePath = join(__dirname, 'intent.md');
  cachedTemplate = readFileSync(templatePath, 'utf-8');
  return cachedTemplate;
}

/**
 * 构建意图识别系统提示词
 */
export function buildIntentSystemPrompt(_models: unknown[]): string {
  return loadTemplate();
}

/**
 * 构建意图识别用户提示词
 */
export function buildIntentUserPrompt(content: string, hasImage: boolean): string {
  return `请分析以下用户请求${hasImage ? '（包含图片）' : ''}，判断任务类型：

${content}`;
}
