/**
 * Kernel 模块单元测试
 *
 * 测试 AgentLoop 的核心功能
 */

import { test, expect, describe, beforeEach, mock, fn } from "bun:test";
import type { ChatRequest, ChatResponse, ToolDefinition, ToolCall } from "../../microagent/runtime/src/types";
import type { IProvider, ITool } from "../../microagent/runtime/src/contracts";
import { ToolRegistry } from "../../microagent/runtime/src/tool/registry";
import { AgentLoop } from "../../microagent/runtime/src/kernel/agent-loop";
import type { AgentConfig, AgentState, AgentEvent, AgentResult } from "../../microagent/runtime/src/kernel/types";

// ============================================================================
// Mock 工具
// ============================================================================

/**
 * 创建 Mock Provider
 * @param responses - 预设的响应列表
 * @returns Mock Provider 实例
 */
function createMockProvider(responses: ChatResponse[]): IProvider {
  let callIndex = 0;
  return {
    name: "mock-provider",
    chat: mock(async (request: ChatRequest) => {
      const response = responses[callIndex] ?? { text: "", hasToolCall: false };
      callIndex++;
      return response;
    }),
    getSupportedModels: () => ["mock-model"],
  };
}

/**
 * 创建 Mock 工具
 * @param name - 工具名称
 * @param result - 执行结果
 * @returns Mock 工具实例
 */
function createMockTool(name: string, result: string): ITool {
  return {
    name,
    description: `Mock tool: ${name}`,
    getDefinition: (): ToolDefinition => ({
      name,
      description: `Mock tool: ${name}`,
      parameters: {
        type: "object",
        properties: {
          input: { type: "string", description: "输入参数" },
        },
      },
    }),
    execute: mock(async () => result),
  };
}

/**
 * 创建工具调用对象
 * @param name - 工具名称
 * @param args - 参数
 * @returns 工具调用对象
 */
