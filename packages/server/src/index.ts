/**
 * Server 模块入口
 */

// Events
export type { InboundMessage, OutboundMessage, SessionKey } from './events';

// Queue
export { MessageBus } from './queue';

// Channel
export { ChannelManager } from './manager';
export type { Channel, InboundMessageParams } from './channel';
export { ChannelHelper } from './channel';

// HTTP Server
export {
  createHTTPServer,
  jsonResponse,
  errorResponse,
  AuthManager,
  type HTTPServerConfig,
  type HTTPServerInstance,
  type AuthConfig,
  type AuthResult,
} from './http';

// LLM API
export {
  createChatCompletionsHandler,
  createModelsHandler,
  type ChatCompletionsRequest,
  type ChatCompletionsResponse,
  type ModelInfo,
  type ModelsResponse,
  type ModelProvider,
} from './llm';

// ACP Server
export {
  ACPServer,
  createACPServer,
  DEFAULT_ACP_CAPABILITIES,
  type ACPServerConfig,
  type ACPCapabilities,
} from './acp';

// MCP Server
export {
  MCPServer,
  createMCPServer,
  MCPHandlers,
  createMCPHandlers,
  type MCPServerConfig,
  type ToolHandler,
  type ResourceHandler,
  type PromptHandler,
  type MCPServerLike,
} from './mcp';
