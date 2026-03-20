/**
 * MCP 工具模块入口
 *
 * 导出 MCP 客户端、工具包装器和管理器
 */

// 类型
export type {
  MCPConfig,
  MCPServerConfig,
  MCPServerInfo,
  MCPServerStatus,
  MCPToolDefinition,
  MCPToolInputSchema,
  MCPTransportType,
  MCPGlobalSettings,
  MCPToolResult,
} from "./types.js";

// 客户端
export {
  connectMCPServer,
  callMCPTool,
  type MCPConnectionResult,
} from "./client.js";

// 工具包装器
export { MCPToolWrapper } from "./wrapper.js";

// 管理器
export { MCPManager } from "./manager.js";