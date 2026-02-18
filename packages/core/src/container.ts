import type { Container } from './types/interfaces';

type Factory<T> = () => T;

/**
 * 轻量级依赖注入容器
 * 
 * 支持瞬态（每次创建新实例）和单例（全局唯一实例）两种模式。
 */
export class ContainerImpl implements Container {
  /** 已注册的工厂函数 */
  private factories = new Map<string, Factory<unknown>>();
  
  /** 单例实例缓存 */
  private instances = new Map<string, unknown>();

  /**
   * 注册瞬态工厂
   * @param token - 依赖标识
   * @param factory - 工厂函数
   */
  register<T>(token: string, factory: Factory<T>): void {
    this.factories.set(token, factory);
  }

  /**
   * 注册单例工厂
   * @param token - 依赖标识
   * @param factory - 工厂函数
   */
  singleton<T>(token: string, factory: Factory<T>): void {
    this.factories.set(token, () => {
      if (!this.instances.has(token)) {
        this.instances.set(token, factory());
      }
      return this.instances.get(token);
    });
  }

  /**
   * 解析依赖
   * @param token - 依赖标识
   * @returns 依赖实例
   * @throws 未注册时抛出错误
   */
  resolve<T>(token: string): T {
    const factory = this.factories.get(token);
    if (!factory) {
      throw new Error(`未注册依赖: ${token}`);
    }
    return factory() as T;
  }

  /**
   * 检查依赖是否已注册
   */
  has(token: string): boolean {
    return this.factories.has(token);
  }
}

/** 默认导出容器实例 */
export const container = new ContainerImpl();
