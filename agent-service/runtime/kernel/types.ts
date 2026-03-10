/**
 * LangGraph 类型定义
 *
 * 用于 ReAct Agent 的类型系统。
 */

import type { LLMProvider, LLMToolDefinition, GenerationConfig } from '../../types/provider';
import type { ToolResult as ExternalToolResult } from '../../types/tool';

// ============================================================================
// ReAct 状态类型
// ============================================================================

/** ReAct 阶段状态 */
export type ReActState = "thinking" | "acting" | "observing" | "completed" | "error";

/** 行动记录状态 */
export type ActionState = "pending" | "running" | "completed" | "failed";

// ============================================================================
// 推理与行动追踪
// ============================================================================

/** 推理步骤 */
export interface ReasoningStep {
  /** 步骤 ID */
  id: string;
  /** 时间戳 */
  timestamp: number;
  /** 思考内容 */
  thought: string;
  /** 置信度 (0-1) */
  confidence?: number;
  /** 当前状态 */
  state: ReActState;
}

/** 行动记录 */
export interface ActionRecord {
  /** 记录 ID */
  id: string;
  /** 工具调用 ID */
  toolCallId: string;
  /** 工具名称 */
  toolName: string;
  /** 工具参数 */
  arguments: Record<string, unknown>;
  /** 时间戳 */
  timestamp: number;
  /** 执行状态 */
  state: ActionState;
}

/** 观察结果 */
export interface Observation {
  /** 观察 ID */
  id: string;
  /** 关联的行动 ID */
  actionId: string;
  /** 结果摘要 */
  summary: string;
  /** 时间戳 */
  timestamp: number;
  /** 是否为错误 */
  isError: boolean;
}

/** 错误记录 */
export interface ErrorRecord {
  /** 错误 ID */
  id: string;
  /** 错误消息 */
  message: string;
  /** 错误类型 */
  type: string;
  /** 时间戳 */
  timestamp: number;
  /** 关联的行动 ID */
  actionId?: string;
}

// ============================================================================
// Token 预算类型
// ============================================================================

/** Token 使用统计 */
export interface TokenUsage {
  /** 输入 token 数 */
  promptTokens: number;
  /** 输出 token 数 */
  completionTokens: number;
  /** 总 token 数 */
  totalTokens: number;
}

/** Token 预算配置 */
export interface TokenBudget {
  /** 最大上下文长度 */
  maxContextTokens: number;
  /** 预留给响应的 token 数 */
  reservedForResponse: number;
  /** 当前已使用 token 数 */
  usedTokens: number;
}

// ============================================================================
// 工具调用类型
// ============================================================================

/** 工具调用 */
export interface ToolCall {
  /** 调用 ID */
  id: string;
  /** 工具名称 */
  name: string;
  /** 工具参数 */
  arguments: Record<string, unknown>;
}

/** 工具结果 */
export interface ToolResult {
  /** 调用 ID */
  toolCallId: string;
  /** 结果内容 */
  content: string;
  /** 是否为错误 */
  isError?: boolean;
}

// ============================================================================
// 消息类型
// ============================================================================

/** LLM 消息格式（内部使用） */
export interface LLMMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
}

/** 记忆条目 */
export interface MemoryEntry {
  type: string;
  content: string;
  sessionKey?: string;
  importance?: number;
  stability?: number;
  status?: string;
}

/** 知识检索结果 */
export interface KnowledgeSearchResult {
  document: {
    path: string;
    content: string;
  };
  score: number;
}

// ============================================================================
// 流式处理类型
// ============================================================================

/** 流式回调 */
export interface StreamCallbacks {
  /** 发送内容块 */
  onChunk: (chunk: string) => void | Promise<void>;
  /** 完成响应 */
  onComplete: () => void | Promise<void>;
  /** 错误处理 */
  onError?: (error: Error) => void | Promise<void>;
}

/** 状态变化回调 */
export interface StateChangeCallbacks {
  /** 状态变化通知 */
  onStateChange?: (state: string, data: unknown) => void | Promise<void>;
}

// ============================================================================
// Agent 配置类型
// ============================================================================

/** LangGraph Agent 配置 */
export interface LangGraphAgentConfig {
  /** LLM Provider */
  llmProvider: LLMProvider;
  /** 工具注册表 */
  toolRegistry: {
    getDefinitions: () => Array<{
      name: string;
      description: string;
      inputSchema: Record<string, unknown>;
    }>;
    execute: (
      name: string,
      input: unknown,
      context: ToolContext
    ) => Promise<ExternalToolResult>;
  };
  /** 记忆管理器（可选） */
  memoryManager?: unknown;
  /** 知识检索器（可选） */
  knowledgeRetriever?: unknown;
  /** 会话存储路径（用于 Checkpointer） */
  dbPath?: string;

  /** 默认模型 */
  defaultModel: string;
  /** 系统提示词 */
  systemPrompt: string;
  /** 最大迭代次数 */
  maxIterations: number;
  /** 最大连续错误次数 */
  maxConsecutiveErrors: number;
  /** Token 预算 */
  tokenBudget: number;
  /** 工作目录 */
  workspace: string;
  /** 知识库目录 */
  knowledgeBase: string;
}

/** 入站消息 */
export interface InboundMessage {
  channel: string;
  chatId: string;
  content: string;
}

/** 工具上下文 */
export interface ToolContext extends Record<string, unknown> {
  channel: string;
  chatId: string;
  workspace: string;
  currentDir: string;
  knowledgeBase: string;
  sendToBus: (message: unknown) => Promise<void>;
}
