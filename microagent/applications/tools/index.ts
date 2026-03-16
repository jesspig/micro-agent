/**
 * Tools 模块导出
 *
 * 导出所有工具实现和工厂函数
 */

import { toolsLogger, createTimer, logMethodCall, logMethodReturn, logMethodError, sanitize } from "../shared/logger.js";

const logger = toolsLogger();

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
  const timer = createTimer();
  logMethodCall(logger, { method: "getAllTools", module: "tools" });

  try {
    const tools = Object.values(toolFactories)
      .map((factory) => factory())
      .filter((tool): tool is NonNullable<typeof tool> => tool !== null);

    logMethodReturn(logger, { method: "getAllTools", module: "tools", result: sanitize({ count: tools.length }), duration: timer() });
    return tools;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logMethodError(logger, { method: "getAllTools", module: "tools", error: { name: err.name, message: err.message, ...(err.stack ? { stack: err.stack } : {}) }, duration: timer() });
    throw err;
  }
}

/**
 * 获取指定工具
 * @param name - 工具名称
 * @returns 工具实例或 null
 */
export function getTool(name: string) {
  const timer = createTimer();
  logMethodCall(logger, { method: "getTool", module: "tools", params: { name } });

  try {
    const factory = toolFactories[name];
    const tool = factory ? factory() : null;

    logMethodReturn(logger, { method: "getTool", module: "tools", result: sanitize({ found: !!tool, name }), duration: timer() });
    return tool;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logMethodError(logger, { method: "getTool", module: "tools", error: { name: err.name, message: err.message, ...(err.stack ? { stack: err.stack } : {}) }, params: { name }, duration: timer() });
    throw err;
  }
}

/**
 * 获取所有工具定义
 * @returns 工具定义数组
 */
export function getAllToolDefinitions() {
  const timer = createTimer();
  logMethodCall(logger, { method: "getAllToolDefinitions", module: "tools" });

  try {
    const definitions = getAllTools().map((tool) => tool.getDefinition());

    logMethodReturn(logger, { method: "getAllToolDefinitions", module: "tools", result: sanitize({ count: definitions.length }), duration: timer() });
    return definitions;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logMethodError(logger, { method: "getAllToolDefinitions", module: "tools", error: { name: err.name, message: err.message, ...(err.stack ? { stack: err.stack } : {}) }, duration: timer() });
    throw err;
  }
}
