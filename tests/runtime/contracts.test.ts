/**
 * contracts.ts 单元测试
 * 
 * 测试接口契约的正确性，通过 mock 实现验证接口定义。
 */

import { test, expect, describe, mock } from "bun:test";
import type {
  IProvider,
  ITool,
  ISkill,
  ISkillLoader,
  IChannel,
  IMemory,
  ISession,
  IRegistry,
  IEventEmitter,
  EventHandler,
} from "../../microagent/runtime/src/contracts.js";
import type {
  ChatRequest,
  ChatResponse,
  ToolDefinition,
  SkillMeta,
  ChannelCapabilities,
  ChannelConfig,
  OutboundMessage,
  SendResult,
  InboundMessage,
  Message,
  SessionMetadata,
} from "../../microagent/runtime/src/types.js";

// ============================================================================
// Mock 实现
// ============================================================================

/**
 * Mock Provider 实现
 */
class MockProvider implements IProvider {
  readonly name: string;

  constructor(name: string = "test-provider") {
    this.name = name;
  }

  chat = mock(async (request: ChatRequest): Promise<ChatResponse> => {
    return {
      text: `Mock response for: ${request.model}`,
      hasToolCall: false,
    };
  });

  getSupportedModels = mock((): string[] => {
    return ["gpt-4", "gpt-3.5-turbo"];
  });
}

/**
 * Mock Tool 实现
 */
class MockTool implements ITool {
  readonly name: string;
  readonly description: string;

  constructor(name: string = "test-tool", description: string = "A test tool") {
    this.name = name;
    this.description = description;
  }

  getDefinition = mock((): ToolDefinition => {
    return {
      name: this.name,
      description: this.description,
      parameters: {
        type: "object",
        properties: {
          input: {
            type: "string",
            description: "Input parameter",
          },
        },
        required: ["input"],
      },
    };
  });

  execute = mock(async (params: Record<string, unknown>): Promise<string> => {
    return `Executed with: ${JSON.stringify(params)}`;
  });
}

/**
 * Mock Skill 实现
 */
class MockSkill implements ISkill {
  readonly meta: SkillMeta;

  constructor(meta: SkillMeta = { name: "test-skill", description: "A test skill", version: "1.0.0" }) {
    this.meta = meta;
  }

  loadContent = mock(async (): Promise<string> => {
    return "Mock skill content";
  });
}

/**
 * Mock SkillLoader 实现
 */
class MockSkillLoader implements ISkillLoader {
  private skills: ISkill[] = [];

  constructor(skills: ISkill[] = []) {
    this.skills = skills;
  }

  listSkills = mock(async (): Promise<ISkill[]> => {
    return this.skills;
  });

  loadSkillContent = mock(async (name: string): Promise<string | null> => {
    const skill = this.skills.find((s) => s.meta.name === name);
    return skill ? await skill.loadContent() : null;
  });
}

/**
 * Mock Channel 实现
 */
class MockChannel implements IChannel {
  readonly id: string;
  readonly capabilities: ChannelCapabilities;
  private messageHandler: ((message: InboundMessage) => void | Promise<void>) | null = null;

  constructor(
    id: string = "test-channel",
    capabilities: ChannelCapabilities = { text: true, media: false, reply: true, edit: false, delete: false }
  ) {
    this.id = id;
    this.capabilities = capabilities;
  }

  start = mock(async (config: ChannelConfig): Promise<void> => {
    // 模拟启动逻辑
  });

  stop = mock(async (): Promise<void> => {
    // 模拟停止逻辑
  });

  send = mock(async (message: OutboundMessage): Promise<SendResult> => {
    return {
      success: true,
      messageId: `msg-${Date.now()}`,
    };
  });

  onMessage = mock((handler: (message: InboundMessage) => void | Promise<void>): void => {
    this.messageHandler = handler;
  });

  // 测试辅助方法：模拟接收消息
  simulateMessage(message: InboundMessage): void {
    if (this.messageHandler) {
      this.messageHandler(message);
    }
  }
}

