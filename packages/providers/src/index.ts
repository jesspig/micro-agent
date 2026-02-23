/**
 * Providers 模块入口
 */

// 基础类型和接口
export {
  type MessageRole,
  type ToolCall,
  type ContentPart,
  type TextContentPart,
  type ImageUrlContentPart,
  type MessageContent,
  type LLMMessage,
  type LLMResponse,
  type LLMToolDefinition,
  type LLMProvider,
  type OpenAIMessage,
  type OpenAIResponse,
  type GenerationConfig,
  type UsageStats,
  parseOpenAIResponse,
  toOpenAIMessages,
} from './base';

// Provider 实现
export { OpenAICompatibleProvider, type OpenAICompatibleConfig } from './openai-compatible';

// Gateway
export { LLMGateway, type GatewayConfig } from './gateway';

// Model Config
export { ModelConfigService, type ModelValidationError, type ModelValidationResult } from './model-config';

// Model Router
export { ModelRouter, type ModelRouterConfig, type RouteResult } from './router';

// 媒体检测
export { hasImageMedia } from './complexity';

// 提示词类型
export { type TaskTypeResult, type TaskType, type ModelInfo, type IntentPromptBuilder, type UserPromptBuilder } from './prompts';

// ACP (Agent Client Protocol)
export {
  ACPClient,
  ACPAdapter,
  createACPAdapter,
  type ACPClientConfig,
  type ACPAdapterConfig,
  type ACPAgent,
  type ACPConnection,
  type SessionInfo,
  type ContentBlock,
  type ToolCallContent,
  type Usage,
} from './acp';

// A2A (Agent-to-Agent)
export {
  parseAgentCard,
  createAgentCard,
  A2AClient,
  createA2AClient,
  type AgentCard,
  type AgentCapabilities,
  type AgentSkill,
  type AgentAuthentication,
  type AgentEndpoint,
  type ParsedAgentCard,
  type A2ARole,
  type A2AMessage,
  type A2APart,
  type A2ATaskStatus,
  type A2ATask,
  type A2AArtifact,
  type A2AClientConfig,
} from './a2a';

// MCP (Model Context Protocol)
export {
  MCP_VERSION,
  MCPClient,
  createMCPClient,
  type MCPImplementation,
  type MCPClientCapabilities,
  type MCPServerCapabilities,
  type MCPInitializeRequest,
  type MCPInitializeResult,
  type MCPToolDefinition,
  type MCPToolCall,
  type MCPToolResult,
  type MCPToolResultContent,
  type MCPResource,
  type MCPResourceContents,
  type MCPResourceTemplate,
  type MCPPrompt,
  type MCPPromptResult,
  type MCPLogLevel,
  type MCPNotification,
  type MCPRequest,
  type MCPResponse,
  type MCPTransportConfig,
  type MCPClientConfig,
} from './mcp';

// 工具函数
export { convertToPlainText, buildUserContent, isValidImageUrl, isImageUrl } from './utils';
