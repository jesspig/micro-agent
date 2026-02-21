/**
 * ReAct 提示词构建器
 *
 * 用于生成 ReAct 模式的系统提示词
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** 缓存 markdown 模板 */
let cachedTemplate: string | null = null;

/**
 * 读取 ReAct 提示词模板
 */
function loadTemplate(): string {
  if (cachedTemplate) return cachedTemplate;

  const templatePath = join(__dirname, 'react.md');
  cachedTemplate = readFileSync(templatePath, 'utf-8');
  return cachedTemplate;
}

/**
 * 工具定义
 */
export interface ToolDefinition {
  name: string;
  description: string;
}

/**
 * 构建 ReAct 系统提示词
 */
export function buildReActSystemPrompt(tools: ToolDefinition[]): string {
  const template = loadTemplate();
  const toolList = tools.map(t => '- `' + t.name + '`: ' + t.description).join('\n');
  return template.replace('{{toolList}}', toolList);
}

/**
 * 构建用户消息
 */
export function buildReActUserPrompt(content: string): string {
  return content;
}

/**
 * 构建 Observation 消息
 */
export function buildObservationMessage(result: string): string {
  return `Observation: ${result}`;
}