/**
 * Mock Memory 实现
 */
class MockMemory implements IMemory {
  private history: string[] = [];
  private longTerm: string[] = [];

  getMemoryContext = mock((): string => {
    return this.history.join("\n");
  });

  appendHistory = mock(async (entry: string): Promise<void> => {
    this.history.push(entry);
  });

  writeLongTerm = mock(async (content: string): Promise<void> => {
    this.longTerm.push(content);
  });

  consolidate = mock(async (messages: Message[]): Promise<void> => {
    // 模拟记忆整合
  });
}

/**
 * Mock Session 实现
 */
class MockSession implements ISession {
  readonly key: string;
  readonly metadata: SessionMetadata;
  private messages: Message[] = [];

  constructor(key: string = "test-session", metadata?: Partial<SessionMetadata>) {
    this.key = key;
    this.metadata = {
      id: key,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ...metadata,
    };
  }

  getMessages = mock((): Message[] => {
    return [...this.messages];
  });

  addMessage = mock((message: Message): void => {
    this.messages.push(message);
  });

  save = mock(async (): Promise<void> => {
    // 模拟持久化逻辑
  });

  clear = mock((): void => {
    this.messages = [];
  });
}

/**
 * Mock Registry 实现
 */
class MockRegistry<T> implements IRegistry<T> {
  private items: Map<string, T> = new Map();
  private nameGetter: (item: T) => string;

  constructor(nameGetter: (item: T) => string) {
    this.nameGetter = nameGetter;
  }

  register = mock((item: T): void => {
    const name = this.nameGetter(item);
    this.items.set(name, item);
  });

  get = mock((name: string): T | undefined => {
    return this.items.get(name);
  });

  list = mock((): T[] => {
    return Array.from(this.items.values());
  });

  has = mock((name: string): boolean => {
    return this.items.has(name);
  });
}

/**
 * Mock EventEmitter 实现
 */
class MockEventEmitter<EventMap extends Record<string, unknown>> implements IEventEmitter<EventMap> {
  private handlers: Map<keyof EventMap, Set<EventHandler<unknown>>> = new Map();

  on = mock(<K extends keyof EventMap>(event: K, handler: EventHandler<EventMap[K]>): void => {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler as EventHandler<unknown>);
  });

  off = mock(<K extends keyof EventMap>(event: K, handler: EventHandler<EventMap[K]>): void => {
    this.handlers.get(event)?.delete(handler as EventHandler<unknown>);
  });

  emit = mock(<K extends keyof EventMap>(event: K, payload: EventMap[K]): void => {
    const handlers = this.handlers.get(event);
    if (handlers) {
      for (const handler of handlers) {
        handler(payload);
      }
    }
  });
}

// ============================================================================
// 测试套件
// ============================================================================

describe("IProvider 接口契约测试", () => {
  test("应正确实现 name 属性", () => {
    const provider = new MockProvider("anthropic");
    expect(provider.name).toBe("anthropic");
  });

  test("应正确实现 chat 方法", async () => {
    const provider = new MockProvider();
    const request: ChatRequest = {
      model: "gpt-4",
      messages: [{ role: "user", content: "Hello" }],
    };

    const response = await provider.chat(request);

    expect(response.text).toContain("Mock response");
    expect(response.hasToolCall).toBe(false);
    expect(provider.chat).toHaveBeenCalled();
  });

  test("应正确实现 getSupportedModels 方法", () => {
    const provider = new MockProvider();
    const models = provider.getSupportedModels();

    expect(models).toBeArray();
    expect(models).toContain("gpt-4");
    expect(provider.getSupportedModels).toHaveBeenCalled();
  });
});

