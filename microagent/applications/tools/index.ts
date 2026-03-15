/**
 * Tools 模块导出
 *
 * 导出所有工具实现和工厂函数
 */

// ============================================================================
// 工具实现
// ============================================================================

export { FilesystemTool } from "./filesystem.js";
export { ShellTool } from "./shell.js";
export { WebTool } from "./web.js";

// ============================================================================
// MCP 工具模块
// ============================================================================

export {
  MCPManager,
  mcpManager,
  MCPToolWrapper,
  type MCPConfig,
  type MCPServerConfig,
  type MCPServerInfo,
  type MCPServerStatus,
  type MCPToolDefinition,
} from "./mcp/index.js";

// ============================================================================
// 工具工厂
// ============================================================================

import type { ToolFactory } from "../../runtime/tool/contract.js";
import { FilesystemTool } from "./filesystem.js";
import { ShellTool } from "./shell.js";
import { WebTool } from "./web.js";

/**
 * 工具工厂映射
 *
 * 用于按需创建工具实例
 */
export const toolFactories: Record<string, ToolFactory> = {
  filesystem: () => new FilesystemTool(),
  shell: () => new ShellTool(),
  web: () => new WebTool(),
};

/**
 * 获取所有工具实例
 * @returns 工具实例数组
 */
export function getAllTools() {
  return Object.values(toolFactories)
    .map((factory) => factory())
    .filter((tool): tool is NonNullable<typeof tool> => tool !== null);
}

/**
 * 获取指定工具
 * @param name - 工具名称
 * @returns 工具实例或 null
 */
export function getTool(name: string) {
  const factory = toolFactories[name];
  return factory ? factory() : null;
}

/**
 * 获取所有工具定义
 * @returns 工具定义数组
 */
export function getAllToolDefinitions() {
  return getAllTools().map((tool) => tool.getDefinition());
}
