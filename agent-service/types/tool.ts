/**
 * 工具类型定义（MCP 兼容）
 * 
 * 遵循 Model Context Protocol 的 Tool/Resource/Prompt 原语规范。
 */

/** JSON Schema 类型（MCP 兼容） */
export interface JSONSchema {
  /** 数据类型 */
  type?: 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean' | 'null' | ('object' | 'array' | 'string' | 'number' | 'integer' | 'boolean' | 'null')[];
  /** 对象属性定义 */
  properties?: Record<string, JSONSchema>;
  /** 数组元素 Schema */
  items?: JSONSchema | JSONSchema[];
  /** 必需属性列表 */
  required?: string[];
  /** 字段描述 */
  description?: string;
  /** 枚举值列表 */
  enum?: (string | number | boolean | null)[];
  /** 默认值 */
  default?: unknown;
  // ===== 字符串约束 =====
  /** 最小字符串长度 */
  minLength?: number;
  /** 最大字符串长度 */
  maxLength?: number;
  /** 正则模式 */
  pattern?: string;
  // ===== 数值约束 =====
  /** 最小值（含） */
  minimum?: number;
  /** 最大值（含） */
  maximum?: number;
  /** 最小值（不含） */
  exclusiveMinimum?: number | boolean;
  /** 最大值（不含） */
  exclusiveMaximum?: number | boolean;
  /** 倍数约束 */
  multipleOf?: number;
  // ===== 数组约束 =====
  /** 最小数组长度 */
  minItems?: number;
  /** 最大数组长度 */
  maxItems?: number;
  /** 是否要求元素唯一 */
  uniqueItems?: boolean;
  // ===== 对象约束 =====
  /** 最小属性数量 */
  minProperties?: number;
  /** 最大属性数量 */
  maxProperties?: number;
  /** 额外属性处理 */
  additionalProperties?: boolean | JSONSchema;
  // ===== 扩展字段 =====
  /** 允许其他 JSON Schema 扩展字段 */
  [key: string]: unknown;
}

/** 内容部分类型 */
export type ContentPartType = 'text' | 'image' | 'resource' | 'image_url';

/** 文本内容部分 */
export interface TextContentPart {
  type: 'text';
  text: string;
}

/** 图片内容部分（base64 格式） */
export interface ImageContentPart {
  type: 'image';
  data: string;
  mimeType: string;
}

/** 图片 URL 内容部分（OpenAI 格式） */
export interface ImageUrlContentPart {
  type: 'image_url';
  image_url: {
    url: string;
    detail?: 'low' | 'high' | 'auto';
  };
}

/** 资源内容部分 */
export interface ResourceContentPart {
  type: 'resource';
  uri: string;
  mimeType?: string;
}

/** 内容部分联合类型 */
export type ContentPart = TextContentPart | ImageContentPart | ImageUrlContentPart | ResourceContentPart;

/** Provider 内容部分（ContentPart 别名，兼容旧代码） */
export type ProviderContentPart = ContentPart;

/** 工具调用示例（用于 LLM 理解工具用法） */
export interface ToolExample {
  /** 示例描述（说明示例场景） */
  readonly description?: string;
  /** 示例输入参数 */
  readonly input: Record<string, unknown>;
  /** 预期输出（可选，用于文档） */
  readonly output?: ContentPart[];
}

// ============================================================================
// 结构化错误类型
// ============================================================================

/** 工具错误类型（结构化错误分类） */
export type ToolErrorType =
  | 'VALIDATION_ERROR'      // 参数验证失败
  | 'NOT_FOUND'             // 资源不存在
  | 'PERMISSION_DENIED'     // 权限不足
  | 'TIMEOUT'               // 执行超时
  | 'EXECUTION_ERROR'       // 执行错误
  | 'SERVICE_UNAVAILABLE'   // 服务不可用
  | 'RATE_LIMITED'          // 请求频率限制
  | 'INVALID_INPUT';        // 输入格式错误

/** 结构化工具错误（提供丰富的错误信息） */
export interface StructuredToolError {
  /** 错误类型 */
  readonly type: ToolErrorType;
  /** 错误消息 */
  readonly message: string;
  /** 建议的修正方式（帮助 LLM 或用户修复） */
  readonly suggestion?: string;
  /** 额外错误详情 */
  readonly details?: Record<string, unknown>;
  /** 原始错误（用于调试） */
  readonly cause?: Error;
}