describe("ITool 接口契约测试", () => {
  test("应正确实现 name 和 description 属性", () => {
    const tool = new MockTool("search", "Search the web");
    expect(tool.name).toBe("search");
    expect(tool.description).toBe("Search the web");
  });

  test("应正确实现 getDefinition 方法", () => {
    const tool = new MockTool("calculator", "Perform calculations");
    const definition = tool.getDefinition();

    expect(definition.name).toBe("calculator");
    expect(definition.parameters.type).toBe("object");
    expect(definition.parameters.properties).toHaveProperty("input");
    expect(tool.getDefinition).toHaveBeenCalled();
  });

  test("应正确实现 execute 方法", async () => {
    const tool = new MockTool();
    const result = await tool.execute({ input: "test" });

    expect(result).toContain("Executed with");
    expect(tool.execute).toHaveBeenCalledWith({ input: "test" });
  });
});

describe("ISkill 接口契约测试", () => {
  test("应正确实现 meta 属性", () => {
    const meta: SkillMeta = {
      name: "coding",
      description: "Programming skills",
      version: "2.0.0",
      tags: ["dev", "code"],
    };
    const skill = new MockSkill(meta);

    expect(skill.meta.name).toBe("coding");
    expect(skill.meta.version).toBe("2.0.0");
    expect(skill.meta.tags).toEqual(["dev", "code"]);
  });

  test("应正确实现 loadContent 方法", async () => {
    const skill = new MockSkill();
    const content = await skill.loadContent();

    expect(content).toBe("Mock skill content");
    expect(skill.loadContent).toHaveBeenCalled();
  });
});

describe("ISkillLoader 接口契约测试", () => {
  test("应正确实现 listSkills 方法", async () => {
    const skill1 = new MockSkill({ name: "skill1", description: "Skill 1", version: "1.0.0" });
    const skill2 = new MockSkill({ name: "skill2", description: "Skill 2", version: "1.0.0" });
    const loader = new MockSkillLoader([skill1, skill2]);

    const skills = await loader.listSkills();

    expect(skills).toHaveLength(2);
    expect(skills[0].meta.name).toBe("skill1");
    expect(loader.listSkills).toHaveBeenCalled();
  });

  test("应正确实现 loadSkillContent 方法", async () => {
    const skill = new MockSkill({ name: "test-skill", description: "Test", version: "1.0.0" });
    const loader = new MockSkillLoader([skill]);

    const content = await loader.loadSkillContent("test-skill");
    expect(content).toBe("Mock skill content");

    const notFound = await loader.loadSkillContent("non-existent");
    expect(notFound).toBeNull();
  });
});

describe("IChannel 接口契约测试", () => {
  test("应正确实现 id 和 capabilities 属性", () => {
    const capabilities: ChannelCapabilities = {
      text: true,
      media: true,
      reply: true,
      edit: true,
      delete: false,
    };
    const channel = new MockChannel("telegram", capabilities);

    expect(channel.id).toBe("telegram");
    expect(channel.capabilities.text).toBe(true);
    expect(channel.capabilities.media).toBe(true);
    expect(channel.capabilities.delete).toBe(false);
  });

  test("应正确实现 start 和 stop 方法", async () => {
    const channel = new MockChannel();
    const config: ChannelConfig = { token: "test-token" };

    await channel.start(config);
    expect(channel.start).toHaveBeenCalledWith(config);

    await channel.stop();
    expect(channel.stop).toHaveBeenCalled();
  });

  test("应正确实现 send 方法", async () => {
    const channel = new MockChannel();
    const message: OutboundMessage = {
      to: "user-123",
      text: "Hello!",
    };

    const result = await channel.send(message);

    expect(result.success).toBe(true);
    expect(result.messageId).toBeDefined();
    expect(channel.send).toHaveBeenCalledWith(message);
  });

  test("应正确实现 onMessage 方法", async () => {
    const channel = new MockChannel();
    const handler = mock((msg: InboundMessage) => {});

    channel.onMessage(handler);

    // 模拟接收消息
    const testMessage: InboundMessage = {
      from: "user-123",
      text: "Test message",
      timestamp: Date.now(),
    };
    channel.simulateMessage(testMessage);

    expect(handler).toHaveBeenCalledWith(testMessage);
  });
});

