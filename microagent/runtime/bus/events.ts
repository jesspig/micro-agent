/**
 * 事件总线
 */

import type { EventHandler, IEventEmitter } from "../contracts.js";
import type { Message } from "../types.js";
import { 
  createTimer, 
  sanitize, 
  logMethodCall, 
  logMethodReturn, 
  logMethodError,
  createDefaultLogger
} from "../logger/index.js";

const logger = createDefaultLogger("debug", ["runtime", "bus", "events"]);

/**
 * 事件映射类型
 * 定义所有系统事件及其载荷类型
 */
export interface EventMap {
  // Agent 事件
  "agent:start": { sessionKey: string };
  "agent:end": { sessionKey: string; success: boolean };
  "agent:error": { sessionKey: string; error: Error };
  
  // 工具事件
  "tool:start": { sessionKey: string; toolName: string; params: Record<string, unknown> };
  "tool:end": { sessionKey: string; toolName: string; result: string };
  "tool:error": { sessionKey: string; toolName: string; error: Error };
  
  // 消息事件
  "message:received": { sessionKey: string; message: Message };
  "message:sent": { sessionKey: string; message: Message };
  
  // Channel 事件
  "channel:connected": { channelId: string };
  "channel:disconnected": { channelId: string; reason?: string };
  "channel:error": { channelId: string; error: Error };
  
  // Session 事件
  "session:created": { sessionKey: string };
  "session:updated": { sessionKey: string };
  "session:cleared": { sessionKey: string };
  
  // 索引签名，满足 Record<string, unknown> 约束
  [key: string]: unknown;
}

/**
 * 事件总线实现
 */
class EventBus<T extends Record<string, unknown>> implements IEventEmitter<T> {
  private handlers = new Map<keyof T, Set<EventHandler>>();

  /**
   * 注册事件处理器
   * @param event - 事件名
   * @param handler - 处理器
   */
  on<K extends keyof T>(event: K, handler: EventHandler<T[K]>): void {
    const timer = createTimer();
    logMethodCall(logger, { 
      method: "on", 
      module: "EventBus",
      params: { event: String(event), handlerCount: this.handlers.get(event)?.size ?? 0 }
    });
    
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler as EventHandler);
    
    logger.info("事件处理器已注册", { 
      event: String(event),
      totalHandlers: this.handlers.get(event)!.size
    });
    
    logMethodReturn(logger, { 
      method: "on", 
      module: "EventBus",
      duration: timer() 
    });
  }

  /**
   * 移除事件处理器
   * @param event - 事件名
   * @param handler - 处理器
   */
  off<K extends keyof T>(event: K, handler: EventHandler<T[K]>): void {
    const timer = createTimer();
    logMethodCall(logger, { 
      method: "off", 
      module: "EventBus",
      params: { event: String(event) }
    });
    
    const handlers = this.handlers.get(event);
    const beforeCount = handlers?.size ?? 0;
    handlers?.delete(handler as EventHandler);
    const afterCount = handlers?.size ?? 0;
    
    logger.info("事件处理器已移除", { 
      event: String(event),
      beforeCount,
      afterCount
    });
    
    logMethodReturn(logger, { 
      method: "off", 
      module: "EventBus",
      duration: timer() 
    });
  }

  /**
   * 触发事件（异步执行处理器）
   * @param event - 事件名
   * @param payload - 事件载荷
   */
  emit<K extends keyof T>(event: K, payload: T[K]): void {
    const timer = createTimer();
    logMethodCall(logger, {
      method: "emit",
      module: "EventBus",
      params: { event: String(event) }
    });

    const handlers = this.handlers.get(event);
    if (!handlers) {
      logger.debug("事件无处理器", { event: String(event) });
      return;
    }

    logger.info("事件触发", {
      event: String(event),
      handlerCount: handlers.size,
      payload: sanitize(payload)
    });

    // 异步执行所有处理器，避免阻塞
    let successCount = 0;
    let errorCount = 0;

    for (const handler of handlers) {
      // 使用 Promise 包装同步/异步处理器
      Promise.resolve().then(async () => {
        try {
          await handler(payload);
          successCount++;
        } catch (error) {
          errorCount++;
          const err = error instanceof Error ? error : new Error(String(error));
          logMethodError(logger, {
            method: "emit",
            module: "EventBus",
            error: { name: err.name, message: err.message, stack: err.stack },
            params: { event: String(event) }
          });
        }
      });
    }

    logger.debug("事件处理已调度", {
      event: String(event),
      handlerCount: handlers.size,
      duration: timer()
    });
  }

  /**
   * 清除所有处理器
   */
  clear(): void {
    const timer = createTimer();
    logMethodCall(logger, { 
      method: "clear", 
      module: "EventBus",
      params: { eventCount: this.handlers.size }
    });
    
    const clearedCount = this.handlers.size;
    this.handlers.clear();
    
    logger.info("事件总线已清空", { 
      clearedEventTypes: clearedCount 
    });
    
    logMethodReturn(logger, { 
      method: "clear", 
      module: "EventBus",
      result: { clearedCount },
      duration: timer() 
    });
  }
}

/**
 * 创建全局事件总线
 */
function createEventBus(): EventBus<EventMap> {
  const timer = createTimer();
  logMethodCall(logger, { 
    method: "createEventBus", 
    module: "EventBus"
  });
  
  const bus = new EventBus<EventMap>();
  
  logger.info("事件总线已创建");
  
  logMethodReturn(logger, { 
    method: "createEventBus", 
    module: "EventBus",
    duration: timer() 
  });
  
  return bus;
}

export { EventBus, createEventBus };