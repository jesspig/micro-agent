/**
 * defineTool - 工具定义快捷函数
 */

import type { JSONSchema, Tool, ToolContext, ToolResult, ToolExample, ContentPart } from '@micro-agent/types';

/**
 * 工具定义选项
 */
export interface DefineToolOptions<TInput = unknown> {
  /** 工具名称 */
  name: string;
  /** 工具描述（支持 Markdown 格式，建议包含使用场景、注意事项） */
  description: string;
  /** 输入参数 Schema（JSON Schema 格式） */
  inputSchema: JSONSchema;
  /** 工具调用示例（帮助 LLM 理解用法） */
  examples?: readonly ToolExample[];
  /** 执行函数 */
  execute: (input: TInput, ctx: ToolContext) => Promise<string | ToolResult>;
}

/**
 * 定义工具
 * 
 * 快捷函数，用于创建符合 Tool 接口的对象。
 * 
 * @example
 * ```typescript
 * import { defineTool } from 'micro-agent';
 * 
 * export const myTool = defineTool({
 *   name: 'my_tool',
 *   description: `我的自定义工具。
 * 
 * **使用场景**：
 * - 场景一描述
 * - 场景二描述`,
 *   inputSchema: {
 *     type: 'object',
 *     properties: {
 *       message: { type: 'string', description: '输入消息' },
 *     },
 *     required: ['message'],
 *   },
 *   examples: [
 *     { description: '基本用法', input: { message: 'Hello' } },
 *   ],
 *   execute: async (input, ctx) => {
 *     return `处理结果: ${input.message}`;
 *   },
 * });
 * ```
 */
export function defineTool<TInput = unknown>(
  options: DefineToolOptions<TInput>
): Tool {
  const { name, description, inputSchema, examples, execute } = options;

  return {
    name,
    description,
    inputSchema,
    examples,
    execute: async (input: unknown, ctx: ToolContext): Promise<ToolResult> => {
      const result = await execute(input as TInput, ctx);
      if (typeof result === 'string') {
        return { content: [{ type: 'text', text: result }] };
      }
      return result;
    },
  };
}
