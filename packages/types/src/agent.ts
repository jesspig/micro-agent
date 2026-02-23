/**
 * Agent 类型定义
 */

import type { LLMMessage } from './message';
import type { Tool, ToolResult, ToolContext } from './tool';

/** Agent 状态 */
export type AgentState = 'idle' | 'thinking' | 'executing' | 'waiting' | 'error';

/** Agent 配置 */
export interface AgentConfig {
  /** 工作目录 */
  workspace: string;
  /** 模型配置 */
  models?: {
    chat?: string;
    check?: string;
  };
  /** 最大工具调用迭代次数 */
  maxIterations?: number;
  /** 生成配置 */
  generation?: {
    maxTokens?: number;
    temperature?: number;
    topK?: number;
    topP?: number;
    frequencyPenalty?: number;
  };
}

/** Agent 执行上下文 */
export interface AgentContext {
  /** 会话键 */
  sessionKey: string;
  /** 工作目录 */
  workspace: string;
  /** 当前目录 */
  currentDir: string;
  /** 通道名称 */
  channel: string;
  /** 聊天 ID */
  chatId: string;
  /** 消息历史 */
  messages: LLMMessage[];
  /** 可用工具 */
  tools: Map<string, Tool>;
  /** 执行工具 */
  executeTool: (name: string, input: unknown) => Promise<ToolResult>;
  /** 发送消息 */
  sendMessage: (content: string) => Promise<void>;
}

/** Agent 执行结果 */
export interface AgentResult {
  /** 最终响应内容 */
  content: string;
  /** 是否成功 */
  success: boolean;
  /** 错误信息 */
  error?: string;
  /** 工具调用次数 */
  toolCallCount: number;
  /** 使用的模型 */
  usedModel?: string;
}

/** Agent 检查点 */
export interface AgentCheckpoint {
  /** 检查点 ID */
  id: string;
  /** 会话键 */
  sessionKey: string;
  /** 时间戳 */
  timestamp: number;
  /** 消息历史快照 */
  messages: LLMMessage[];
  /** 待处理的工具调用 */
  pendingToolCalls?: unknown[];
}

/** Agent 接口 */
export interface Agent {
  /** Agent 名称 */
  readonly name: string;
  /** 当前状态 */
  readonly state: AgentState;
  /** 运行 Agent */
  run(context: AgentContext): Promise<AgentResult>;
  /** 停止 Agent */
  stop(): void;
}
