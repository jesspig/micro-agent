/**
 * 接口契约定义
 *
 * 定义 MicroAgent 运行时的核心接口，遵循依赖倒置原则。
 * 所有接口均为纯抽象，不包含实现细节。
 *
 * 根据**接口隔离原则**，将大接口拆分为多个小接口。
 */

import type {
  ChatRequest,
  ChatResponse,
  ToolDefinition,
  ChannelCapabilities,
  ChannelConfig,
  SkillMeta,
  Message,
  SessionMetadata,
  OutboundMessage,
  SendResult,
  MessageHandler,
  StreamCallback,
} from "./types.js";

// ============================================================================
// Provider 接口（拆分为多个小接口）
// ============================================================================

/**
 * 基础聊天 Provider 接口
 *
 * 定义与 AI 模型通信的基础契约
 */
export interface IChatProvider {
  /** 提供者名称 */
  readonly name: string;

  /**
   * 发送聊天请求
   * @param request - 聊天请求
   * @returns 聊天响应
   */
  chat(request: ChatRequest): Promise<ChatResponse>;

  /**
   * 获取支持的模型列表
   * @returns 模型标识符列表
   */
  getSupportedModels(): string[];
}

/**
 * 流式聊天 Provider 接口
 *
 * 定义流式通信的契约
 */
export interface IStreamProvider extends IChatProvider {
  /**
   * 执行流式聊天请求
   * @param request - 聊天请求
   * @param callback - 流式回调函数
   * @returns 最终聊天响应
   */
  streamChat(request: ChatRequest, callback: StreamCallback): Promise<ChatResponse>;
}

/**
 * 可监控的 Provider 接口
 *
 * 定义 Provider 状态监控和健康检查的契约
 */
export interface IMonitorableProvider {
  /**
   * 获取 Provider 当前状态
   * @returns Provider 状态信息
   */
  getStatus(): ProviderStatus;

  /**
   * 测试连接是否正常
   * @returns 连接是否成功
   */
  testConnection(): Promise<boolean>;
}

/**
 * Provider 扩展接口
 *
 * 组合多个小接口，形成完整的 Provider 契约
 * 兼容旧代码，保持向后兼容
 */
export interface IProviderExtended extends IStreamProvider, IMonitorableProvider {
  /** Provider 配置信息 */
  readonly config: ProviderConfig;

  /** Provider 能力描述 */
  readonly capabilities: ProviderCapabilities;
}

// 导入类型定义
import type { ProviderConfig, ProviderStatus, ProviderCapabilities } from "./provider/types.js";

// ============================================================================
// Tool 接口
// ============================================================================

/**
 * Tool 接口
 *
 * 定义工具的基础契约，提供可被 AI 调用的能力。
 */
export interface ITool {
  /** 工具名称 */
  readonly name: string;
  /** 工具描述 */
  readonly description: string;

  /**
   * 获取工具定义
   * @returns 工具定义（包含参数 schema）
   */
  getDefinition(): ToolDefinition;

  /**
   * 执行工具
   * @param params - 工具参数
   * @returns 执行结果
   */
  execute(params: Record<string, unknown>): Promise<string | Record<string, unknown>>;
}

// ============================================================================
// Skill 接口
// ============================================================================

/**
 * Skill 接口
 *
 * 定义技能的基础契约，提供可被 AI 引用的知识和能力。
 */
export interface ISkill {
  /** Skill 元数据 */
  readonly meta: SkillMeta;

  /**
   * 加载 Skill 内容
   * @returns Skill 的文本内容
   */
  loadContent(): Promise<string>;
}

/**
 * Skill 加载器接口
 *
 * 定义 Skill 加载器的基础契约，负责发现和加载技能。
 */
export interface ISkillLoader {
  /**
   * 列出所有可用 Skill
   * @returns Skill 列表
   */
  listSkills(): Promise<ISkill[]>;

  /**
   * 加载指定 Skill 的内容
   * @param name - Skill 名称
   * @returns Skill 内容，若不存在则返回 null
   */
  loadSkillContent(name: string): Promise<string | null>;
}

