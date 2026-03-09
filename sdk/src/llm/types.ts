/**
 * LLM 模块类型定义
 *
 * 从 agent-service 重新导出核心类型
 */

// 从 agent-service 导入核心类型
export type {
  LLMProvider,
  LLMMessage,
  LLMResponse,
  LLMToolDefinition,
  GenerationConfig,
  ProviderCapabilities,
  ProviderVendor,
  TaskType,
} from '@micro-agent/types';

// 从 agent-service Provider 模块导入特定类型
export type {
  LLMConfig,
  OpenAIConfig,
  DeepSeekConfig,
  GLMConfig,
  KimiConfig,
  MiniMaxConfig,
  OllamaConfig,
  OpenAICompatibleConfig,
} from '@micro-agent/runtime/provider/llm/providers/types';

// 从 router 导入类型
export type { ModelConfig, ModelRouterConfig, RouteResult } from '@micro-agent/runtime/provider/llm/router';

// 从 openai 导入类型
export type { LLMProviderConfig } from '@micro-agent/runtime/provider/llm/openai';
