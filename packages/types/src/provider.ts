/**
 * Provider 类型定义
 */

import type { LLMMessage, LLMResponse } from './message';
import type { LLMToolDefinition } from './tool';

/** Provider 类型 */
export type ProviderType = 'llm' | 'acp' | 'a2a' | 'mcp';

/** 生成配置参数 */
export interface GenerationConfig {
  /** 生成的最大 token 数量 */
  maxTokens?: number;
  /** 控制响应的随机性 */
  temperature?: number;
  /** 限制 token 选择范围为前 k 个候选 */
  topK?: number;
  /** 核采样参数 */
  topP?: number;
  /** 频率惩罚 */
  frequencyPenalty?: number;
}

/** Provider 能力配置 */
export interface ProviderCapabilities {
  /** 支持视觉能力 */
  vision: boolean;
  /** 支持思考能力 */
  think: boolean;
  /** 支持工具调用 */
  tool: boolean;
}

/** 模型信息 */
export interface ModelInfo {
  /** 模型 ID */
  id: string;
  /** Provider 名称 */
  provider: string;
  /** 能力配置 */
  capabilities: ProviderCapabilities;
}

/** Provider 接口 */
export interface Provider {
  /** Provider 名称 */
  readonly name: string;
  /** Provider 类型 */
  readonly type: ProviderType;
  
  /**
   * 聊天完成
   * @param messages - 消息历史
   * @param tools - 可用工具列表
   * @param model - 模型名称
   * @param config - 生成配置参数
   */
  chat(
    messages: LLMMessage[],
    tools?: LLMToolDefinition[],
    model?: string,
    config?: GenerationConfig
  ): Promise<LLMResponse>;
  
  /** 获取默认模型 */
  getDefaultModel(): string;
  
  /** 检查 Provider 是否可用 */
  isAvailable(): Promise<boolean>;

  /** 获取模型能力配置 */
  getModelCapabilities(modelId: string): ProviderCapabilities;

  /** 获取提供商支持的模型列表 */
  listModels(): Promise<string[] | null>;
}

/** LLM Provider 接口 */
export interface LLMProvider extends Provider {
  readonly type: 'llm';
}

/** ACP Provider 接口 */
export interface ACPProvider extends Provider {
  readonly type: 'acp';
}

/** A2A Provider 接口 */
export interface A2AProvider extends Provider {
  readonly type: 'a2a';
}

/** MCP Provider 接口 */
export interface MCPProvider extends Provider {
  readonly type: 'mcp';
}
