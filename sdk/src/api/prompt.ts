/**
 * 提示词 API
 * 
 * 提示词模板通过 SDK API 传入，不持久化。
 */

import type { PromptTemplate } from '../client/types';

interface Transport {
  send(method: string, params: unknown): Promise<unknown>;
}

/**
 * 提示词 API
 */
export class PromptAPI {
  private templates = new Map<string, PromptTemplate>();

  constructor(private transport: Transport) {}

  /**
   * 注册模板
   */
  register(template: PromptTemplate): void {
    this.templates.set(template.id, template);
  }

  /**
   * 获取模板
   */
  get(id: string): PromptTemplate | undefined {
    return this.templates.get(id);
  }

  /**
   * 渲染模板（填充变量）
   */
  render(id: string, variables: Record<string, unknown>): string {
    const template = this.templates.get(id);
    if (!template) {
      throw new Error(`模板不存在: ${id}`);
    }

    let content = template.content;
    for (const [key, value] of Object.entries(variables)) {
      const placeholder = `{{${key}}}`;
      content = content.replace(new RegExp(placeholder, 'g'), String(value));
    }

    return content;
  }

  /**
   * 列出所有模板
   */
  list(): PromptTemplate[] {
    return Array.from(this.templates.values());
  }
}
