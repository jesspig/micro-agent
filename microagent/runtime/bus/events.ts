import type { EventHandler, IEventEmitter } from "../contracts.js";
import type { Message } from "../types.js";

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

// 事件总线实现
class EventBus<T extends Record<string, unknown>> implements IEventEmitter<T> {
  private handlers = new Map<keyof T, Set<EventHandler>>();

  on<K extends keyof T>(event: K, handler: EventHandler<T[K]>): void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler as EventHandler);
  }

  off<K extends keyof T>(event: K, handler: EventHandler<T[K]>): void {
    this.handlers.get(event)?.delete(handler as EventHandler);
  }

  emit<K extends keyof T>(event: K, payload: T[K]): void {
    const handlers = this.handlers.get(event);
    if (!handlers) return;
    for (const handler of handlers) {
      try {
        handler(payload);
      } catch {
        // 静默处理处理器错误
      }
    }
  }

  // 清除所有处理器
  clear(): void {
    this.handlers.clear();
  }
}

// 创建全局事件总线
function createEventBus(): EventBus<EventMap> {
  return new EventBus<EventMap>();
}

export { EventBus, createEventBus };
