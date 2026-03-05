/**
 * 提示词模板
 *
 * 管理系统提示词和任务提示词模板。
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { getConfig } from './settings';
import { getLogger } from '@logtape/logtape';

const log = getLogger(['config', 'prompts']);

/** 提示词模板 */
export interface PromptTemplate {
  /** 模板名称 */
  name: string;
  /** 模板内容 */
  content: string;
  /** 变量列表 */
  variables: string[];
}

/** 提示词模板缓存 */
const templateCache = new Map<string, PromptTemplate>();

/**
 * 提示词管理器
 */
export class PromptManager {
  private config = getConfig();

  /**
   * 获取提示词模板
   */
  getTemplate(name: string): PromptTemplate | null {
    // 检查缓存
    if (templateCache.has(name)) {
      return templateCache.get(name)!;
    }

    // 尝试从文件加载
    const template = this.loadTemplateFromFile(name);
    if (template) {
      templateCache.set(name, template);
      return template;
    }

    // 使用内置模板
    const builtin = this.getBuiltinTemplate(name);
    if (builtin) {
      templateCache.set(name, builtin);
      return builtin;
    }

    log.warn('[PromptManager] 模板不存在', { name });
    return null;
  }

  /**
   * 渲染提示词模板
   */
  render(name: string, variables: Record<string, string>): string {
    const template = this.getTemplate(name);
    if (!template) {
      return '';
    }

    let content = template.content;

    // 替换变量
    for (const key of template.variables) {
      const value = variables[key] || '';
      content = content.replace(new RegExp(`{{${key}}}`, 'g'), value);
    }

    return content;
  }

  /**
   * 注册自定义模板
   */
  registerTemplate(template: PromptTemplate): void {
    templateCache.set(template.name, template);
    log.debug('[PromptManager] 模板已注册', { name: template.name });
  }

  /**
   * 从文件加载模板
   */
  private loadTemplateFromFile(name: string): PromptTemplate | null {
    const promptsDir = this.config.getConfigDir('prompts');
    const filePath = join(promptsDir, `${name}.md`);

    if (!existsSync(filePath)) {
      return null;
    }

    try {
      const content = readFileSync(filePath, 'utf-8');
      const variables = this.extractVariables(content);

      return { name, content, variables };
    } catch (error) {
      log.error('[PromptManager] 加载模板失败', { name, error: String(error) });
      return null;
    }
  }

  /**
   * 提取模板变量
   */
  private extractVariables(content: string): string[] {
    const matches = content.matchAll(/{{(\w+)}}/g);
    return Array.from(matches, m => m[1]);
  }

  /**
   * 获取内置模板
   */
  private getBuiltinTemplate(name: string): PromptTemplate | null {
    const templates: Record<string, string> = {
      'system': `你是一个 AI 助手，名为 MicroAgent。

你的能力：
- 回答问题和提供帮助
- 使用工具完成特定任务
- 记忆用户偏好和历史对话

请用中文回答问题，保持简洁友好。`,
      'react': `你是一个能够使用工具的 AI 助手。

你可以使用以下工具：
{{tools}}

执行步骤：
1. 思考（Thought）：分析当前情况
2. 行动（Action）：选择合适的工具
3. 观察（Observation）：查看工具执行结果
4. 重复直到完成

请以 JSON 格式输出：
{
  "thought": "你的思考",
  "action": "工具名称",
  "action_input": "工具参数"
}

完成后输出：
{
  "thought": "最终思考",
  "action": "finish",
  "action_input": "最终答案"
}`,
      'planner': `你是一个任务规划专家。

请将以下任务分解为可执行的子任务。

任务：{{task}}

请按照以下要求：
1. 每个子任务应该是独立的、可执行的
2. 标识子任务之间的依赖关系
3. 为每个子任务生成唯一ID

请以 JSON 格式输出：
{
  "reasoning": "分解理由",
  "subTasks": [
    {
      "id": "task-1",
      "description": "任务描述",
      "dependencies": []
    }
  ]
}`,
    };

    const content = templates[name];
    if (!content) {
      return null;
    }

    const variables = this.extractVariables(content);
    return { name, content, variables };
  }

  /**
   * 清除模板缓存
   */
  clearCache(): void {
    templateCache.clear();
    log.debug('[PromptManager] 模板缓存已清除');
  }
}

// 导出全局实例
let globalPromptManager: PromptManager | null = null;

/**
 * 获取全局提示词管理器
 */
export function getPromptManager(): PromptManager {
  if (!globalPromptManager) {
    globalPromptManager = new PromptManager();
  }
  return globalPromptManager;
}

/**
 * 设置全局提示词管理器
 */
export function setPromptManager(manager: PromptManager): void {
  globalPromptManager = manager;
}