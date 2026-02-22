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
 * @param tools 工具定义列表
 * @param skillsPrompt 可选的 skills prompt（包含 skills 摘要和使用规则）
 */
export function buildReActSystemPrompt(tools: ToolDefinition[], skillsPrompt?: string): string {
  const template = loadTemplate();
  const toolList = tools.map(t => '- `' + t.name + '`: ' + t.description).join('\n');
  let result = template.replace('{{toolList}}', toolList);

  // 注入 skills 信息（如果有）
  if (skillsPrompt?.trim()) {
    result += '\n\n---\n\n' + skillsPrompt.trim();
  }

  return result;
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
