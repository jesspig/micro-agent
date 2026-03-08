/**
 * MicroAgent SDK Client
 * 
 * 稳定的客户端 API，适合大多数开发者使用。
 * 如需访问运行时内部实现，请使用 @micro-agent/sdk/runtime。
 */

// ============ SDK Client Types ============
export type {
  ToolConfig,
  SkillConfig,
  MemoryConfig,
  KnowledgeConfig,
  RuntimeConfig,
  StreamChunk,
  SDKClientConfig,
  PromptTemplate,
  StreamHandler,
  LLMMessage,
  ToolCall,
  ExecutionContext,
  TaskStatus,
  SDKRequest,
  SDKResponse,
  TransportType,
  LogOutputType,
  LogHandler,
  IPCConfig,
  HTTPConfig,
  WebSocketConfig,
  SessionKey,
} from './client/types';

// ============ SDK Client ============
export { MicroAgentClient, createClient } from './api/client';

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

// ============ Tool - 工具模块 ============
export { ToolBuilder, createToolBuilder } from './tool/builder';
export { BaseTool } from './tool/base';
export type { ToolBuilderOptions } from './tool/builder';

// ============ Skill - 技能模块 ============
export type { Skill, SkillSummary, SkillRequires, SkillMetadata, SkillInstallSpec } from './skill/types';

// ============ Define - 定义函数 ============
export { defineTool, defineChannel, defineSkill } from './define';
export type { DefineToolOptions, DefineChannelOptions, DefineSkillOptions } from './define';