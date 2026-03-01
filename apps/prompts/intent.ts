/**
 * 应用层意图识别提示词
 *
 * 分阶段提示词：
 * 1. preflight.md - 预处理阶段，决定是否检索记忆
 * 2. routing.md - 模型选择阶段，决定使用哪个模型
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// 缓存 markdown 模板
const templateCache = new Map<string, string>();

/**
 * 读取提示词模板
 */
function loadTemplate(name: string): string {
  if (templateCache.has(name)) {
    return templateCache.get(name)!;
  }

  const templatePath = join(__dirname, `${name}.md`);
  const content = readFileSync(templatePath, 'utf-8');
  templateCache.set(name, content);
  return content;
}

// ============================================================================
// 预处理阶段提示词
// ============================================================================

/**
 * 构建预处理阶段提示词
 */
export function buildPreflightPrompt(content: string, hasImage: boolean): string {
  const template = loadTemplate('preflight');
  return `${template}

---

请分析以下用户请求${hasImage ? '（包含图片）' : ''}：

${content}`;
}

// ============================================================================
// 模型选择阶段提示词
// ============================================================================

/**
 * 构建模型选择阶段提示词
 */
export function buildRoutingPrompt(content: string, hasImage: boolean): string {
  const template = loadTemplate('routing');
  return `${template}

---

请分析以下用户请求${hasImage ? '（包含图片）' : ''}：

${content}`;
}

// ============================================================================
// 兼容旧版接口
// ============================================================================

/**
 * 构建意图识别系统提示词（兼容旧版）
 * @deprecated 使用 buildRoutingPrompt 代替
 */
export function buildIntentSystemPrompt(_models: unknown[]): string {
  return loadTemplate('routing');
}

/**
 * 构建意图识别用户提示词（兼容旧版）
 * @deprecated 使用 buildRoutingPrompt 代替
 */
export function buildIntentUserPrompt(content: string, hasImage: boolean): string {
  return buildRoutingPrompt(content, hasImage);
}
