import mitt from 'mitt';
import type { EventType, EventHandler } from './types/events';

/** 事件映射类型 */
type EventMap = Record<EventType, unknown>;

/**
 * 事件总线
 * 
 * 基于 mitt 实现的轻量级事件总线，支持异步处理器。
 */
export class EventBus {
  private emitter = mitt<EventMap>();

  /**
   * 订阅事件
   * @param event - 事件类型
   * @param handler - 事件处理器
   */
  on(event: EventType, handler: EventHandler): void {
    this.emitter.on(event, handler as (payload: unknown) => void);
  }

  /**
   * 取消订阅
   * @param event - 事件类型
   * @param handler - 事件处理器
   */
  off(event: EventType, handler: EventHandler): void {
    this.emitter.off(event, handler as (payload: unknown) => void);
  }

  /**
   * 触发事件
   * @param event - 事件类型
   * @param payload - 事件数据
   */
  async emit(event: EventType, payload: unknown): Promise<void> {
    this.emitter.emit(event, payload);
  }

  /**
   * 订阅一次性事件
   * @param event - 事件类型
   * @param handler - 事件处理器
   */
  once(event: EventType, handler: EventHandler): void {
    const wrapper: EventHandler = (payload) => {
      this.off(event, wrapper);
      return handler(payload);
    };
    this.on(event, wrapper);
  }
}

/** 全局事件总线实例 */
export const eventBus = new EventBus();
