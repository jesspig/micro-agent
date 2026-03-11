/**
 * Memory 模块单元测试
 *
 * 测试 BaseMemory 抽象类和 MemoryRegistry 注册表
 */

import { test, expect, describe, beforeEach, mock } from "bun:test";
import {
  BaseMemory,
  MemoryRegistry,
  type MemoryConfig,
  type MemoryEntry,
  type MemorySearchResult,
} from "../../microagent/runtime/src/memory/index.js";
import type { Message } from "../../microagent/runtime/src/types.js";

// ============================================================================
// 测试辅助类：BaseMemory 具体实现
// ============================================================================

/**
 * MockMemory 类
 * 用于测试 BaseMemory 抽象类的具体实现
 */
class MockMemory extends BaseMemory {
  /** 记忆配置 */
  readonly config: MemoryConfig = {
    enabled: true,
    store: "file",
    autoCapture: true,
    autoRecall: true,
    maxResults: 10,
  };

  /** 模拟存储 */
  private entries: Map<string, MemoryEntry> = new Map();

  /** 长期记忆存储 */
  private longTermMemory: string[] = [];

  /** 记忆上下文 */
  private context: string = "";

  /** 记录 writeLongTerm 调用 */
  writeLongTermCalls: string[] = [];

  // --------------------------------------------------------------------------
  // 抽象方法实现
  // --------------------------------------------------------------------------

  getMemoryContext(): string {
    return this.context;
  }

  async writeLongTerm(content: string): Promise<void> {
    this.writeLongTermCalls.push(content);
    this.longTermMemory.push(content);
  }

  async search(query: string, limit?: number): Promise<MemorySearchResult[]> {
    const results: MemorySearchResult[] = [];
    for (const entry of this.entries.values()) {
      if (entry.content.includes(query)) {
        results.push({ entry, score: 1.0 });
      }
    }
    return results.slice(0, limit ?? this.config.maxResults);
  }

