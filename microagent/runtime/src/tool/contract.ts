/**
 * Tool 扩展接口定义
 *
 * 扩展基础 ITool 接口，提供更丰富的类型支持
 */

import type { ITool } from "../contracts.js";
import type { ToolParameterSchema, ToolResult } from "./types.js";

// ============================================================================
// 扩展接口
// ============================================================================

/**
 * 扩展 ITool 接口
 *
 * 在基础接口上增加强类型的参数定义和执行结果
 */
export interface IToolExtended extends ITool {
  /** 工具参数 Schema */
  readonly parameters: ToolParameterSchema;

  /**
   * 执行工具
   * @param params - 工具参数
   * @returns 执行结果（包含元数据）
   */
  execute(params: Record<string, unknown>): Promise<ToolResult>;
}

// ============================================================================
// 工厂类型
// ============================================================================

/**
 * 工具工厂函数类型
 *
 * 用于延迟创建工具实例，支持按需加载
 */
export type ToolFactory = () => IToolExtended | null;