/** 工具执行元数据 */
export interface ToolResultMetadata {
  /** 执行时长（毫秒） */
  duration?: number;
  /** 重试次数 */
  retryCount?: number;
  /** 缓存命中 */
  cacheHit?: boolean;
  /** 扩展字段 */
  [key: string]: unknown;
}

/** 工具结果（MCP 兼容 + 扩展） */
export interface ToolResult {
  /** 内容部分数组 */
  content: ContentPart[];
  /** 是否为错误结果（向后兼容） */
  isError?: boolean;
  /** 结构化错误信息（增强） */
  error?: StructuredToolError;
  /** 执行元数据 */
  metadata?: ToolResultMetadata;
}

// ============================================================================
// 错误创建辅助函数
// ============================================================================

/**
 * 创建结构化工具错误
 *
 * @param type - 错误类型
 * @param message - 错误消息
 * @param suggestion - 修正建议（可选）
 * @param details - 额外详情（可选）
 * @returns 结构化错误对象
 *
 * @example
 * ```typescript
 * const error = createToolError(
 *   'VALIDATION_ERROR',
 *   '参数 path 不能为空',
 *   '请提供有效的文件路径'
 * );
 * ```
 */
export function createToolError(
  type: ToolErrorType,
  message: string,
  suggestion?: string,
  details?: Record<string, unknown>
): StructuredToolError {
  return { type, message, suggestion, details };
}

/**
 * 创建错误工具结果
 *
 * @param type - 错误类型
 * @param message - 错误消息
 * @param suggestion - 修正建议（可选）
 * @param details - 额外详情（可选）
 * @returns 工具结果对象
 *
 * @example
 * ```typescript
 * return createErrorResult(
 *   'NOT_FOUND',
 *   '文件不存在: config.json',
 *   '请检查文件路径是否正确'
 * );
 * ```
 */
export function createErrorResult(
  type: ToolErrorType,
  message: string,
  suggestion?: string,
  details?: Record<string, unknown>
): ToolResult {
  return {
    content: [{ type: 'text', text: message }],
    isError: true,
    error: createToolError(type, message, suggestion, details),
  };
}

/**
 * 创建成功工具结果
 *
 * @param text - 结果文本
 * @param metadata - 可选元数据
 * @returns 工具结果对象
 */
export function createSuccessResult(text: string, metadata?: ToolResultMetadata): ToolResult {
  return {
    content: [{ type: 'text', text }],
    metadata,
  };
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
  /** 知识库目录 */
  knowledgeBase: string;
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
  /** 工具调用示例（帮助 LLM 理解用法） */
  readonly examples?: readonly ToolExample[];
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

/**
 * 内置工具提供者接口
 *
 * 用于依赖注入，允许上层应用（如 CLI）注册工具到 Agent Service。
 * 这解决了反向依赖问题：agent-service 不再直接导入 applications 中的工具。
 *
 * 支持两种模式：
 * 1. 嵌入式模式（同进程）：通过 getTools() 返回工具实例
 * 2. IPC 模式（多进程）：通过 getToolsPath() 返回工具模块路径，由 Agent Service 动态加载
 */
export interface BuiltinToolProvider {
  /**
   * 获取所有内置工具（嵌入式模式）
   * @param workspace 工作目录（某些工具需要此参数）
   */
  getTools(workspace: string): Tool[];

  /**
   * 获取工具模块路径（IPC 模式）
   * 用于跨进程动态加载工具。
   * @returns 工具模块的绝对路径，如果未配置则返回 null
   */
  getToolsPath?(): string | null;
}

/**
 * 内置技能提供者接口
 *
 * 用于依赖注入，允许上层应用（如 CLI）注册技能到 Agent Service。
 * 这解决了反向依赖问题：agent-service 不再直接导入 applications 中的技能。
 */
export interface BuiltinSkillProvider {
  /**
   * 获取所有内置技能的路径
   * @returns 技能目录路径，如果未配置则返回 null
   */
  getSkillsPath(): string | null;
}