/**
 * LLM Provider 模块入口
 */

// Router - 保留在 agent-service，SDK 重新导出
export { ModelRouter, createModelRouter } from './router';
export type { ModelRouterConfig, RouteResult, ModelConfig } from './router';

// OpenAI Compatible（包含 createLLMProvider）
export { createLLMProvider } from './openai';
export type { LLMProviderConfig } from './openai';

// Anthropic
export { AnthropicProvider, createAnthropicProvider } from './anthropic';
export type { AnthropicConfig } from './anthropic';

// 重新导出类型
export type { LLMProvider, GenerationConfig, ProviderCapabilities } from '../../../types';