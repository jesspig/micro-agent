/**
 * 核心接口定义
 * 
 * 零依赖模块，定义所有核心接口，避免循环依赖。
 */

/** 通道类型 */
export type ChannelType = 'feishu' | 'qq' | 'email' | 'dingtalk' | 'wecom' | 'system';

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

/** 结构化日志 */
export interface Logger {
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
}

/** 数据库配置 */
export interface DatabaseConfig {
  /** 数据目录 */
  dataDir: string;
  /** 会话数据库路径 */
  sessionsDb: string;
  /** Cron 数据库路径 */
  cronDb: string;
  /** 记忆数据库路径 */
  memoryDb: string;
}
