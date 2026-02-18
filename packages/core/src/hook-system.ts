/** 钩子类型 */
export type HookType =
  | 'pre:inbound'
  | 'post:inbound'
  | 'pre:outbound'
  | 'post:outbound'
  | 'pre:tool'
  | 'post:tool'
  | 'pre:llm'
  | 'post:llm';

/** 钩子函数 */
export type Hook<T> = (context: T) => T | Promise<T>;

/** 钩子注册项 */
interface HookEntry<T> {
  priority: number;
  hook: Hook<T>;
}

/**
 * 钩子系统
 * 
 * 支持优先级的钩子执行，用于在关键节点插入自定义逻辑。
 */
export class HookSystem {
  private hooks = new Map<HookType, HookEntry<unknown>[]>();

  /**
   * 注册钩子
   * @param type - 钩子类型
   * @param hook - 钩子函数
   * @param priority - 优先级（越小越先执行），默认 100
   */
  registerHook<T>(type: HookType, hook: Hook<T>, priority = 100): void {
    if (!this.hooks.has(type)) {
      this.hooks.set(type, []);
    }
    const entries = this.hooks.get(type)!;
    entries.push({ priority, hook: hook as Hook<unknown> });
    entries.sort((a, b) => a.priority - b.priority);
  }

  /**
   * 执行钩子链
   * @param type - 钩子类型
   * @param context - 上下文对象
   * @returns 处理后的上下文
   */
  async executeHooks<T>(type: HookType, context: T): Promise<T> {
    const entries = this.hooks.get(type);
    if (!entries || entries.length === 0) {
      return context;
    }

    let result = context;
    for (const entry of entries) {
      result = await (entry.hook as Hook<T>)(result);
    }
    return result;
  }

  /** 清除指定类型的所有钩子 */
  clear(type: HookType): void {
    this.hooks.delete(type);
  }
}

/** 全局钩子系统实例 */
export const hookSystem = new HookSystem();
