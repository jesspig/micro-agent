/**
 * 工具基础类型定义
 */

import type { ToolContext, ToolDefinition, Tool, ToolResult, JSONSchema } from '../../../agent-service/types/tool';

// 重新导出类型
export type { ToolContext, ToolDefinition, Tool, ToolResult };

/**
 * 工具基类
 */
export abstract class BaseTool<TInput = unknown, TOutput = unknown> implements Tool {
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly inputSchema: JSONSchema;
  
  abstract execute(input: TInput, context: ToolContext): Promise<ToolResult>;
  
  /**
   * 获取工具定义
   */
  get definition(): ToolDefinition {
    return {
      name: this.name,
      description: this.description,
      inputSchema: this.inputSchema,
    };
  }
  
  /**
   * 验证输入参数
   */
  protected validateInput(input: unknown, schema?: JSONSchema): TInput {
    if (!schema) {
      return input as TInput;
    }
    // 简单验证，可以扩展为完整的 JSON Schema 验证
    return input as TInput;
  }
}
