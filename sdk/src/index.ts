/**
 * MicroAgent SDK
 * 
 * 轻量级 AI Agent SDK，用于与 Agent Service 通信。
 */

// 客户端
export { MicroAgentClient, createClient } from './api/client';
export type { SDKClientConfig, RuntimeConfig, PromptTemplate, StreamHandler } from './api/client';

// API 模块
export { SessionAPI } from './api/session';
export { ChatAPI, type ChatOptions } from './api/chat';
export { TaskAPI, type TaskInfo } from './api/task';
export { MemoryAPI, type MemorySearchOptions } from './api/memory';
export { ConfigAPI } from './api/config';
export { PromptAPI } from './api/prompt';

// 传输层
export { HTTPTransport } from './transport/http';
export { WebSocketTransport } from './transport/websocket';
export { IPCTransport } from './transport/ipc';

// 客户端核心
export { RequestBuilder } from './client/request-builder';
export { ResponseParser } from './client/response-parser';
export { ErrorHandler, SDKError } from './client/error-handler';
export type { SDKErrorCode } from './client/error-handler';
export type { SDKRequest, SDKResponse, StreamChunk } from './client/types';

// 工具定义
export { ToolBuilder } from './tool/builder';
export { BaseTool } from './tool/base';
export { ToolRegistry } from './tool/registry';

// 扩展定义
export { defineChannel } from './define/define-channel';
export { defineSkill } from './define/define-skill';
export { defineTool } from './define/define-tool';

// 类型重导出
export type {
  Tool,
  ToolDefinition,
  ToolResult,
  ToolContext,
  ToolCall,
} from './tool/base';

export type {
  Extension,
  ExtensionDescriptor,
  ExtensionContext,
} from './define/index';
