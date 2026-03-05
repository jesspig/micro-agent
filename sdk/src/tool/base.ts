/**
 * 工具基础类型定义
 */

import type { ToolContext, ToolDefinition, Tool, JSONSchema, ToolResult } from '@micro-agent/types';

// 重新导出类型
export type { ToolContext, ToolDefinition, Tool, ToolResult };

/**
 * 工具基类
 */
export abstract class BaseTool<TInput = unknown, TOutput = unknown> implements Tool<TInput, TOutput> {
  abstract readonly definition: ToolDefinition;
  
  abstract execute(input: TInput, context: ToolContext): Promise<ToolResult<TOutput>>;
  
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
