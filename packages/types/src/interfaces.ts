/**
 * 核心接口定义
 * 
 * 零依赖模块，定义所有核心接口，避免循环依赖。
 */

/** 通道类型 */
export type ChannelType = 'feishu' | 'email' | 'system' | 'cli';

/** 通道接口 */
export interface Channel {
  /** 通道名称 */
  readonly name: ChannelType;
  /** 是否运行中 */
  readonly isRunning: boolean;
  /** 启动通道 */
  start(): Promise<void>;
  /** 停止通道 */
  stop(): Promise<void>;
  /** 发送消息 */
  send(msg: { channel: ChannelType; chatId: string; content: string; replyTo?: string; media?: string[]; metadata?: Record<string, unknown> }): Promise<void>;
}

/** 依赖注入容器 */
export interface Container {
  /** 注册瞬态工厂，每次 resolve 返回新实例 */
  register<T>(token: string, factory: () => T): void;
  /** 注册单例工厂，全局唯一实例 */
  singleton<T>(token: string, factory: () => T): void;
  /** 解析依赖 */
  resolve<T>(token: string): T;
  /** 检查依赖是否已注册 */
  has(token: string): boolean;
}

/** 应用实例接口 */
export interface App {
  /** 启动所有服务 */
  start(): Promise<void>;
  /** 停止所有服务 */
  stop(): Promise<void>;
  /** 获取运行中的通道列表 */
  getRunningChannels(): string[];
  /** 获取 Provider 状态 */
  getProviderStatus(): string;
  /** 获取路由状态 */
  getRouterStatus(): { chatModel: string; visionModel?: string; coderModel?: string; intentModel?: string };
  /** 交互式对话 */
  chat(input: string): Promise<string>;
}

/** 广播消息结构 */
export interface BroadcastMessage {
  /** 消息内容 */
  content: string;
  /** 回复消息 ID */
  replyTo?: string;
  /** 媒体文件 */
  media?: string[];
  /** 元数据 */
  metadata?: Record<string, unknown>;
}

/** ChannelGateway 接口（单用户场景） */
export interface ChannelGateway {
  /** 统一会话 ID */
  readonly sessionKey: string;
  /** 广播消息到所有活跃 Channel */
  broadcast(msg: BroadcastMessage): Promise<PromiseSettledResult<void>[]>;
}
