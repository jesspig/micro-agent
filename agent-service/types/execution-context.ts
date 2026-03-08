/**
 * 执行上下文类型定义
 */

import type { ChannelType } from './interfaces';
import type { LLMMessage } from './message';
import type { Tool, ToolResult } from './tool';
import type { Blackboard } from './blackboard';

/** 执行上下文配置 */
export interface ExecutionContextConfig {
  /** 会话键 */
  sessionKey: string;
  /** 工作目录 */
  workspace: string;
  /** 当前目录 */
  currentDir: string;
  /** 通道名称 */
  channel: ChannelType;
  /** 聊天 ID */
  chatId: string;
  /** Token 预算 */
  tokenBudget: number;
  /** 最大迭代次数 */
  maxIterations: number;
}

/** 执行上下文状态 */
export interface ExecutionContextState {
  /** 当前迭代次数 */
  iteration: number;
  /** 已使用 Token 数 */
  tokensUsed: number;
  /** 剩余 Token 预算 */
  tokensRemaining: number;
  /** 消息历史 */
  messages: LLMMessage[];
  /** 工具调用历史 */
  toolCallHistory: Array<{
    name: string;
    input: unknown;
    result: ToolResult;
    timestamp: Date;
  }>;
}

/** 执行上下文 */
export interface ExecutionContext {
  /** 配置 */
  readonly config: ExecutionContextConfig;
  /** 当前状态 */
  readonly state: ExecutionContextState;
  /** 可用工具 */
  readonly tools: Map<string, Tool>;
  /** 黑板（ReAct 多阶段数据共享） */
  readonly blackboard?: Blackboard;
  
  /** 添加消息到历史 */
  addMessage(message: LLMMessage): void;
  
  /** 执行工具 */
  executeTool(name: string, input: unknown): Promise<ToolResult>;
  
  /** 发送消息到通道 */
  sendMessage(content: string, media?: string[]): Promise<void>;
  
  /** 检查是否可以继续执行 */
  canContinue(): boolean;
  
  /** 更新 Token 使用量 */
  updateTokenUsage(used: number): void;
  
  /** 创建快照 */
  createSnapshot(): ExecutionContextSnapshot;
}

/** 执行上下文快照 */
export interface ExecutionContextSnapshot {
  /** 配置快照 */
  config: ExecutionContextConfig;
  /** 状态快照 */
  state: ExecutionContextState;
  /** 创建时间 */
  createdAt: Date;
}