// ============================================================================
// Channel 接口
// ============================================================================

/**
 * Channel 接口
 *
 * 定义通信消息通道的基础契约，负责消息的收发。
 */
export interface IChannel {
  /** Channel 唯一标识 */
  readonly id: string;
  /** Channel 能力 */
  readonly capabilities: ChannelCapabilities;

  /**
   * 启动 Channel
   * @param config - Channel 配置
   */
  start(config: ChannelConfig): Promise<void>;

  /**
   * 停止 Channel
   */
  stop(): Promise<void>;

  /**
   * 发送消息
   * @param message - 出站消息
   * @returns 发送结果
   */
  send(message: OutboundMessage): Promise<SendResult>;

  /**
   * 注册消息处理器
   * @param handler - 消息处理函数
   */
  onMessage(handler: MessageHandler): void;
}

// ============================================================================
// Memory 接口
// ============================================================================

/**
 * Memory 接口
 *
 * 定义记忆管理的基础契约，负责对话历史和长期记忆的存储。
 */
export interface IMemory {
  /**
   * 获取记忆上下文
   * @returns 格式化的记忆文本
   */
  getMemoryContext(): string;

  /**
   * 追加历史记录
   * @param entry - 历史条目
   */
  appendHistory(entry: string): Promise<void>;

  /**
   * 写入长期记忆
   * @param content - 记忆内容
   */
  writeLongTerm(content: string): Promise<void>;

  /**
   * 整合记忆（可选）
   * 将消息整合为长期记忆
   * @param messages - 消息列表
   */
  consolidate?(messages: Message[]): Promise<void>;
}

// ============================================================================
// Session 接口
// ============================================================================

/**
 * Session 接口
 *
 * 定义会话的基础契约，负责管理对话状态。
 */
export interface ISession {
  /** Session 唯一标识 */
  readonly key: string;
  /** Session 元数据 */
  readonly metadata: SessionMetadata;

  /**
   * 获取所有消息
   * @returns 消息列表
   */
  getMessages(): Message[];

  /**
   * 添加消息
   * @param message - 消息对象
   */
  addMessage(message: Message): void;

  /**
   * 持久化 Session
   */
  save(): Promise<void>;

  /**
   * 清空 Session
   */
  clear(): void;
}

// ============================================================================
// Registry 接口
// ============================================================================

/**
 * Registry 接口
 *
 * 通用注册表契约，提供组件的注册和查找能力。
 */
export interface IRegistry<T> {
  /**
   * 注册组件
   * @param item - 组件实例
   */
  register(item: T): void;

  /**
   * 获取组件
   * @param name - 组件名称
   * @returns 组件实例，若不存在则返回 undefined
   */
  get(name: string): T | undefined;

  /**
   * 列出所有组件
   * @returns 组件列表
   */
  list(): T[];

  /**
   * 检查组件是否存在
   * @param name - 组件名称
   * @returns 是否存在
   */
  has(name: string): boolean;
}

// ============================================================================
// Event 接口
// ============================================================================

/**
 * 事件处理器类型
 */
export type EventHandler<T = unknown> = (event: T) => void | Promise<void>;

/**
 * 事件发射器接口
 *
 * 提供类型安全的事件订阅和发射能力。
 */
export interface IEventEmitter<EventMap extends Record<string, unknown>> {
  /**
   * 订阅事件
   * @param event - 事件名称
   * @param handler - 事件处理器
   */
  on<K extends keyof EventMap>(event: K, handler: EventHandler<EventMap[K]>): void;

  /**
   * 取消订阅
   * @param event - 事件名称
   * @param handler - 事件处理器
   */
  off<K extends keyof EventMap>(event: K, handler: EventHandler<EventMap[K]>): void;

  /**
   * 发射事件
   * @param event - 事件名称
   * @param payload - 事件数据
   */
  emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void;
}

// ============================================================================
// 错误类型导出
// ============================================================================

// 导出统一的错误类型系统（从 errors.ts）
export * from "./errors.js";
