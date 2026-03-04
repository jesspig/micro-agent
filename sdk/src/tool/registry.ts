/**
 * 工具注册表
 */

import type { Tool, ToolContext, ToolResult } from '@micro-agent/types';

/**
 * 工具注册表
 * 
 * 管理所有可用工具，提供注册、查找、执行功能。
 */
export class ToolRegistry {
  /** 已注册的工具 */
  private tools = new Map<string, Tool>();

  /**
   * 注册工具
   * @param tool - 工具实例
   * @throws {Error} 工具名已存在时抛出
   */
  register(tool: Tool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`工具已存在: ${tool.name}`);
    }
    this.tools.set(tool.name, tool);
  }

  /**
   * 获取工具
   * @param name - 工具名称
   * @returns 工具实例，不存在则返回 undefined
   */
  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  /**
   * 检查工具是否存在
   * @param name - 工具名称
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * 执行工具
   * @param name - 工具名称
   * @param input - 输入参数
   * @param ctx - 执行上下文
   * @returns 执行结果字符串
   */
  async execute(name: string, input: unknown, ctx: ToolContext): Promise<string> {
    const tool = this.tools.get(name);
    if (!tool) {
      return `错误: 未找到工具 ${name}`;
    }

    try {
      const result = await tool.execute(input, ctx);
      return this.formatResult(result);
    } catch (error) {
      return `执行错误: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  /**
   * 获取所有工具定义（用于 LLM function calling）
   * @returns 工具定义数组
   */
  getDefinitions(): Array<{ name: string; description: string; inputSchema: unknown }> {
    return Array.from(this.tools.values()).map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }));
  }

  /** 格式化结果 */
  private formatResult(result: ToolResult): string {
    const textParts = result.content
      .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
      .map(part => part.text);
    
    if (textParts.length > 0) {
      return textParts.join('\n');
    }
    
    return JSON.stringify(result.content, null, 2);
  }
}
