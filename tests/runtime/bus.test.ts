/**
 * Bus 模块单元测试
 * 
 * 测试 EventBus 和 AsyncQueue 的核心功能
 */

import { test, expect, describe, beforeEach, afterEach, mock } from "bun:test";
import { EventBus, createEventBus, EventMap } from "../../microagent/runtime/src/bus/events.js";
import { AsyncQueue, createMessageQueue } from "../../microagent/runtime/src/bus/queue.js";

// ============================================================================
// EventBus 测试
// ============================================================================

describe("EventBus", () => {
  let eventBus: EventBus<EventMap>;

  beforeEach(() => {
    eventBus = createEventBus();
  });

  afterEach(() => {
    eventBus.clear();
  });

  describe("事件订阅 (on)", () => {
    test("应该能够订阅单个事件", () => {
      // 安排
      const handler = mock(() => {});

      // 执行
      eventBus.on("agent:start", handler);

      // 断言 - 通过触发事件验证订阅成功
      eventBus.emit("agent:start", { sessionKey: "test-session" });
      expect(handler).toHaveBeenCalledTimes(1);
    });

    test("应该能够为同一事件订阅多个处理器", () => {
      // 安排
      const handler1 = mock(() => {});
      const handler2 = mock(() => {});

      // 执行
      eventBus.on("agent:end", handler1);
      eventBus.on("agent:end", handler2);
      eventBus.emit("agent:end", { sessionKey: "test-session", success: true });

      // 断言
      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
    });

    test("应该能够订阅不同类型的事件", () => {
      // 安排
      const startHandler = mock(() => {});
      const toolHandler = mock(() => {});

      // 执行
      eventBus.on("agent:start", startHandler);
      eventBus.on("tool:start", toolHandler);

      eventBus.emit("agent:start", { sessionKey: "session-1" });
      eventBus.emit("tool:start", { sessionKey: "session-1", toolName: "test-tool", params: {} });

      // 断言
      expect(startHandler).toHaveBeenCalledTimes(1);
      expect(toolHandler).toHaveBeenCalledTimes(1);
    });
  });

  describe("事件发布 (emit)", () => {
    test("应该将正确的载荷传递给处理器", () => {
      // 安排
      const handler = mock(() => {});
      const payload = { sessionKey: "test-session", success: true };

      // 执行
      eventBus.on("agent:end", handler);
      eventBus.emit("agent:end", payload);

      // 断言
      expect(handler).toHaveBeenCalledWith(payload);
    });

    test("发布不存在的事件时应该静默处理", () => {
      // 安排
      const handler = mock(() => {});
      eventBus.on("agent:start", handler);

      // 执行 - 发布没有订阅者的事件
      eventBus.emit("agent:error", { sessionKey: "test", error: new Error("test") });

      // 断言 - 不应该触发其他事件的处理器
      expect(handler).not.toHaveBeenCalled();
    });

    test("处理器抛出错误时应该捕获并继续执行其他处理器", () => {
      // 安排
      const errorHandler = mock(() => {
        throw new Error("Handler error");
      });
      const normalHandler = mock(() => {});

      // 执行
      eventBus.on("agent:start", errorHandler);
      eventBus.on("agent:start", normalHandler);

      // 使用 console.error 的 mock 来避免测试输出噪音
      const consoleSpy = mock(() => {});
      const originalConsoleError = console.error;
      console.error = consoleSpy;

      eventBus.emit("agent:start", { sessionKey: "test" });

      // 恢复 console.error
      console.error = originalConsoleError;

      // 断言 - 即使第一个处理器抛错，第二个也应该执行
      expect(normalHandler).toHaveBeenCalledTimes(1);
      expect(consoleSpy).toHaveBeenCalled();
    });
  });

  describe("取消订阅 (off)", () => {
    test("应该能够取消单个事件处理器", () => {
      // 安排
      const handler = mock(() => {});
      eventBus.on("agent:start", handler);

      // 执行
      eventBus.off("agent:start", handler);
      eventBus.emit("agent:start", { sessionKey: "test" });

      // 断言
      expect(handler).not.toHaveBeenCalled();
    });

    test("取消未订阅的处理器应该是安全操作", () => {
      // 安排
      const handler1 = mock(() => {});
      const handler2 = mock(() => {});

      // 执行
      eventBus.on("agent:start", handler1);
      // 取消未订阅的处理器
      eventBus.off("agent:start", handler2);
      eventBus.emit("agent:start", { sessionKey: "test" });

      // 断言 - handler1 仍然应该工作
      expect(handler1).toHaveBeenCalledTimes(1);
    });

    test("取消订阅后其他处理器应该继续工作", () => {
      // 安排
      const handler1 = mock(() => {});
      const handler2 = mock(() => {});

      eventBus.on("tool:end", handler1);
      eventBus.on("tool:end", handler2);

      // 执行
      eventBus.off("tool:end", handler1);
      eventBus.emit("tool:end", { sessionKey: "test", toolName: "tool", result: "ok" });

      // 断言
      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).toHaveBeenCalledTimes(1);
    });
  });

  describe("清除所有处理器 (clear)", () => {
    test("应该清除所有事件的处理器", () => {
      // 安排
      const handler1 = mock(() => {});
      const handler2 = mock(() => {});

      eventBus.on("agent:start", handler1);
      eventBus.on("tool:start", handler2);

      // 执行
      eventBus.clear();
      eventBus.emit("agent:start", { sessionKey: "test" });
      eventBus.emit("tool:start", { sessionKey: "test", toolName: "tool", params: {} });

      // 断言
      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).not.toHaveBeenCalled();
    });
  });
});

