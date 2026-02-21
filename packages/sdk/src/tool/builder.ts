/**
 * 工具构建器
 */

import type { Tool, ToolContext, JSONSchema, ToolResult } from '@microbot/types';

/**
 * 工具构建器选项
 */
export interface ToolBuilderOptions<TInput = unknown> {
  /** 工具名称 */
  name: string;
  /** 工具描述 */
  description: string;
  /** 输入参数 Schema（JSON Schema 格式） */
  inputSchema: JSONSchema;
  /** 执行函数 */
  execute: (input: TInput, ctx: ToolContext) => Promise<string | ToolResult>;
}

/**
 * 工具构建器
 * 
 * 提供流畅的 API 来创建工具。
 */
export class ToolBuilder<TInput = unknown> {
  private options: Partial<ToolBuilderOptions<TInput>> = {};

  /**
   * 设置工具名称
   */
  name(name: string): this {
    this.options.name = name;
    return this;
  }

  /**
   * 设置工具描述
   */
  description(description: string): this {
    this.options.description = description;
    return this;
  }

  /**
   * 设置输入参数 Schema（JSON Schema 格式）
   */
  inputSchema(schema: JSONSchema): this {
    this.options.inputSchema = schema;
    return this;
  }

  /**
   * 设置执行函数
   */
  execute(fn: (input: TInput, ctx: ToolContext) => Promise<string | ToolResult>): this {
    this.options.execute = fn;
    return this;
  }

  /**
   * 构建工具实例
   */
  build(): Tool {
    const { name, description, inputSchema, execute } = this.options;

    if (!name) throw new Error('工具名称未设置');
    if (!description) throw new Error('工具描述未设置');
    if (!inputSchema) throw new Error('输入参数 Schema 未设置');
    if (!execute) throw new Error('执行函数未设置');

    return {
      name,
      description,
      inputSchema,
      execute: async (input: unknown, ctx: ToolContext): Promise<ToolResult> => {
        const result = await execute(input as TInput, ctx);
        if (typeof result === 'string') {
          return { content: [{ type: 'text', text: result }] };
        }
        return result;
      },
    };
  }
}

/**
 * 创建工具构建器
 */
export function createToolBuilder<TInput = unknown>(): ToolBuilder<TInput> {
  return new ToolBuilder<TInput>();
}
