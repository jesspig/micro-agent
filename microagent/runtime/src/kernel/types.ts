/**
 * Kernel 模块类型定义
 *
 * 定义 Agent 核心调度相关的类型
 */

// ============================================================================
// Agent 状态
// ============================================================================

/**
 * Agent 运行状态
 */
export type AgentState = "idle" | "thinking" | "tool_call" | "responding" | "error";

// ============================================================================
// Agent 事件
// ============================================================================

/**
 * Agent 事件
 * 用于状态变化和工具调用的通知
 */
export interface AgentEvent {
  /** 事件类型 */
  type: "state_change" | "tool_start" | "tool_end" | "message" | "error";
  /** 状态变化后的新状态 */
  state?: AgentState;
  /** 工具名称（工具相关事件） */
  toolName?: string;
  /** 消息内容 */
  message?: string;
  /** 错误对象 */
  error?: Error;
  /** 事件时间戳 */
  timestamp: number;
}

// ============================================================================
// Agent 配置
// ============================================================================

/**
 * Agent 配置
 */
export interface AgentConfig {
  /** 使用的模型标识符 */
  model: string;
  /** 最大迭代次数 */
  maxIterations: number;
  /** 默认超时时间（毫秒） */
  defaultTimeout: number;
  /** 是否启用日志 */
  enableLogging: boolean;
}

// ============================================================================
// 迭代结果
// ============================================================================

/**
 * 单次迭代结果
 */
export interface IterationResult {
  /** 迭代序号 */
  iteration: number;
  /** 是否有工具调用 */
  hasToolCalls: boolean;
  /** 工具调用列表 */
  toolCalls?: Array<{ name: string; arguments: Record<string, unknown> }>;
  /** 响应内容 */
  content?: string;
}

// ============================================================================
// Agent 结果
// ============================================================================

/**
 * Agent 执行结果
 */
export interface AgentResult {
  /** 最终响应内容 */
  content: string | null;
  /** 完整消息历史 */
  messages: import("../types.js").Message[];
  /** 错误信息（如有） */
  error?: string;
}

// ============================================================================
// 工具调用记录
// ============================================================================

/**
 * 工具调用记录
 * 用于追踪 Agent 执行过程中的所有工具调用
 */
export interface ToolCallRecord {
  /** 工具调用 ID */
  id: string;
  /** 工具名称 */
  name: string;
  /** 调用参数 */
  arguments: Record<string, unknown>;
  /** 执行结果 */
  result?: string;
  /** 执行时间（毫秒） */
  duration?: number;
}
