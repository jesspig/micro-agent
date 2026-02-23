/**
 * MCP 模块入口
 */

// 版本
export { MCP_VERSION } from './types'

// 类型
export type {
  MCPImplementation,
  MCPClientCapabilities,
  MCPServerCapabilities,
  MCPInitializeRequest,
  MCPInitializeResult,
  MCPToolDefinition,
  MCPToolCall,
  MCPToolResult,
  MCPToolResultContent,
  MCPResource,
  MCPResourceContents,
  MCPResourceTemplate,
  MCPPrompt,
  MCPPromptResult,
  MCPLogLevel,
  MCPNotification,
  MCPRequest,
  MCPResponse,
  MCPTransportConfig,
  MCPClientConfig,
} from './types'

// 客户端
export { MCPClient, createMCPClient } from './mcp-client'
