/**
 * Session 模块单元测试
 *
 * 测试 Session、SessionManager 和 ContextBuilder 的核心功能
 */

import { test, expect, describe, beforeEach } from "bun:test";
import type { Message, SessionMetadata, SkillMeta } from "../../microagent/runtime/src/types";
import type { IMemoryExtended, ISkillExtended } from "../../microagent/runtime/src/contracts";
import type { MemoryConfig, MemorySearchResult, MemoryEntry } from "../../microagent/runtime/src/memory/types";
import type { SkillConfig, SkillSummary } from "../../microagent/runtime/src/skill/types";
import type { SessionConfig, SessionState, SessionSnapshot, ContextBuildOptions } from "../../microagent/runtime/src/session/types";
import { Session, SessionManager } from "../../microagent/runtime/src/session/manager";
import { ContextBuilder } from "../../microagent/runtime/src/session/context-builder";
import { SessionError } from "../../microagent/runtime/src/errors";

// ============================================================================
// Mock 实现
// ============================================================================

/**
 * 创建 Mock Memory 实现
 */
function createMockMemory(): IMemoryExtended {
  const entries: MemoryEntry[] = [];
  return {
    config: { maxEntries: 100 } as MemoryConfig,
    getMemoryContext: () => "测试记忆上下文",
    appendHistory: async () => {},
    writeLongTerm: async () => {},
    search: async (query: string, limit?: number) => {
      return entries
        .filter(e => e.content.includes(query))
        .slice(0, limit)
        .map(e => ({ entry: e, score: 1.0 }));
    },
    addEntry: async (entry) => {
      const newEntry: MemoryEntry = {
        ...entry,
        id: `entry-${Date.now()}`,
        createdAt: Date.now(),
      };
      entries.push(newEntry);
      return newEntry.id;
    },
    deleteEntry: async () => {},
    consolidate: async () => {},
  };
}

/**
 * 创建 Mock Skill 实现
 */
function createMockSkill(name: string, description: string): ISkillExtended {
  return {
    meta: {
      name,
      description,
      version: "1.0.0",
    } as SkillMeta,
    config: {} as SkillConfig,
    loaded: true,
    loadContent: async () => `Skill ${name} content`,
    reload: async () => `Skill ${name} content reloaded`,
    getSummary: () => ({ name, description, loaded: true } as SkillSummary),
  };
}

// ============================================================================
// Session 测试
// ============================================================================