describe("IMemory 接口契约测试", () => {
  test("应正确实现 getMemoryContext 方法", () => {
    const memory = new MockMemory();
    const context = memory.getMemoryContext();

    expect(context).toBe("");
    expect(memory.getMemoryContext).toHaveBeenCalled();
  });

  test("应正确实现 appendHistory 方法", async () => {
    const memory = new MockMemory();

    await memory.appendHistory("First entry");
    await memory.appendHistory("Second entry");

    expect(memory.appendHistory).toHaveBeenCalledTimes(2);
  });

  test("应正确实现 writeLongTerm 方法", async () => {
    const memory = new MockMemory();

    await memory.writeLongTerm("Important memory");

    expect(memory.writeLongTerm).toHaveBeenCalledWith("Important memory");
  });

  test("应正确实现可选的 consolidate 方法", async () => {
    const memory = new MockMemory();
    const messages: Message[] = [
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi there!" },
    ];

    await memory.consolidate?.(messages);

    expect(memory.consolidate).toHaveBeenCalled();
  });
});

describe("ISession 接口契约测试", () => {
  test("应正确实现 key 和 metadata 属性", () => {
    const session = new MockSession("session-123", { userId: "user-456" });

    expect(session.key).toBe("session-123");
    expect(session.metadata.id).toBe("session-123");
    expect(session.metadata.userId).toBe("user-456");
    expect(session.metadata.createdAt).toBeDefined();
    expect(session.metadata.updatedAt).toBeDefined();
  });

  test("应正确实现 getMessages 和 addMessage 方法", () => {
    const session = new MockSession();

    expect(session.getMessages()).toHaveLength(0);

    session.addMessage({ role: "user", content: "Hello" });
    session.addMessage({ role: "assistant", content: "Hi!" });

    const messages = session.getMessages();
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe("user");
    expect(messages[1].role).toBe("assistant");
  });

  test("应正确实现 save 方法", async () => {
    const session = new MockSession();

    await session.save();

    expect(session.save).toHaveBeenCalled();
  });

  test("应正确实现 clear 方法", () => {
    const session = new MockSession();
    session.addMessage({ role: "user", content: "Hello" });

    session.clear();

    expect(session.getMessages()).toHaveLength(0);
    expect(session.clear).toHaveBeenCalled();
  });
});

describe("IRegistry 接口契约测试", () => {
  test("应正确实现 register 和 get 方法", () => {
    const registry = new MockRegistry<ITool>((tool) => tool.name);
    const tool = new MockTool("test-tool");

    registry.register(tool);
    const retrieved = registry.get("test-tool");

    expect(retrieved).toBe(tool);
    expect(registry.register).toHaveBeenCalled();
  });

  test("应正确实现 has 方法", () => {
    const registry = new MockRegistry<ITool>((tool) => tool.name);
    const tool = new MockTool("existing-tool");

    expect(registry.has("existing-tool")).toBe(false);

    registry.register(tool);

    expect(registry.has("existing-tool")).toBe(true);
    expect(registry.has("non-existent")).toBe(false);
  });

  test("应正确实现 list 方法", () => {
    const registry = new MockRegistry<ITool>((tool) => tool.name);
    const tool1 = new MockTool("tool-1");
    const tool2 = new MockTool("tool-2");

    registry.register(tool1);
    registry.register(tool2);

    const items = registry.list();

    expect(items).toHaveLength(2);
    expect(items).toContain(tool1);
    expect(items).toContain(tool2);
  });

  test("get 方法对不存在的项应返回 undefined", () => {
    const registry = new MockRegistry<ITool>((tool) => tool.name);

    const result = registry.get("non-existent");

    expect(result).toBeUndefined();
  });
});

