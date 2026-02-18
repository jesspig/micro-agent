import type { ZodSchema } from 'zod';

/** 工具执行上下文 */
export interface ToolContext {
  /** 当前通道 */
  channel: string;
  /** 当前聊天 ID */
  chatId: string;
  /** 工作目录（项目级） */
  workspace: string;
  /** 当前工作目录（用于目录级配置查找） */
  currentDir: string;
  /** 发送消息到总线 */
  sendToBus: (msg: unknown) => Promise<void>;
}

/** 工具定义 */
export interface ToolDefinition {
  /** 工具名称（唯一标识） */
  name: string;
  /** 工具描述（给 LLM 使用） */
  description: string;
  /** 输入参数 Schema */
  inputSchema: ZodSchema;
}

/** 工具接口 */
export interface Tool extends ToolDefinition {
  /**
   * 执行工具
   * @param input - 验证后的输入参数
   * @param ctx - 执行上下文
   * @returns 执行结果
   */
  execute(input: unknown, ctx: ToolContext): Promise<unknown>;
}