describe("Session", () => {
  describe("构造函数", () => {
    test("应正确创建 Session 实例", () => {
      const session = new Session("test-session");

      expect(session.key).toBe("test-session");
      expect(session.metadata.id).toBe("test-session");
      expect(session.metadata.createdAt).toBeDefined();
    });

    test("应接受可选配置", () => {
      const config: Partial<SessionConfig> = {
        maxMessages: 50,
        autoSave: true,
      };

      const session = new Session("configured-session", config);

      expect(session.key).toBe("configured-session");
    });
  });

  describe("消息管理", () => {
    let session: Session;

    beforeEach(() => {
      session = new Session("message-test");
    });

    test("初始消息列表应为空", () => {
      expect(session.getMessages()).toEqual([]);
    });

    test("应正确添加消息", () => {
      const message: Message = {
        role: "user",
        content: "你好",
      };

      session.addMessage(message);
      const messages = session.getMessages();

      expect(messages.length).toBe(1);
      expect(messages[0].role).toBe("user");
      expect(messages[0].content).toBe("你好");
    });

    test("消息应自动添加时间戳", () => {
      const beforeTime = Date.now();
      session.addMessage({ role: "user", content: "测试" });
      const afterTime = Date.now();

      const messages = session.getMessages();
      expect(messages[0].timestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(messages[0].timestamp).toBeLessThanOrEqual(afterTime);
    });

    test("应保留已有时间戳", () => {
      const customTimestamp = 1234567890;
      session.addMessage({
        role: "user",
        content: "测试",
        timestamp: customTimestamp,
      });

      const messages = session.getMessages();
      expect(messages[0].timestamp).toBe(customTimestamp);
    });

    test("getMessages 应返回副本而非引用", () => {
      session.addMessage({ role: "user", content: "消息1" });

      const messages1 = session.getMessages();
      const messages2 = session.getMessages();

      expect(messages1).not.toBe(messages2); // 不同的数组引用
      expect(messages1).toEqual(messages2); // 但内容相同
    });

    test("clear 应清空所有消息", () => {
      session.addMessage({ role: "user", content: "消息1" });
      session.addMessage({ role: "assistant", content: "消息2" });

      session.clear();

      expect(session.getMessages()).toEqual([]);
      expect(session.getState().messageCount).toBe(0);
    });
  });

  describe("状态管理", () => {
    let session: Session;

    beforeEach(() => {
      session = new Session("state-test");
    });

    test("初始状态应正确", () => {
      const state = session.getState();

      expect(state.messageCount).toBe(0);
      expect(state.totalTokens).toBe(0);
      expect(state.lastActivity).toBeDefined();
    });

    test("添加消息应更新消息计数", () => {
      session.addMessage({ role: "user", content: "消息" });
      expect(session.getState().messageCount).toBe(1);

      session.addMessage({ role: "assistant", content: "回复" });
      expect(session.getState().messageCount).toBe(2);
    });

    test("添加消息应更新最后活动时间", async () => {
      const state1 = session.getState();

      // 等待一小段时间确保时间差
      await new Promise(resolve => setTimeout(resolve, 10));

      session.addMessage({ role: "user", content: "新消息" });
      const state2 = session.getState();

      expect(state2.lastActivity).toBeGreaterThan(state1.lastActivity);
    });

    test("getState 应返回副本", () => {
      const state1 = session.getState();
      const state2 = session.getState();

      expect(state1).not.toBe(state2);
      expect(state1).toEqual(state2);
    });
  });

  describe("持久化", () => {
    let session: Session;

    beforeEach(() => {
      session = new Session("persist-test");
    });

    test("save 应更新 updatedAt 时间", async () => {
      const oldUpdatedAt = session.metadata.updatedAt;

      // 等待一小段时间
      await new Promise(resolve => setTimeout(resolve, 10));

      await session.save();

      expect(session.metadata.updatedAt).toBeGreaterThan(oldUpdatedAt);
    });
  });

  describe("快照功能", () => {
    let session: Session;

    beforeEach(() => {
      session = new Session("snapshot-test");
      session.addMessage({ role: "user", content: "消息1" });
      session.addMessage({ role: "assistant", content: "回复1" });
    });

    test("应正确创建快照", () => {
      const snapshot = session.createSnapshot();

      expect(snapshot.metadata.id).toBe("snapshot-test");
      expect(snapshot.messages.length).toBe(2);
      expect(snapshot.state.messageCount).toBe(2);
    });

    test("快照应为独立副本", () => {
      const snapshot = session.createSnapshot();

      session.addMessage({ role: "user", content: "新消息" });

      expect(snapshot.messages.length).toBe(2); // 快照保持不变
      expect(session.getMessages().length).toBe(3); // 原始数据已更新
    });

    test("应能从快照恢复", () => {
      const snapshot = session.createSnapshot();

      // 修改 session
      session.addMessage({ role: "user", content: "额外消息" });
      expect(session.getMessages().length).toBe(3);

      // 从快照恢复
      session.restoreFromSnapshot(snapshot);

      expect(session.getMessages().length).toBe(2);
      expect(session.getState().messageCount).toBe(2);
    });
  });
});

// ============================================================================
// SessionManager 测试
// ============================================================================

describe("SessionManager", () => {
  let manager: SessionManager;

  beforeEach(() => {
    manager = new SessionManager();
  });

  describe("创建会话", () => {
    test("应正确创建新会话", () => {
      const session = manager.create("session-1");

      expect(session).toBeDefined();
      expect(session.key).toBe("session-1");
    });

    test("重复创建应抛出 SessionError", () => {
      manager.create("duplicate");

      expect(() => manager.create("duplicate")).toThrow(SessionError);
      expect(() => manager.create("duplicate")).toThrow("已存在");
    });

    test("创建时应接受配置", () => {
      const config: Partial<SessionConfig> = {
        maxMessages: 100,
        autoSave: true,
      };

      const session = manager.create("configured", config);
      expect(session.key).toBe("configured");
    });
  });

  describe("获取会话", () => {
    test("获取存在的会话应返回实例", () => {
      manager.create("existing");
      const session = manager.get("existing");

      expect(session).toBeDefined();
      expect(session?.key).toBe("existing");
    });

    test("获取不存在的会话应返回 undefined", () => {
      const session = manager.get("non-existent");
      expect(session).toBeUndefined();
    });

    test("getOrCreate 应创建不存在的会话", () => {
      const session = manager.getOrCreate("auto-created");

      expect(session).toBeDefined();
      expect(session.key).toBe("auto-created");
      expect(manager.get("auto-created")).toBeDefined();
    });

    test("getOrCreate 应返回已存在的会话", () => {
      const original = manager.create("existing");
      const fetched = manager.getOrCreate("existing");

      expect(fetched).toBe(original);
    });
  });

  describe("删除会话", () => {
    test("应正确删除存在的会话", () => {
      manager.create("to-delete");
      const result = manager.delete("to-delete");

      expect(result).toBe(true);
      expect(manager.get("to-delete")).toBeUndefined();
    });

    test("删除不存在的会话应返回 false", () => {
      const result = manager.delete("non-existent");
      expect(result).toBe(false);
    });
  });

  describe("列出会话", () => {
    test("应返回所有会话", () => {
      manager.create("session-1");
      manager.create("session-2");
      manager.create("session-3");

      const sessions = manager.list();
      expect(sessions.length).toBe(3);
    });

    test("空管理器应返回空列表", () => {
      const sessions = manager.list();
      expect(sessions).toEqual([]);
    });
  });

  describe("清空会话", () => {
    test("clear 应删除所有会话", () => {
      manager.create("session-1");
      manager.create("session-2");

      manager.clear();

      expect(manager.list()).toEqual([]);
    });
  });

  describe("批量保存", () => {
    test("saveAll 应保存所有会话", async () => {
      const session1 = manager.create("session-1");
      const session2 = manager.create("session-2");

      session1.addMessage({ role: "user", content: "消息" });
      session2.addMessage({ role: "user", content: "消息" });

      // 不应抛出错误
      await manager.saveAll();
    });
  });
});

// ============================================================================
// ContextBuilder 测试
// ============================================================================

describe("ContextBuilder", () => {
  let session: Session;
  let memory: IMemoryExtended;
  let skills: ISkillExtended[];

  beforeEach(() => {
    session = new Session("context-test");
    session.addMessage({ role: "user", content: "用户问题" });
    session.addMessage({ role: "assistant", content: "助手回答" });

    memory = createMockMemory();
    skills = [
      createMockSkill("skill1", "第一个技能"),
      createMockSkill("skill2", "第二个技能"),
    ];
  });

  describe("基本构建", () => {
    test("应返回会话消息历史", async () => {
      const builder = new ContextBuilder();
      const messages = await builder.build(session);

      expect(messages.length).toBe(2);
      expect(messages[0].role).toBe("user");
      expect(messages[1].role).toBe("assistant");
    });

    test("无选项时应返回所有消息", async () => {
      const builder = new ContextBuilder();
      const messages = await builder.build(session);

      expect(messages.length).toBe(2);
    });
  });

  describe("系统提示词", () => {
    test("应添加系统提示词", async () => {
      const builder = new ContextBuilder();
      const options: ContextBuildOptions = {
        systemPrompt: "你是一个有用的助手",
      };

      const messages = await builder.build(session, options);

      expect(messages[0].role).toBe("system");
      expect(messages[0].content).toBe("你是一个有用的助手");
    });

    test("无系统提示词时不应添加 system 消息", async () => {
      const builder = new ContextBuilder();
      const messages = await builder.build(session);

      const systemMessages = messages.filter(m => m.role === "system");
      expect(systemMessages.length).toBe(0);
    });
  });

  describe("记忆上下文", () => {
    test("应包含记忆上下文", async () => {
      const builder = new ContextBuilder(memory);
      const options: ContextBuildOptions = {
        includeMemory: true,
      };

      const messages = await builder.build(session, options);

      const memoryMessages = messages.filter(
        m => m.role === "system" && m.content.includes("<memory>")
      );
      expect(memoryMessages.length).toBe(1);
    });

    test("不包含记忆时应跳过", async () => {
      const builder = new ContextBuilder(memory);
      const options: ContextBuildOptions = {
        includeMemory: false,
      };

      const messages = await builder.build(session, options);

      const memoryMessages = messages.filter(
        m => m.role === "system" && m.content.includes("<memory>")
      );
      expect(memoryMessages.length).toBe(0);
    });

    test("无 memory 时应跳过记忆上下文", async () => {
      const builder = new ContextBuilder(undefined);
      const options: ContextBuildOptions = {
        includeMemory: true,
      };

      const messages = await builder.build(session, options);

      const memoryMessages = messages.filter(
        m => m.role === "system" && m.content.includes("<memory>")
      );
      expect(memoryMessages.length).toBe(0);
    });
  });

  describe("技能摘要", () => {
    test("应包含技能摘要", async () => {
      const builder = new ContextBuilder(undefined, skills);
      const options: ContextBuildOptions = {
        includeSkills: true,
      };

      const messages = await builder.build(session, options);

      const skillMessages = messages.filter(
        m => m.role === "system" && m.content.includes("<skills>")
      );
      expect(skillMessages.length).toBe(1);
      expect(skillMessages[0].content).toContain("skill1");
      expect(skillMessages[0].content).toContain("skill2");
    });

    test("不包含技能时应跳过", async () => {
      const builder = new ContextBuilder(undefined, skills);
      const options: ContextBuildOptions = {
        includeSkills: false,
      };

      const messages = await builder.build(session, options);

      const skillMessages = messages.filter(
        m => m.role === "system" && m.content.includes("<skills>")
      );
      expect(skillMessages.length).toBe(0);
    });

    test("无 skills 时应跳过技能摘要", async () => {
      const builder = new ContextBuilder(undefined, undefined);
      const options: ContextBuildOptions = {
        includeSkills: true,
      };

      const messages = await builder.build(session, options);

      const skillMessages = messages.filter(
        m => m.role === "system" && m.content.includes("<skills>")
      );
      expect(skillMessages.length).toBe(0);
    });

    test("空技能列表应跳过", async () => {
      const builder = new ContextBuilder(undefined, []);
      const options: ContextBuildOptions = {
        includeSkills: true,
      };

      const messages = await builder.build(session, options);

      const skillMessages = messages.filter(
        m => m.role === "system" && m.content.includes("<skills>")
      );
      expect(skillMessages.length).toBe(0);
    });
  });

  describe("消息数量限制", () => {
    test("应限制历史消息数量", async () => {
      // 添加更多消息
      for (let i = 0; i < 10; i++) {
        session.addMessage({ role: "user", content: `消息 ${i}` });
      }

      const builder = new ContextBuilder();
      const options: ContextBuildOptions = {
        maxMessages: 5,
      };

      const messages = await builder.build(session, options);

      // 应包含最近 5 条消息
      const userMessages = messages.filter(m => m.role === "user");
      expect(userMessages.length).toBeLessThanOrEqual(5);
    });

    test("maxMessages 大于消息总数时应返回全部", async () => {
      const builder = new ContextBuilder();
      const options: ContextBuildOptions = {
        maxMessages: 100,
      };

      const messages = await builder.build(session, options);
      expect(messages.length).toBe(2);
    });
  });

  describe("组合选项", () => {
    test("应正确组合所有选项", async () => {
      const builder = new ContextBuilder(memory, skills);
      const options: ContextBuildOptions = {
        systemPrompt: "系统提示",
        includeMemory: true,
        includeSkills: true,
        maxMessages: 10,
      };

      const messages = await builder.build(session, options);

      // 应包含系统提示词
      expect(messages.some(m => m.content === "系统提示")).toBe(true);

      // 应包含记忆上下文
      expect(messages.some(m => m.content.includes("<memory>"))).toBe(true);

      // 应包含技能摘要
      expect(messages.some(m => m.content.includes("<skills>"))).toBe(true);

      // 应包含对话历史
      expect(messages.some(m => m.content === "用户问题")).toBe(true);
    });
  });
});