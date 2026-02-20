/**
 * 核心接口定义
 * 
 * 零依赖模块，定义所有核心接口，避免循环依赖。
 */

/** 通道类型 */
export type ChannelType = 'feishu' | 'email' | 'system';

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
  getRouterStatus(): { auto: boolean; max: boolean; chatModel: string; checkModel?: string };
}