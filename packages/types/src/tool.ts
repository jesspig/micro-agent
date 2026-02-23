/**
 * 工具类型定义（MCP 兼容）
 * 
 * 遵循 Model Context Protocol 的 Tool/Resource/Prompt 原语规范。
 */

/** JSON Schema 类型（MCP 兼容） */
export interface JSONSchema {
  type: 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean' | 'null';
  properties?: Record<string, JSONSchema>;
  items?: JSONSchema;
  required?: string[];
  description?: string;
  enum?: (string | number | boolean)[];
  default?: unknown;
  [key: string]: unknown;
}

/** 内容部分类型 */
export type ContentPartType = 'text' | 'image' | 'resource';

/** 文本内容部分 */
export interface TextContentPart {
  type: 'text';
  text: string;
}

/** 图片内容部分 */
export interface ImageContentPart {
  type: 'image';
  data: string;
  mimeType: string;
}

/** 资源内容部分 */
export interface ResourceContentPart {
  type: 'resource';
  uri: string;
  mimeType?: string;
}

/** 内容部分联合类型 */
export type ContentPart = TextContentPart | ImageContentPart | ResourceContentPart;

/** 工具结果（MCP 兼容） */
export interface ToolResult {
  /** 内容部分数组 */
  content: ContentPart[];
  /** 是否为错误结果 */
  isError?: boolean;
}

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

/** 工具定义（MCP 兼容） */
export interface ToolDefinition {
  /** 工具名称（唯一标识） */
  readonly name: string;
  /** 工具描述（给 LLM 使用） */
  readonly description: string;
  /** 输入参数 Schema（MCP 兼容的 JSON Schema） */
  readonly inputSchema: JSONSchema;
}

/** 工具接口（MCP 兼容） */
export interface Tool extends ToolDefinition {
  /**
   * 执行工具
   * @param input - 验证后的输入参数
   * @param ctx - 执行上下文
   * @returns 执行结果（MCP 兼容格式）
   */
  execute(input: unknown, ctx: ToolContext): Promise<ToolResult>;
}

/** 工具调用 */
export interface ToolCall {
  /** 调用 ID */
  id: string;
  /** 工具名称 */
  name: string;
  /** 工具参数 */
  arguments: Record<string, unknown>;
}

/** LLM 工具定义格式 */
export interface LLMToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}
