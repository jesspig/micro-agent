/**
 * 中间件管道
 * 
 * 支持按顺序执行中间件，每个中间件可以决定是否继续执行下一个。
 */

/** 中间件函数 */
export type Middleware<T> = (ctx: T, next: () => Promise<void>) => Promise<void>;

/**
 * 中间件管道
 */
export class Pipeline<T> {
  private middlewares: Middleware<T>[] = [];

  /**
   * 添加中间件
   * @param middleware - 中间件函数
   */
  use(middleware: Middleware<T>): void {
    this.middlewares.push(middleware);
  }

  /**
   * 执行管道
   * @param ctx - 上下文对象
   */
  async execute(ctx: T): Promise<void> {
    let index = 0;

    const next = async (): Promise<void> => {
      if (index >= this.middlewares.length) return;
      const middleware = this.middlewares[index++];
      await middleware(ctx, next);
    };

    await next();
  }

  /** 清除所有中间件 */
  clear(): void {
    this.middlewares = [];
  }
}