// ============================================================================
// createEventBus 工厂函数测试
// ============================================================================

describe("createEventBus", () => {
  test("应该返回 EventBus 实例", () => {
    const bus = createEventBus();
    expect(bus).toBeInstanceOf(EventBus);
  });

  test("每次调用应该返回新的实例", () => {
    const bus1 = createEventBus();
    const bus2 = createEventBus();
    expect(bus1).not.toBe(bus2);
  });
});

// ============================================================================
// AsyncQueue 测试
// ============================================================================

describe("AsyncQueue", () => {
  let queue: AsyncQueue<string>;

  beforeEach(() => {
    queue = createMessageQueue<string>();
  });

  describe("入队 (enqueue)", () => {
    test("应该能够入队并处理项目", async () => {
      // 安排
      const processedItems: string[] = [];
      queue.setProcessor(async (item) => {
        processedItems.push(item);
      });

      // 执行
      await queue.enqueue("item1");

      // 断言
      expect(processedItems).toEqual(["item1"]);
    });

    test("应该按顺序处理多个项目", async () => {
      // 安排
      const processedItems: string[] = [];
      queue.setProcessor(async (item) => {
        processedItems.push(item);
      });

      // 执行
      await queue.enqueue("item1");
      await queue.enqueue("item2");
      await queue.enqueue("item3");

      // 断言
      expect(processedItems).toEqual(["item1", "item2", "item3"]);
    });

    test("处理器抛出错误时应该拒绝 Promise", async () => {
      // 安排
      queue.setProcessor(async () => {
        throw new Error("Processing failed");
      });

      // 执行 & 断言
      await expect(queue.enqueue("item")).rejects.toThrow("Processing failed");
    });
  });

  describe("队列长度 (length)", () => {
    test("初始长度应该为 0", () => {
      expect(queue.length).toBe(0);
    });

    test("入队后长度应该增加", async () => {
      // 安排 - 使用延迟处理器
      let resolveProcessor: () => void;
      queue.setProcessor(async () => {
        await new Promise<void>((resolve) => {
          resolveProcessor = resolve;
        });
      });

      // 执行 - 入队但不等待完成
      const enqueuePromise = queue.enqueue("item1");

      // 等待一小段时间让处理器开始
      await new Promise((r) => setTimeout(r, 10));

      // 断言 - 正在处理的项目不在队列中
      expect(queue.length).toBe(0);

      // 完成处理
      resolveProcessor!();
      await enqueuePromise;
    });
  });

  describe("清空队列 (clear)", () => {
    test("应该清空队列中的所有项目", () => {
      // 安排 - 没有处理器，项目会堆积
      queue.enqueue("item1");
      queue.enqueue("item2");

      // 执行
      queue.clear();

      // 断言
      expect(queue.length).toBe(0);
    });
  });

  describe("边界情况", () => {
    test("应该正确处理空队列状态", () => {
      expect(queue.length).toBe(0);
      queue.clear(); // 清空空队列应该是安全的
      expect(queue.length).toBe(0);
    });

    test("处理器错误时应该正确传递非 Error 对象", async () => {
      // 安排
      queue.setProcessor(async () => {
        throw "string error"; // 非 Error 对象
      });

      // 执行 & 断言
      await expect(queue.enqueue("item")).rejects.toThrow("string error");
    });
  });

  describe("并发处理", () => {
    test("处理器应该串行执行（非并发）", async () => {
      // 安排
      const executionOrder: number[] = [];
      let counter = 0;

      queue.setProcessor(async () => {
        const id = ++counter;
        executionOrder.push(id);
        // 模拟异步处理
        await new Promise((r) => setTimeout(r, 10));
      });

      // 执行 - 并发入队
      const promises = [
        queue.enqueue("item1"),
        queue.enqueue("item2"),
        queue.enqueue("item3"),
      ];

      await Promise.all(promises);

      // 断言 - 应该按顺序执行
      expect(executionOrder).toEqual([1, 2, 3]);
    });
  });
});

// ============================================================================
// createMessageQueue 工厂函数测试
// ============================================================================

describe("createMessageQueue", () => {
  test("应该返回 AsyncQueue 实例", () => {
    const queue = createMessageQueue<string>();
    expect(queue).toBeInstanceOf(AsyncQueue);
  });

  test("应该支持泛型类型", () => {
    // 测试不同类型
    const stringQueue = createMessageQueue<string>();
    const numberQueue = createMessageQueue<number>();
    const objectQueue = createMessageQueue<{ id: number; name: string }>();

    // 验证实例类型
    expect(stringQueue).toBeInstanceOf(AsyncQueue);
    expect(numberQueue).toBeInstanceOf(AsyncQueue);
    expect(objectQueue).toBeInstanceOf(AsyncQueue);
  });

  test("每次调用应该返回新实例", () => {
    const queue1 = createMessageQueue<string>();
    const queue2 = createMessageQueue<string>();
    expect(queue1).not.toBe(queue2);
  });
});