function createToolCall(name: string, args: Record<string, unknown> = {}): ToolCall {
  return {
    id: `call-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    name,
    arguments: args,
  };
}

// ============================================================================
// 测试套件
// ============================================================================

describe("AgentConfig 配置", () => {
  describe("默认配置", () => {
    test("应使用默认配置值", () => {
      const provider = createMockProvider([]);
      const tools = new ToolRegistry();
      const agent = new AgentLoop(provider, tools);

      // 验证初始状态
      expect(agent.getState()).toBe("idle");
    });
  });

  describe("自定义配置", () => {
    test("应接受自定义配置", () => {
      const provider = createMockProvider([]);
      const tools = new ToolRegistry();
      const config: AgentConfig = {
        model: "custom-model",
        maxIterations: 10,
        defaultTimeout: 5000,
        enableLogging: true,
      };

      const agent = new AgentLoop(provider, tools, config);
      expect(agent.getState()).toBe("idle");
    });
  });
});

describe("AgentLoop 状态管理", () => {
  let provider: IProvider;
  let tools: ToolRegistry;
  let agent: AgentLoop;

  beforeEach(() => {
    provider = createMockProvider([]);
    tools = new ToolRegistry();
    agent = new AgentLoop(provider, tools);
  });

  test("初始状态应为 idle", () => {
    expect(agent.getState()).toBe("idle");
  });

  test("运行后状态应变化", async () => {
    const responses: ChatResponse[] = [
      { text: "最终回答", hasToolCall: false },
    ];
    provider = createMockProvider(responses);
    agent = new AgentLoop(provider, tools);

    // 记录状态变化
    const states: AgentState[] = [];
    agent.on((event: AgentEvent) => {
      if (event.type === "state_change" && event.state) {
        states.push(event.state);
      }
    });

    await agent.run([{ role: "user", content: "你好" }]);

    // 验证状态变化序列
    expect(states[0]).toBe("thinking");
    expect(states[states.length - 1]).toBe("responding");
  });
});

describe("AgentLoop.run 方法", () => {
  describe("无工具调用的简单响应", () => {
    test("应直接返回 LLM 响应", async () => {
      const responses: ChatResponse[] = [
        { text: "这是回答", hasToolCall: false },
      ];
      const provider = createMockProvider(responses);
      const tools = new ToolRegistry();
      const agent = new AgentLoop(provider, tools);

      const result = await agent.run([{ role: "user", content: "问题" }]);

      expect(result.content).toBe("这是回答");
      expect(result.error).toBeUndefined();
    });

    test("应保留原始消息历史", async () => {
      const responses: ChatResponse[] = [
        { text: "回答", hasToolCall: false },
      ];
      const provider = createMockProvider(responses);
      const tools = new ToolRegistry();
      const agent = new AgentLoop(provider, tools);

      const initialMessages = [
        { role: "system" as const, content: "系统提示" },
        { role: "user" as const, content: "用户问题" },
      ];

      const result = await agent.run(initialMessages);

      // 消息历史应包含原始消息
      expect(result.messages.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("工具调用和处理", () => {
    test("应执行工具并将结果加入消息历史", async () => {
      // 第一轮：调用工具
      // 第二轮：返回最终回答
      const responses: ChatResponse[] = [
        {
          text: "",
          hasToolCall: true,
          toolCalls: [createToolCall("weather", { city: "北京" })],
        },
        { text: "北京今天天气晴朗", hasToolCall: false },
      ];

      const provider = createMockProvider(responses);
      const tools = new ToolRegistry();
      const mockTool = createMockTool("weather", "晴，25度");
      tools.register(mockTool);

      const agent = new AgentLoop(provider, tools);
      const result = await agent.run([{ role: "user", content: "北京天气如何" }]);

      expect(result.content).toBe("北京今天天气晴朗");
      // 消息历史应包含工具调用结果
      expect(result.messages.some(m => m.role === "tool")).toBe(true);
    });

    test("应正确处理多个工具调用", async () => {
      const responses: ChatResponse[] = [
        {
          text: "",
          hasToolCall: true,
          toolCalls: [
            createToolCall("tool1", { arg: "value1" }),
            createToolCall("tool2", { arg: "value2" }),
          ],
        },
        { text: "处理完成", hasToolCall: false },
      ];

      const provider = createMockProvider(responses);
      const tools = new ToolRegistry();
      tools.register(createMockTool("tool1", "result1"));
      tools.register(createMockTool("tool2", "result2"));

      const agent = new AgentLoop(provider, tools);
      const result = await agent.run([{ role: "user", content: "测试" }]);

      expect(result.content).toBe("处理完成");
      // 应有两条工具消息
      const toolMessages = result.messages.filter(m => m.role === "tool");
      expect(toolMessages.length).toBe(2);
    });

    test("应正确处理工具执行错误", async () => {
      const responses: ChatResponse[] = [
        {
          text: "",
          hasToolCall: true,
          toolCalls: [createToolCall("error_tool", {})],
        },
        { text: "我已处理错误", hasToolCall: false },
      ];

      const provider = createMockProvider(responses);
      const tools = new ToolRegistry();

      // 注册一个会抛出错误的工具
      const errorTool: ITool = {
        name: "error_tool",
        description: "错误工具",
        getDefinition: () => ({
          name: "error_tool",
          description: "错误工具",
          parameters: { type: "object", properties: {} },
        }),
        execute: async () => {
          throw new Error("工具执行失败");
        },
      };
      tools.register(errorTool);

      const agent = new AgentLoop(provider, tools);
      const result = await agent.run([{ role: "user", content: "测试错误" }]);

      // 即使工具出错，也应该继续执行
      expect(result.content).toBe("我已处理错误");
    });
  });

  describe("最大迭代次数限制", () => {
    test("达到最大迭代次数应返回错误", async () => {
      // 总是返回工具调用，形成无限循环
      const responses: ChatResponse[] = [
        {
          text: "",
          hasToolCall: true,
          toolCalls: [createToolCall("loop_tool", {})],
        },
      ];

      const provider = {
        name: "mock-provider",
        chat: mock(async () => ({
          text: "",
          hasToolCall: true,
          toolCalls: [createToolCall("loop_tool", {})],
        })),
        getSupportedModels: () => ["mock-model"],
      };

      const tools = new ToolRegistry();
      tools.register(createMockTool("loop_tool", "继续"));

      const config: AgentConfig = {
        model: "test-model",
        maxIterations: 3, // 设置较小的迭代上限
        defaultTimeout: 1000,
        enableLogging: false,
      };

      const agent = new AgentLoop(provider, tools, config);
      const result = await agent.run([{ role: "user", content: "无限循环测试" }]);

      expect(result.content).toBeNull();
      expect(result.error).toContain("达到最大迭代次数");
    });
  });

  describe("错误处理", () => {
    test("Provider 抛出错误时应返回错误结果", async () => {
      const errorProvider: IProvider = {
        name: "error-provider",
        chat: mock(async () => {
          throw new Error("Provider 错误");
        }),
        getSupportedModels: () => [],
      };

      const tools = new ToolRegistry();
      const agent = new AgentLoop(errorProvider, tools);

      const result = await agent.run([{ role: "user", content: "触发错误" }]);

      expect(result.content).toBeNull();
      expect(result.error).toBe("Provider 错误");
    });

    test("错误后状态应变为 error", async () => {
      const errorProvider: IProvider = {
        name: "error-provider",
        chat: mock(async () => {
          throw new Error("测试错误");
        }),
        getSupportedModels: () => [],
      };

      const tools = new ToolRegistry();
      const agent = new AgentLoop(errorProvider, tools);

      // 记录状态变化
      const states: AgentState[] = [];
      agent.on((event: AgentEvent) => {
        if (event.type === "state_change" && event.state) {
          states.push(event.state);
        }
      });

      await agent.run([{ role: "user", content: "测试" }]);

      expect(agent.getState()).toBe("error");
      expect(states[states.length - 1]).toBe("error");
    });
  });
});

describe("AgentLoop 事件系统", () => {
  let provider: IProvider;
  let tools: ToolRegistry;

  beforeEach(() => {
    provider = createMockProvider([]);
    tools = new ToolRegistry();
  });

  test("应发射状态变化事件", async () => {
    const responses: ChatResponse[] = [
      { text: "回答", hasToolCall: false },
    ];
    provider = createMockProvider(responses);

    const agent = new AgentLoop(provider, tools);
    const events: AgentEvent[] = [];

    agent.on((event: AgentEvent) => {
      events.push(event);
    });

    await agent.run([{ role: "user", content: "问题" }]);

    const stateChanges = events.filter(e => e.type === "state_change");
    expect(stateChanges.length).toBeGreaterThan(0);
    expect(stateChanges[0].state).toBe("thinking");
  });

  test("应发射工具开始和结束事件", async () => {
    const responses: ChatResponse[] = [
      {
        text: "",
        hasToolCall: true,
        toolCalls: [createToolCall("test_tool", { input: "test" })],
      },
      { text: "完成", hasToolCall: false },
    ];
    provider = createMockProvider(responses);
    tools.register(createMockTool("test_tool", "工具结果"));

    const agent = new AgentLoop(provider, tools);
    const events: AgentEvent[] = [];

    agent.on((event: AgentEvent) => {
      events.push(event);
    });

    await agent.run([{ role: "user", content: "调用工具" }]);

    const toolStarts = events.filter(e => e.type === "tool_start");
    const toolEnds = events.filter(e => e.type === "tool_end");

    expect(toolStarts.length).toBe(1);
    expect(toolStarts[0].toolName).toBe("test_tool");

    expect(toolEnds.length).toBe(1);
    expect(toolEnds[0].toolName).toBe("test_tool");
    expect(toolEnds[0].message).toBe("工具结果");
  });

  test("应发射错误事件", async () => {
    const errorProvider: IProvider = {
      name: "error-provider",
      chat: mock(async () => {
        throw new Error("测试错误事件");
      }),
      getSupportedModels: () => [],
    };

    const agent = new AgentLoop(errorProvider, tools);
    const events: AgentEvent[] = [];

    agent.on((event: AgentEvent) => {
      events.push(event);
    });

    await agent.run([{ role: "user", content: "触发错误" }]);

    const errorEvents = events.filter(e => e.type === "error");
    expect(errorEvents.length).toBe(1);
    expect(errorEvents[0].error?.message).toBe("测试错误事件");
  });

  test("应支持多个事件处理器", async () => {
    const responses: ChatResponse[] = [
      { text: "回答", hasToolCall: false },
    ];
    provider = createMockProvider(responses);

    const agent = new AgentLoop(provider, tools);
    const events1: AgentEvent[] = [];
    const events2: AgentEvent[] = [];

    agent.on((event: AgentEvent) => events1.push(event));
    agent.on((event: AgentEvent) => events2.push(event));

    await agent.run([{ role: "user", content: "问题" }]);

    expect(events1.length).toBeGreaterThan(0);
    expect(events2.length).toBeGreaterThan(0);
    expect(events1.length).toBe(events2.length);
  });

  test("取消订阅后不应收到事件", async () => {
    const responses: ChatResponse[] = [
      { text: "回答", hasToolCall: false },
    ];
    provider = createMockProvider(responses);

    const agent = new AgentLoop(provider, tools);
    const events: AgentEvent[] = [];

    const handler = (event: AgentEvent) => events.push(event);
    agent.on(handler);
    agent.off(handler);

    await agent.run([{ role: "user", content: "问题" }]);

    expect(events.length).toBe(0);
  });

  test("事件处理器错误不应影响其他处理器", async () => {
    const responses: ChatResponse[] = [
      { text: "回答", hasToolCall: false },
    ];
    provider = createMockProvider(responses);

    const agent = new AgentLoop(provider, tools);
    const events: AgentEvent[] = [];

    // 第一个处理器抛出错误
    agent.on(() => {
      throw new Error("处理器错误");
    });

    // 第二个处理器应正常执行
    agent.on((event: AgentEvent) => events.push(event));

    const result = await agent.run([{ role: "user", content: "问题" }]);

    // 应正常完成
    expect(result.content).toBe("回答");
    // 第二个处理器应收到事件
    expect(events.length).toBeGreaterThan(0);
  });
});

describe("AgentLoop 与 ToolRegistry 集成", () => {
  test("应正确获取工具定义", async () => {
    const responses: ChatResponse[] = [
      { text: "回答", hasToolCall: false },
    ];
    const provider = createMockProvider(responses);

    const tools = new ToolRegistry();
    const tool1 = createMockTool("tool1", "result1");
    const tool2 = createMockTool("tool2", "result2");
    tools.register(tool1);
    tools.register(tool2);

    const agent = new AgentLoop(provider, tools);

    // 监听 chat 调用
    let capturedRequest: ChatRequest | undefined;
    const chatSpy = mock(async (request: ChatRequest) => {
      capturedRequest = request;
      return responses[0];
    });

    const spyProvider: IProvider = {
      name: "spy-provider",
      chat: chatSpy,
      getSupportedModels: () => ["mock-model"],
    };

    const spyAgent = new AgentLoop(spyProvider, tools);
    await spyAgent.run([{ role: "user", content: "测试" }]);

    // 验证工具定义被正确传递
    expect(capturedRequest?.tools).toBeDefined();
    expect(capturedRequest?.tools?.length).toBe(2);
    expect(capturedRequest?.tools?.map(t => t.name)).toContain("tool1");
    expect(capturedRequest?.tools?.map(t => t.name)).toContain("tool2");
  });

  test("空工具注册表应正常工作", async () => {
    const responses: ChatResponse[] = [
      { text: "无工具回答", hasToolCall: false },
    ];
    const provider = createMockProvider(responses);
    const tools = new ToolRegistry();

    const agent = new AgentLoop(provider, tools);
    const result = await agent.run([{ role: "user", content: "问题" }]);

    expect(result.content).toBe("无工具回答");
  });
});

describe("AgentLoop 边界条件", () => {
  test("空消息列表应正常处理", async () => {
    const responses: ChatResponse[] = [
      { text: "默认回答", hasToolCall: false },
    ];
    const provider = createMockProvider(responses);
    const tools = new ToolRegistry();

    const agent = new AgentLoop(provider, tools);
    const result = await agent.run([]);

    expect(result.content).toBe("默认回答");
  });

  test("空响应文本应正常处理", async () => {
    const responses: ChatResponse[] = [
      { text: "", hasToolCall: false },
    ];
    const provider = createMockProvider(responses);
    const tools = new ToolRegistry();

    const agent = new AgentLoop(provider, tools);
    const result = await agent.run([{ role: "user", content: "问题" }]);

    expect(result.content).toBe("");
    expect(result.error).toBeUndefined();
  });

  test("toolCalls 为空数组时应视为无工具调用", async () => {
    const responses: ChatResponse[] = [
      { text: "回答", hasToolCall: true, toolCalls: [] },
    ];
    const provider = createMockProvider(responses);
    const tools = new ToolRegistry();

    const agent = new AgentLoop(provider, tools);
    const result = await agent.run([{ role: "user", content: "问题" }]);

    expect(result.content).toBe("回答");
  });
});
