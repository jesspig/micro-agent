/**
 * Tool 模块导出
 *
 * 统一导出工具相关的类型和实现
 */

// 类型导出
export type {
  ToolParameterSchema,
  ToolResult,
  ToolPolicy,
  ToolGroup,
  JSONSchema,
} from "./types.js";

export type { IToolExtended, ToolFactory } from "./contract.js";

// 实现导出
export { BaseTool } from "./base.js";
export { ToolRegistry, TOOL_GROUPS } from "./registry.js";