describe("IEventEmitter 接口契约测试", () => {
  interface TestEvents {
    message: string;
    error: Error;
    count: number;
  }

  test("应正确实现 on 和 emit 方法", () => {
    const emitter = new MockEventEmitter<TestEvents>();
    const handler = mock((msg: string) => {});

    emitter.on("message", handler);
    emitter.emit("message", "Hello World");

    expect(handler).toHaveBeenCalledWith("Hello World");
  });

  test("应正确支持多个监听器", () => {
    const emitter = new MockEventEmitter<TestEvents>();
    const handler1 = mock((count: number) => {});
    const handler2 = mock((count: number) => {});

    emitter.on("count", handler1);
    emitter.on("count", handler2);
    emitter.emit("count", 42);

    expect(handler1).toHaveBeenCalledWith(42);
    expect(handler2).toHaveBeenCalledWith(42);
  });

  test("应正确实现 off 方法", () => {
    const emitter = new MockEventEmitter<TestEvents>();
    const handler = mock((msg: string) => {});

    emitter.on("message", handler);
    emitter.off("message", handler);
    emitter.emit("message", "Should not be called");

    expect(handler).not.toHaveBeenCalled();
  });

  test("应正确处理不同类型的事件", () => {
    const emitter = new MockEventEmitter<TestEvents>();
    const messageHandler = mock((msg: string) => {});
    const errorHandler = mock((err: Error) => {});

    emitter.on("message", messageHandler);
    emitter.on("error", errorHandler);

    emitter.emit("message", "test message");
    emitter.emit("error", new Error("test error"));

    expect(messageHandler).toHaveBeenCalledWith("test message");
    expect(errorHandler).toHaveBeenCalled();
  });
});

// ============================================================================
// 接口类型兼容性测试
// ============================================================================

describe("接口类型兼容性测试", () => {
  test("IProvider 接口类型检查", () => {
    // 编译时类型检查，确保接口定义正确
    const provider: IProvider = new MockProvider();
    expect(provider.name).toBeDefined();
    expect(typeof provider.chat).toBe("function");
    expect(typeof provider.getSupportedModels).toBe("function");
  });

  test("ITool 接口类型检查", () => {
    const tool: ITool = new MockTool();
    expect(tool.name).toBeDefined();
    expect(tool.description).toBeDefined();
    expect(typeof tool.getDefinition).toBe("function");
    expect(typeof tool.execute).toBe("function");
  });

  test("ISkill 接口类型检查", () => {
    const skill: ISkill = new MockSkill();
    expect(skill.meta).toBeDefined();
    expect(typeof skill.loadContent).toBe("function");
  });

  test("IChannel 接口类型检查", () => {
    const channel: IChannel = new MockChannel();
    expect(channel.id).toBeDefined();
    expect(channel.capabilities).toBeDefined();
    expect(typeof channel.start).toBe("function");
    expect(typeof channel.stop).toBe("function");
    expect(typeof channel.send).toBe("function");
    expect(typeof channel.onMessage).toBe("function");
  });

  test("IMemory 接口类型检查", () => {
    const memory: IMemory = new MockMemory();
    expect(typeof memory.getMemoryContext).toBe("function");
    expect(typeof memory.appendHistory).toBe("function");
    expect(typeof memory.writeLongTerm).toBe("function");
    expect(memory.consolidate).toBeDefined(); // 可选方法
  });

  test("ISession 接口类型检查", () => {
    const session: ISession = new MockSession();
    expect(session.key).toBeDefined();
    expect(session.metadata).toBeDefined();
    expect(typeof session.getMessages).toBe("function");
    expect(typeof session.addMessage).toBe("function");
    expect(typeof session.save).toBe("function");
    expect(typeof session.clear).toBe("function");
  });

  test("IRegistry 接口类型检查", () => {
    const registry: IRegistry<ITool> = new MockRegistry<ITool>((t) => t.name);
    expect(typeof registry.register).toBe("function");
    expect(typeof registry.get).toBe("function");
    expect(typeof registry.list).toBe("function");
    expect(typeof registry.has).toBe("function");
  });

  test("IEventEmitter 接口类型检查", () => {
    const emitter: IEventEmitter<{ test: string }> = new MockEventEmitter();
    expect(typeof emitter.on).toBe("function");
    expect(typeof emitter.off).toBe("function");
    expect(typeof emitter.emit).toBe("function");
  });
});
