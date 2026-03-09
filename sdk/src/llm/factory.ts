/**
 * LLM Provider 工厂函数
 *
 * 从 agent-service 重新导出工厂函数和辅助函数
 */

// 从 agent-service 重新导出工厂函数
export {
  createLLMProvider,
  createProvider,
  detectVendor,
  getModelCapabilities,
  supportsThinking,
  type LLMProviderConfig,
  type Provider,
  type LLMConfig,
} from '@micro-agent/runtime/provider/llm/openai';

// 导出底层 Provider 类型
export type {
  OpenAIConfig,
  DeepSeekConfig,
  GLMConfig,
  KimiConfig,
  MiniMaxConfig,
  OllamaConfig,
  OpenAICompatibleConfig,
} from '@micro-agent/runtime/provider/llm/providers/types';
