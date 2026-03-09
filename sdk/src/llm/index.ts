/**
 * LLM 模块入口
 *
 * 提供 LLM Provider 的高级封装：
 * - ModelRouter：基于任务类型的模型选择
 * - createLLMProvider：根据配置自动创建 Provider
 * - detectVendor：自动检测厂商类型
 */

// Router - 模型路由器
export {
  ModelRouter,
  createModelRouter,
  type ModelConfig,
  type ModelRouterConfig,
  type RouteResult,
} from './router';

// Factory - Provider 工厂函数
export {
  createLLMProvider,
  createProvider,
  detectVendor,
  getModelCapabilities,
  supportsThinking,
  type LLMProviderConfig,
  type Provider,
  type LLMConfig,
  type OpenAIConfig,
  type DeepSeekConfig,
  type GLMConfig,
  type KimiConfig,
  type MiniMaxConfig,
  type OllamaConfig,
  type OpenAICompatibleConfig,
} from './factory';

// Types - 类型定义
export type {
  LLMProvider,
  LLMMessage,
  LLMResponse,
  LLMToolDefinition,
  GenerationConfig,
  ProviderCapabilities,
  ProviderVendor,
  TaskType,
} from './types';