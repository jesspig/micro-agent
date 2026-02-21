/**
 * 应用层意图识别提示词
 *
 * 这些提示词是应用逻辑的一部分，用户不应该修改
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ModelInfo } from '@microbot/providers';

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
 * 构建模型列表文本
 */
function buildModelList(models: ModelInfo[]): string {
  return models.map(m => {
    const caps = [];
    if (m.vision) caps.push('视觉');
    if (m.think) caps.push('深度思考');
    const capStr = caps.length > 0 ? ` [${caps.join(', ')}]` : '';
    return '- ' + m.id + ' (' + m.level + ')' + capStr;
  }).join('\n');
}

/**
 * 构建意图识别系统提示词
 */
export function buildIntentSystemPrompt(models: ModelInfo[]): string {
  const template = loadTemplate();
  const modelList = buildModelList(models);

  // 替换 {{modelList}} 占位符
  return template.replace('{{modelList}}', modelList);
}

/**
 * 构建意图识别用户提示词
 */
export function buildIntentUserPrompt(content: string, hasImage: boolean): string {
  return `请分析以下用户请求${hasImage ? '（包含图片）' : ''}，选择最合适的模型：

${content}`;
}