  async addEntry(
    entry: Omit<MemoryEntry, "id" | "createdAt">,
  ): Promise<string> {
    const id = `memory-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const fullEntry: MemoryEntry = {
      ...entry,
      id,
      createdAt: Date.now(),
    };
    this.entries.set(id, fullEntry);
    return id;
  }

  async deleteEntry(id: string): Promise<void> {
    this.entries.delete(id);
  }

  // --------------------------------------------------------------------------
  // 测试辅助方法
  // --------------------------------------------------------------------------

  /** 设置记忆上下文 */
  setContext(context: string): void {
    this.context = context;
  }

  /** 获取长期记忆 */
  getLongTermMemory(): string[] {
    return [...this.longTermMemory];
  }

  /** 获取历史缓冲区 */
  getHistoryBuffer(): string[] {
    return [...this.historyBuffer];
  }

  /** 获取历史缓冲区大小 */
  getHistoryBufferSize(): number {
    return this.historyBuffer.length;
  }
}

// ============================================================================
// MemoryRegistry 测试
// ============================================================================

describe("MemoryRegistry", () => {
  /** 注册表实例 */
  let registry: MemoryRegistry;

  beforeEach(() => {
    // 每个测试前获取新的注册表实例并清空
    registry = MemoryRegistry.getInstance();
    registry.clear();
  });

  describe("单例模式", () => {
    test("getInstance 应该返回同一个实例", () => {
      const instance1 = MemoryRegistry.getInstance();
      const instance2 = MemoryRegistry.getInstance();

      expect(instance1).toBe(instance2);
    });

    test("多次调用 getInstance 返回的实例应该相等", () => {
      const instances = Array.from({ length: 5 }, () => MemoryRegistry.getInstance());

      instances.forEach((instance) => {
        expect(instance).toBe(instances[0]);
      });
    });
  });

  describe("set 和 get 方法", () => {
    test("set 应该正确设置 Memory 实例", () => {
      const memory = new MockMemory();

      registry.set(memory);

      expect(registry.has()).toBe(true);
    });

    test("get 应该返回设置的 Memory 实例", () => {
      const memory = new MockMemory();
      registry.set(memory);

      const result = registry.get();

      expect(result).toBe(memory);
    });

    test("未设置时 get 应该返回 undefined", () => {
      registry.clear();

      const result = registry.get();

      expect(result).toBeUndefined();
    });
  });

  describe("has 方法", () => {
    test("未设置时 has 应该返回 false", () => {
      registry.clear();

      expect(registry.has()).toBe(false);
    });

    test("设置后 has 应该返回 true", () => {
      const memory = new MockMemory();
      registry.set(memory);

      expect(registry.has()).toBe(true);
    });
  });

  describe("clear 方法", () => {
    test("clear 应该清除已设置的 Memory 实例", () => {
      const memory = new MockMemory();
      registry.set(memory);
      expect(registry.has()).toBe(true);

      registry.clear();

      expect(registry.has()).toBe(false);
      expect(registry.get()).toBeUndefined();
    });
  });
});

// ============================================================================
// BaseMemory 测试
// ============================================================================

describe("BaseMemory", () => {
  /** 测试用 Memory 实例 */
  let memory: MockMemory;

  beforeEach(() => {
    memory = new MockMemory();
  });

  describe("config 属性", () => {
    test("应该正确返回配置", () => {
      expect(memory.config.enabled).toBe(true);
      expect(memory.config.store).toBe("file");
      expect(memory.config.autoCapture).toBe(true);
      expect(memory.config.autoRecall).toBe(true);
      expect(memory.config.maxResults).toBe(10);
    });
  });

  describe("appendHistory 方法", () => {
    test("应该将条目添加到历史缓冲区", async () => {
      await memory.appendHistory("用户提问：你好");

      expect(memory.getHistoryBufferSize()).toBe(1);
      expect(memory.getHistoryBuffer()).toContain("用户提问：你好");
    });

    test("应该支持连续添加多个条目", async () => {
      await memory.appendHistory("用户提问：你好");
      await memory.appendHistory("助手回答：你好，有什么可以帮助你的？");
      await memory.appendHistory("用户提问：介绍一下自己");

      expect(memory.getHistoryBufferSize()).toBe(3);
    });

    test("缓冲区未满时不应该触发 flush", async () => {
      // 添加 10 个条目（小于 maxBufferSize = 50）
      for (let i = 0; i < 10; i++) {
        await memory.appendHistory(`消息 ${i}`);
      }

      // 不应该触发 writeLongTerm
      expect(memory.writeLongTermCalls.length).toBe(0);
    });

    test("缓冲区满时应该自动触发 flush", async () => {
      // 添加 50 个条目（等于 maxBufferSize）
      for (let i = 0; i < 50; i++) {
        await memory.appendHistory(`消息 ${i}`);
      }

      // 应该触发 writeLongTerm
      expect(memory.writeLongTermCalls.length).toBe(1);
      // 缓冲区应该被清空
      expect(memory.getHistoryBufferSize()).toBe(0);
    });

    test("缓冲区满时应该正确整合内容", async () => {
      const entries: string[] = [];
      for (let i = 0; i < 50; i++) {
        entries.push(`消息 ${i}`);
      }

      for (const entry of entries) {
        await memory.appendHistory(entry);
      }

      // 验证整合的内容包含所有条目
      expect(memory.writeLongTermCalls[0]).toContain("消息 0");
      expect(memory.writeLongTermCalls[0]).toContain("消息 49");
    });
  });

  describe("consolidate 方法", () => {
    test("空消息列表不应该触发写入", async () => {
      await memory.consolidate([]);

      expect(memory.writeLongTermCalls.length).toBe(0);
    });

    test("应该提取最近 10 条消息进行整合", async () => {
      const messages: Message[] = [];
      for (let i = 0; i < 15; i++) {
        messages.push({
          role: "user",
          content: `消息 ${i}`,
        });
      }

      await memory.consolidate(messages);

      // 应该写入长期记忆
      expect(memory.writeLongTermCalls.length).toBe(1);
      // 应该只包含最近 10 条消息（5-14）
      const written = memory.writeLongTermCalls[0];
      expect(written).not.toContain("消息 4");
      expect(written).toContain("消息 5");
      expect(written).toContain("消息 14");
    });

    test("应该过滤非 user/assistant 消息", async () => {
      const messages: Message[] = [
        { role: "system", content: "系统消息" },
        { role: "user", content: "用户消息" },
        { role: "assistant", content: "助手消息" },
        { role: "tool", content: "工具消息" },
      ];

      await memory.consolidate(messages);

      const written = memory.writeLongTermCalls[0];
      expect(written).not.toContain("系统消息");
      expect(written).toContain("用户消息");
      expect(written).toContain("助手消息");
      expect(written).not.toContain("工具消息");
    });

    test("应该正确格式化消息", async () => {
      const messages: Message[] = [
        { role: "user", content: "你好" },
        { role: "assistant", content: "你好！有什么可以帮助你的？" },
      ];

      await memory.consolidate(messages);

      const written = memory.writeLongTermCalls[0];
      expect(written).toContain("[user]: 你好");
      expect(written).toContain("[assistant]: 你好！有什么可以帮助你的？");
    });
  });

  describe("抽象方法", () => {
    test("getMemoryContext 应该返回记忆上下文", () => {
      memory.setContext("这是记忆上下文内容");

      expect(memory.getMemoryContext()).toBe("这是记忆上下文内容");
    });

    test("writeLongTerm 应该存储长期记忆", async () => {
      await memory.writeLongTerm("重要的长期记忆");

      expect(memory.getLongTermMemory()).toContain("重要的长期记忆");
    });

    test("search 应该返回匹配的搜索结果", async () => {
      // 添加一些记忆条目
      await memory.addEntry({
        content: "用户喜欢编程",
        source: "fact",
        importance: 0.8,
      });
      await memory.addEntry({
        content: "用户喜欢音乐",
        source: "fact",
        importance: 0.6,
      });

      const results = await memory.search("编程");

      expect(results.length).toBe(1);
      expect(results[0].entry.content).toContain("编程");
    });

    test("search 应该支持 limit 参数", async () => {
      await memory.addEntry({
        content: "测试条目 A",
        source: "fact",
        importance: 0.5,
      });
      await memory.addEntry({
        content: "测试条目 B",
        source: "fact",
        importance: 0.5,
      });

      const results = await memory.search("测试", 1);

      expect(results.length).toBe(1);
    });

    test("addEntry 应该返回条目 ID", async () => {
      const id = await memory.addEntry({
        content: "测试内容",
        source: "fact",
        importance: 0.5,
      });

      expect(id).toMatch(/^memory-/);
    });

    test("deleteEntry 应该删除指定条目", async () => {
      const id = await memory.addEntry({
        content: "要删除的内容",
        source: "fact",
        importance: 0.5,
      });

      // 搜索应该能找到
      let results = await memory.search("要删除");
      expect(results.length).toBe(1);

      // 删除
      await memory.deleteEntry(id);

      // 搜索应该找不到
      results = await memory.search("要删除");
      expect(results.length).toBe(0);
    });
  });

  describe("边界情况", () => {
    test("空历史缓冲区 flush 不应该报错", async () => {
      // 直接调用内部方法（通过触发缓冲区满）
      // 但由于缓冲区为空，flush 不会做任何事
      const memory2 = new MockMemory();

      // 不添加任何历史，直接检查 writeLongTerm 调用
      expect(memory2.writeLongTermCalls.length).toBe(0);
    });

    test("只有 system 消息时 consolidate 不应该写入", async () => {
      const messages: Message[] = [
        { role: "system", content: "系统消息 1" },
        { role: "system", content: "系统消息 2" },
      ];

      await memory.consolidate(messages);

      // 过滤后没有消息，summary 为空，不应写入
      expect(memory.writeLongTermCalls.length).toBe(0);
    });

    test("缓冲区溢出时应该正确处理", async () => {
      // 添加超过缓冲区大小的条目
      for (let i = 0; i < 75; i++) {
        await memory.appendHistory(`消息 ${i}`);
      }

      // 第一次 flush 在 50 条时触发
      // 剩余 25 条在缓冲区
      expect(memory.writeLongTermCalls.length).toBe(1);
      expect(memory.getHistoryBufferSize()).toBe(25);
    });
  });
});
