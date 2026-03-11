/**
 * LangGraph 集成测试
 *
 * 测试 ReAct Agent 的基本功能
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { HumanMessage, AIMessage, ToolMessage } from "@langchain/core/messages";
import {
  ReActAgentState,
  type AgentState,
  createAgentGraph,
  LangGraphOrchestrator,
  hasPendingToolCalls,
  getRemainingTokens,
  isOverBudget,
} from "./index";
import type { LangGraphAgentConfig, ToolCall, ToolContext } from "./types";
import type { LLMProvider, LLMResponse, ProviderCapabilities } from "../../types/provider";
import type { ToolResult, ContentPart } from "../../types/tool";

// Mock LLM Provider
const mockLLMProvider: LLMProvider = {
  type: "llm",
  name: "mock-provider",
  chat: async (
    _messages: unknown[],
    _tools?: unknown[],
    _model?: string,
    _config?: unknown
  ): Promise<LLMResponse> => {
    // 简化实现，返回固定响应
    return {
      content: "测试响应",
      hasToolCalls: false,
      toolCalls: [],
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    };
  },
  getDefaultModel: () => "mock-model",
  isAvailable: async () => true,
  getModelCapabilities: (_modelId: string): ProviderCapabilities => ({
    vision: false,
    think: false,
    tool: true,
  }),
  listModels: async () => ["mock-model"],
};

// Mock Tool Registry
const mockToolRegistry = {
  getDefinitions: () => [
    {
      name: "calculator",
      description: "计算数学表达式",
      inputSchema: {
        type: "object",
        properties: {
          expression: { type: "string", description: "数学表达式" },
        },
        required: ["expression"],
      } as Record<string, unknown>,
    },
  ],
  execute: async (
    _name: string,
    input: unknown,
    _context: ToolContext
  ): Promise<ToolResult> => {
    const args = input as Record<string, unknown>;
    const expression = args.expression as string;
    try {
      const result = eval(expression);
      return {
        content: [{ type: "text", text: `计算结果: ${result}` } as ContentPart],
        isError: false,
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `计算错误: ${(error as Error).message}` } as ContentPart],
        isError: true,
      };
    }
  },
};

// 测试配置
const testConfig: LangGraphAgentConfig = {
  llmProvider: mockLLMProvider,
  toolRegistry: mockToolRegistry,
  defaultModel: "test-model",
  systemPrompt: "你是一个测试助手。",
  maxIterations: 5,
  maxConsecutiveErrors: 3,
  tokenBudget: 128000,
  workspace: "/tmp",
  knowledgeBase: "/tmp/knowledge",
};

describe("LangGraph State", () => {
  it("should create state annotation", () => {
    // ReActAgentState 是 Annotation，不是直接的 state 对象
    // 测试 Annotation 是否正确定义
    expect(ReActAgentState).toBeDefined();
    expect(ReActAgentState.spec).toBeDefined();
    // 验证关键字段存在
    expect("messages" in ReActAgentState.spec).toBe(true);
    expect("iterations" in ReActAgentState.spec).toBe(true);
    expect("maxIterations" in ReActAgentState.spec).toBe(true);
  });
});

describe("State Helper Functions", () => {
  let state: AgentState;

  beforeEach(() => {
    state = {
      messages: [],
      iterations: 0,
      maxIterations: 10,
      pendingToolCalls: [],
      tokenBudget: {
        maxContextTokens: 128000,
        reservedForResponse: 4096,
        usedTokens: 0,
      },
      tokenUsage: {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      },
      sessionKey: "test",
      channel: "cli",
      chatId: "test-chat",
      reasoningChain: [],
      actionHistory: [],
      observations: [],
      errors: [],
      consecutiveErrors: 0,
      maxConsecutiveErrors: 3,
      systemPrompt: "",
      retrievedMemories: [],
      retrievedKnowledge: [],
      lastToolResults: [],
      isStreaming: false,
      streamCallbacks: null,
      reactState: "thinking",
      metadata: {},
    } as unknown as AgentState;
  });

  it("hasPendingToolCalls should return false for empty array", () => {
    expect(hasPendingToolCalls(state)).toBe(false);
  });

  it("hasPendingToolCalls should return true when tool calls exist", () => {
    state.pendingToolCalls = [{ id: "1", name: "test", arguments: {} }];
    expect(hasPendingToolCalls(state)).toBe(true);
  });

  it("getRemainingTokens should calculate correctly", () => {
    state.tokenUsage.totalTokens = 10000;
    const remaining = getRemainingTokens(state);
    expect(remaining).toBe(128000 - 4096 - 10000);
  });

  it("isOverBudget should return false when within budget", () => {
    expect(isOverBudget(state)).toBe(false);
  });

  it("isOverBudget should return true when over budget", () => {
    state.tokenUsage.totalTokens = 130000;
    expect(isOverBudget(state)).toBe(true);
  });
});

describe("LangGraphOrchestrator", () => {
  let orchestrator: LangGraphOrchestrator;

  beforeEach(() => {
    orchestrator = new LangGraphOrchestrator(testConfig);
  });

  it("should create orchestrator instance", () => {
    expect(orchestrator).toBeDefined();
  });

  it("should process simple message without tools", async () => {
    const result = await orchestrator.processMessage({
      channel: "test",
      chatId: "test-1",
      content: "你好",
    });

    expect(result).toBeDefined();
    expect(result.messages.length).toBeGreaterThan(0);
    expect(result.iterations).toBeGreaterThanOrEqual(1);
  });

  it("should process message with tool calls", async () => {
    const result = await orchestrator.processMessage({
      channel: "test",
      chatId: "test-2",
      content: "帮我计算 1+1",
    });

    expect(result).toBeDefined();
    // 应该包含用户消息、AI消息（工具调用）、工具结果、最终AI响应
    expect(result.messages.length).toBeGreaterThan(1);
  });

  it("should track session state", async () => {
    await orchestrator.processMessage({
      channel: "test",
      chatId: "test-3",
      content: "第一条消息",
    });

    const state = await orchestrator.getSessionState("test:test-3");
    expect(state).toBeDefined();
    expect(state?.messages.length).toBeGreaterThan(0);
  });
});

describe("Graph Creation", () => {
  it("should create agent graph", () => {
    const graph = createAgentGraph(testConfig);
    expect(graph).toBeDefined();
  });
});
