/**
 * Provider 工厂函数和统一导出
 * 
 * 根据配置自动选择合适的 Provider
 */

import type { LLMConfig } from './types';
import { OpenAIProvider, createOpenAIProvider } from './openai';
import { DeepSeekProvider, createDeepSeekProvider } from './deepseek';
import { GLMProvider, createGLMProvider } from './glm';
import { KimiProvider, createKimiProvider } from './kimi';
import { MiniMaxProvider, createMiniMaxProvider } from './minimax';
import { OllamaProvider, createOllamaProvider } from './ollama';
import { OpenAICompatibleProvider, createOpenAICompatibleProvider } from './openai-compatible';

// 重导出所有 Provider
export { BaseProvider } from './base';
export { OpenAIProvider, createOpenAIProvider } from './openai';
export { DeepSeekProvider, createDeepSeekProvider } from './deepseek';
export { GLMProvider, createGLMProvider } from './glm';
export { KimiProvider, createKimiProvider } from './kimi';
export { MiniMaxProvider, createMiniMaxProvider } from './minimax';
export { OllamaProvider, createOllamaProvider } from './ollama';
export { OpenAICompatibleProvider, createOpenAICompatibleProvider } from './openai-compatible';

// 重导出类型
export type { 
  LLMConfig,
  OpenAIConfig,
  DeepSeekConfig,
  GLMConfig,
  KimiConfig,
  MiniMaxConfig,
  OllamaConfig,
  OpenAICompatibleConfig,
} from './types';

// Provider 实例类型
export type Provider = OpenAIProvider | DeepSeekProvider | GLMProvider | KimiProvider | MiniMaxProvider | OllamaProvider | OpenAICompatibleProvider;

/**
 * 根据 vendor 名称创建 Provider
 */
export function createProvider(config: LLMConfig): Provider {
  const vendor = config.vendor ?? detectVendor(config.baseUrl);
  
  switch (vendor) {
    case 'openai':
      return createOpenAIProvider(config as unknown as Partial<import('./types').OpenAIConfig>);
    case 'deepseek':
      return createDeepSeekProvider(config as unknown as Partial<import('./types').DeepSeekConfig>);
    case 'glm':
      return createGLMProvider(config as unknown as Partial<import('./types').GLMConfig>);
    case 'kimi':
      return createKimiProvider(config as unknown as Partial<import('./types').KimiConfig>);
    case 'minimax':
      return createMiniMaxProvider(config as unknown as Partial<import('./types').MiniMaxConfig>);
    case 'ollama':
      return createOllamaProvider(config as unknown as Partial<import('./types').OllamaConfig>);
    case 'openai-compatible':
    default:
      return createOpenAICompatibleProvider(config as unknown as Partial<import('./types').OpenAICompatibleConfig>);
  }
}

/**
 * 根据 URL 或模型名称自动检测 vendor
 */
export function detectVendor(baseUrl?: string, model?: string): LLMConfig['vendor'] {
  if (!baseUrl) {
    return 'openai-compatible';
  }

  const url = baseUrl.toLowerCase();
  
  // 根据域名检测
  if (url.includes('openai.com')) {
    return 'openai';
  }
  if (url.includes('deepseek.com')) {
    return 'deepseek';
  }
  if (url.includes('bigmodel.cn') || url.includes('zhipuai.cn')) {
    return 'glm';
  }
  if (url.includes('moonshot.cn') || url.includes('kimi.ai')) {
    return 'kimi';
  }
  if (url.includes('minimax.chat')) {
    return 'minimax';
  }
  if (url.includes('localhost:11434') || url.includes('127.0.0.1:11434')) {
    return 'ollama';
  }

  // 根据模型名称检测
  if (model) {
    const modelName = model.toLowerCase();
    if (modelName.includes('deepseek') || modelName.includes('r1')) {
      return 'deepseek';
    }
    if (modelName.startsWith('glm-')) {
      return 'glm';
    }
    if (modelName.includes('moonshot') || modelName.includes('kimi')) {
      return 'kimi';
    }
    if (modelName.includes('minimax')) {
      return 'minimax';
    }
    if (modelName.includes('llama') || modelName.includes('qwen') || modelName.includes('mistral')) {
      return 'ollama';
    }
    if (modelName.startsWith('gpt-') || modelName.startsWith('o1-') || modelName.startsWith('o3-')) {
      return 'openai';
    }
  }

  return 'openai-compatible';
}

/**
 * 获取模型能力
 */
export function getModelCapabilities(provider: Provider, modelId: string): ReturnType<Provider['getModelCapabilities']> {
  return provider.getModelCapabilities(modelId);
}

/**
 * 检查是否支持思考/推理
 */
export function supportsThinking(vendor: LLMConfig['vendor'], modelId: string): boolean {
  const thinkingPatterns: Record<string, RegExp[]> = {
    openai: [/^o1-/, /^o3-/, /^o4-/],
    deepseek: [/deepseek-reasoner/, /r1/i],
    glm: [/glm-4-plus/, /glm-z1/],
    kimi: [/kimi-thinking/, /moonshot-thinking/],
    minimax: [/minimax-m2/],
    ollama: [/r1/i, /deepseek-reasoner/, /think/],
  };

  const patterns = thinkingPatterns[vendor ?? 'openai-compatible'];
  if (!patterns) return false;

  return patterns.some(pattern => pattern.test(modelId));
}
