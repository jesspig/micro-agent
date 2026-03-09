/**
 * Provider 类型定义
 */

import type { LLMMessage, LLMResponse } from './message';
import type { LLMToolDefinition } from './tool';
import type { MemoryTypeString } from './memory';

// 重新导出 LLM 相关类型，方便外部使用
export type { LLMMessage, LLMResponse } from './message';
export type { LLMToolDefinition } from './tool';

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
  /** 是否启用思考/推理模式 */
  enableThinking?: boolean;
  /** 响应格式配置 */
  responseFormat?: { type: 'text' | 'json_object' };
}

/** Provider 厂商类型 */
export type ProviderVendor = 
  | 'openai' 
  | 'deepseek' 
  | 'glm' 
  | 'kimi' 
  | 'minimax' 
  | 'ollama'
  | 'openai-compatible';

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
  getDefaultModel(): string | undefined;
  
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

// ============================================================================
// 预留 Provider 接口（用于未来扩展）
// ============================================================================

/** ACP Provider 接口 - 预留，用于 Agent Communication Protocol */
export interface ACPProvider extends Provider {
  readonly type: 'acp';
}

/** A2A Provider 接口 - 预留，用于 Agent-to-Agent 通信 */
export interface A2AProvider extends Provider {
  readonly type: 'a2a';
}

/** MCP Provider 接口 - 预留，用于 Model Context Protocol */
export interface MCPProvider extends Provider {
  readonly type: 'mcp';
}

// ============================================================================
// 意图识别类型（从 providers 提升，遵循依赖倒置原则）
// ============================================================================

/** 预处理结果 */
export interface PreflightResult {
  /** 是否需要检索记忆 */
  needMemory: boolean;
  /** 需要检索的记忆类型 */
  memoryTypes: MemoryTypeString[];
  /** 预处理理由 */
  reason: string;
  /** 是否需要上下文来进一步判断 */
  needContext?: boolean;
}

/** 对话历史条目（简化版，用于意图识别） */
export interface HistoryEntry {
  role: 'user' | 'assistant';
  content: string;
}

/** 预处理提示词构建函数 */
export type PreflightPromptBuilder = (
  content: string,
  hasImage: boolean,
  history?: HistoryEntry[],
) => string;

/** 任务类型 */
export type TaskType = 'vision' | 'coder' | 'chat';

/** 模型选择结果 */
export interface RoutingResult {
  type: TaskType;
  reason: string;
}

/** 完整意图识别结果 */
export interface IntentResult {
  /** 预处理结果 */
  preflight: PreflightResult;
  /** 模型选择结果 */
  routing: RoutingResult;
}
