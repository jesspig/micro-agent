/**
 * types.ts 单元测试
 *
 * 验证 MicroAgent 运行时核心类型定义的正确性
 */

import { test, expect, describe } from "bun:test";
import type {
  // 通用类型
  JSONSchema,
  ProviderSpec,
  // Provider 相关
  ChatRequest,
  ChatResponse,
  ToolCall,
  UsageStats,
  // Tool 相关
  ToolDefinition,
  ToolParameterSchema,
  ToolPropertySchema,
  // Skill 相关
  SkillMeta,
  // Channel 相关
  ChannelCapabilities,
  ChannelConfig,
  OutboundMessage,
  SendResult,
  InboundMessage,
  MessageHandler,
  // Memory 相关
  Message,
  MessageRole,
  // Session 相关
  SessionMetadata,
} from "@microagent/runtime";

// ============================================================================
// 通用类型测试
// ============================================================================

describe("通用类型", () => {
  describe("JSONSchema", () => {
    test("应接受任意字符串键和未知值", () => {
      // JSONSchema 是 Record<string, unknown> 的别名
      const schema: JSONSchema = {
        type: "object",
        properties: {
          name: { type: "string" },
          age: { type: "number" },
        },
      };

      expect(schema.type).toBe("object");
      expect(schema.properties).toBeDefined();
    });

    test("应允许空对象", () => {
      const emptySchema: JSONSchema = {};
      expect(Object.keys(emptySchema)).toHaveLength(0);
    });
  });

  describe("ProviderSpec", () => {
    test("应正确创建最小规格", () => {
      const spec: ProviderSpec = {
        name: "test-provider",
      };

      expect(spec.name).toBe("test-provider");
      expect(spec.baseUrl).toBeUndefined();
      expect(spec.models).toBeUndefined();
    });

    test("应正确创建完整规格", () => {
      const spec: ProviderSpec = {
        name: "openai",
        baseUrl: "https://api.openai.com",
        models: ["gpt-4", "gpt-3.5-turbo"],
        defaultModel: "gpt-3.5-turbo",
        keywords: ["gpt", "chat"],
        envKey: "OPENAI_API_KEY",
        supportsPromptCaching: true,
        isGateway: false,
      };

      expect(spec.name).toBe("openai");
      expect(spec.baseUrl).toBe("https://api.openai.com");
      expect(spec.models).toHaveLength(2);
      expect(spec.defaultModel).toBe("gpt-3.5-turbo");
      expect(spec.keywords).toContain("gpt");
      expect(spec.envKey).toBe("OPENAI_API_KEY");
      expect(spec.supportsPromptCaching).toBe(true);
      expect(spec.isGateway).toBe(false);
    });
  });
});

// ============================================================================
// Provider 相关类型测试
// ============================================================================

describe("Provider 相关类型", () => {
  describe("ToolCall", () => {
    test("应正确创建工具调用", () => {
      const toolCall: ToolCall = {
        id: "call_123",
        name: "get_weather",
        arguments: { city: "Beijing", unit: "celsius" },
      };

      expect(toolCall.id).toBe("call_123");
      expect(toolCall.name).toBe("get_weather");
      expect(toolCall.arguments.city).toBe("Beijing");
    });

    test("应允许空参数对象", () => {
      const toolCall: ToolCall = {
        id: "call_456",
        name: "no_args_tool",
        arguments: {},
      };

      expect(toolCall.arguments).toEqual({});
    });
  });

  describe("UsageStats", () => {
    test("应正确记录使用统计", () => {
      const stats: UsageStats = {
        inputTokens: 100,
        outputTokens: 50,
      };

      expect(stats.inputTokens).toBe(100);
      expect(stats.outputTokens).toBe(50);
    });
  });

  describe("ChatRequest", () => {
    test("应正确创建最小请求", () => {
      const request: ChatRequest = {
        model: "gpt-4",
        messages: [{ role: "user", content: "Hello" }],
      };

      expect(request.model).toBe("gpt-4");
      expect(request.messages).toHaveLength(1);
      expect(request.tools).toBeUndefined();
    });

    test("应正确创建完整请求", () => {
      const request: ChatRequest = {
        model: "gpt-4",
        messages: [
          { role: "system", content: "You are a helpful assistant." },
          { role: "user", content: "Hello" },
        ],
        tools: [
          {
            name: "get_weather",
            description: "Get weather info",
            parameters: { type: "object", properties: {} },
          },
        ],
        temperature: 0.7,
        maxTokens: 1000,
      };

      expect(request.model).toBe("gpt-4");
      expect(request.messages).toHaveLength(2);
      expect(request.tools).toHaveLength(1);
      expect(request.temperature).toBe(0.7);
      expect(request.maxTokens).toBe(1000);
    });
  });

  describe("ChatResponse", () => {
    test("应正确创建无工具调用的响应", () => {
      const response: ChatResponse = {
        text: "Hello! How can I help you?",
        hasToolCall: false,
      };

      expect(response.text).toBe("Hello! How can I help you?");
      expect(response.hasToolCall).toBe(false);
      expect(response.toolCalls).toBeUndefined();
    });

    test("应正确创建有工具调用的响应", () => {
      const response: ChatResponse = {
        text: "",
        hasToolCall: true,
        toolCalls: [
          {
            id: "call_123",
            name: "get_weather",
            arguments: { city: "Beijing" },
          },
        ],
        usage: { inputTokens: 50, outputTokens: 20 },
        raw: { id: "resp_001" },
      };

      expect(response.hasToolCall).toBe(true);
      expect(response.toolCalls).toHaveLength(1);
      expect(response.usage?.inputTokens).toBe(50);
      expect(response.raw).toBeDefined();
    });
  });
});

// ============================================================================
// Tool 相关类型测试
// ============================================================================

describe("Tool 相关类型", () => {
  describe("ToolPropertySchema", () => {
    test("应正确创建基本属性", () => {
      const prop: ToolPropertySchema = {
        type: "string",
        description: "城市名称",
      };

      expect(prop.type).toBe("string");
      expect(prop.description).toBe("城市名称");
    });

    test("应正确创建带枚举的属性", () => {
      const prop: ToolPropertySchema = {
        type: "string",
        description: "温度单位",
        enum: ["celsius", "fahrenheit"],
        default: "celsius",
      };

      expect(prop.enum).toContain("celsius");
      expect(prop.default).toBe("celsius");
    });
  });

  describe("ToolParameterSchema", () => {
    test("应正确创建参数 schema", () => {
      const schema: ToolParameterSchema = {
        type: "object",
        properties: {
          city: {
            type: "string",
            description: "城市名称",
          },
          unit: {
            type: "string",
            description: "温度单位",
            enum: ["celsius", "fahrenheit"],
          },
        },
        required: ["city"],
      };

      expect(schema.type).toBe("object");
      expect(schema.properties.city).toBeDefined();
      expect(schema.required).toContain("city");
    });
  });

  describe("ToolDefinition", () => {
    test("应正确创建工具定义", () => {
      const tool: ToolDefinition = {
        name: "get_weather",
        description: "获取指定城市的天气信息",
        parameters: {
          type: "object",
          properties: {
            city: {
              type: "string",
              description: "城市名称",
            },
          },
          required: ["city"],
        },
      };

      expect(tool.name).toBe("get_weather");
      expect(tool.description).toBe("获取指定城市的天气信息");
      expect(tool.parameters.type).toBe("object");
      expect(tool.parameters.required).toContain("city");
    });
  });
});

// ============================================================================
// Skill 相关类型测试
// ============================================================================

describe("Skill 相关类型", () => {
  describe("SkillMeta", () => {
    test("应正确创建最小元数据", () => {
      const meta: SkillMeta = {
        name: "weather-skill",
        description: "天气查询技能",
        version: "1.0.0",
      };

      expect(meta.name).toBe("weather-skill");
      expect(meta.description).toBe("天气查询技能");
      expect(meta.version).toBe("1.0.0");
      expect(meta.dependencies).toBeUndefined();
    });

    test("应正确创建完整元数据", () => {
      const meta: SkillMeta = {
        name: "weather-skill",
        description: "天气查询技能",
        version: "1.0.0",
        dependencies: ["location-service"],
        tags: ["weather", "utility"],
      };

      expect(meta.dependencies).toContain("location-service");
      expect(meta.tags).toContain("weather");
    });
  });
});

// ============================================================================
// Channel 相关类型测试
// ============================================================================

describe("Channel 相关类型", () => {
  describe("ChannelCapabilities", () => {
    test("应正确创建能力标识", () => {
      const caps: ChannelCapabilities = {
        text: true,
        media: false,
        reply: true,
        edit: false,
        delete: false,
      };

      expect(caps.text).toBe(true);
      expect(caps.media).toBe(false);
      expect(caps.reply).toBe(true);
    });
  });

  describe("ChannelConfig", () => {
    test("应正确创建基本配置", () => {
      const config: ChannelConfig = {
        token: "secret_token_123",
      };

      expect(config.token).toBe("secret_token_123");
    });

    test("应正确创建完整配置", () => {
      const config: ChannelConfig = {
        token: "secret_token_123",
        webhookUrl: "https://example.com/webhook",
        customOption: "value",
      };

      expect(config.webhookUrl).toBe("https://example.com/webhook");
      expect(config.customOption).toBe("value");
    });
  });

  describe("OutboundMessage", () => {
    test("应正确创建文本消息", () => {
      const msg: OutboundMessage = {
        to: "user_123",
        text: "Hello!",
      };

      expect(msg.to).toBe("user_123");
      expect(msg.text).toBe("Hello!");
      expect(msg.mediaUrl).toBeUndefined();
    });

    test("应正确创建带媒体的回复消息", () => {
      const msg: OutboundMessage = {
        to: "user_123",
        text: "Here is an image",
        mediaUrl: "https://example.com/image.png",
        replyTo: "msg_456",
      };

      expect(msg.mediaUrl).toBe("https://example.com/image.png");
      expect(msg.replyTo).toBe("msg_456");
    });
  });

  describe("SendResult", () => {
    test("应正确创建成功结果", () => {
      const result: SendResult = {
        success: true,
        messageId: "msg_789",
      };

      expect(result.success).toBe(true);
      expect(result.messageId).toBe("msg_789");
      expect(result.error).toBeUndefined();
    });

    test("应正确创建失败结果", () => {
      const result: SendResult = {
        success: false,
        error: "Network error",
      };

      expect(result.success).toBe(false);
      expect(result.error).toBe("Network error");
    });
  });

  describe("InboundMessage", () => {
    test("应正确创建文本消息", () => {
      const msg: InboundMessage = {
        from: "user_123",
        text: "Hello bot",
        timestamp: Date.now(),
      };

      expect(msg.from).toBe("user_123");
      expect(msg.text).toBe("Hello bot");
      expect(msg.timestamp).toBeGreaterThan(0);
    });

    test("应正确创建带媒体的消息", () => {
      const msg: InboundMessage = {
        from: "user_123",
        text: "Check this image",
        mediaUrls: ["https://example.com/photo.jpg"],
        timestamp: 1234567890,
        replyTo: "msg_001",
      };

      expect(msg.mediaUrls).toHaveLength(1);
      expect(msg.replyTo).toBe("msg_001");
    });
  });

  describe("MessageHandler", () => {
    test("应正确创建同步处理器", async () => {
      let received: InboundMessage | null = null;

      const handler: MessageHandler = (message) => {
        received = message;
      };

      const testMsg: InboundMessage = {
        from: "user_123",
        text: "Test",
        timestamp: 1234567890,
      };

      handler(testMsg);
      expect(received).toEqual(testMsg);
    });

    test("应正确创建异步处理器", async () => {
      let processed = false;

      const handler: MessageHandler = async (message) => {
        await Promise.resolve();
        processed = true;
      };

      const testMsg: InboundMessage = {
        from: "user_123",
        text: "Test",
        timestamp: 1234567890,
      };

      await handler(testMsg);
      expect(processed).toBe(true);
    });
  });
});

// ============================================================================
// Memory 相关类型测试
// ============================================================================

describe("Memory 相关类型", () => {
  describe("MessageRole", () => {
    test("应包含所有角色类型", () => {
      const roles: MessageRole[] = ["system", "user", "assistant", "tool"];

      expect(roles).toContain("system");
      expect(roles).toContain("user");
      expect(roles).toContain("assistant");
      expect(roles).toContain("tool");
    });
  });

  describe("Message", () => {
    test("应正确创建 system 消息", () => {
      const msg: Message = {
        role: "system",
        content: "You are a helpful assistant.",
      };

      expect(msg.role).toBe("system");
      expect(msg.content).toBe("You are a helpful assistant.");
      expect(msg.toolCalls).toBeUndefined();
    });

    test("应正确创建 user 消息", () => {
      const msg: Message = {
        role: "user",
        content: "What is the weather?",
        timestamp: 1234567890,
      };

      expect(msg.role).toBe("user");
      expect(msg.timestamp).toBe(1234567890);
    });

    test("应正确创建带工具调用的 assistant 消息", () => {
      const msg: Message = {
        role: "assistant",
        content: "",
        toolCalls: [
          {
            id: "call_001",
            name: "get_weather",
            arguments: { city: "Beijing" },
          },
        ],
      };

      expect(msg.role).toBe("assistant");
      expect(msg.toolCalls).toHaveLength(1);
      expect(msg.toolCalls![0].name).toBe("get_weather");
    });

    test("应正确创建 tool 消息", () => {
      const msg: Message = {
        role: "tool",
        content: '{"temperature": 25, "condition": "sunny"}',
        toolCallId: "call_001",
        name: "get_weather",
      };

      expect(msg.role).toBe("tool");
      expect(msg.toolCallId).toBe("call_001");
      expect(msg.name).toBe("get_weather");
    });
  });
});

// ============================================================================
// Session 相关类型测试
// ============================================================================

describe("Session 相关类型", () => {
  describe("SessionMetadata", () => {
    test("应正确创建最小元数据", () => {
      const now = Date.now();
      const meta: SessionMetadata = {
        id: "session_001",
        createdAt: now,
        updatedAt: now,
      };

      expect(meta.id).toBe("session_001");
      expect(meta.createdAt).toBe(now);
      expect(meta.updatedAt).toBe(now);
    });

    test("应正确创建完整元数据", () => {
      const now = Date.now();
      const meta: SessionMetadata = {
        id: "session_001",
        createdAt: now,
        updatedAt: now,
        channelId: "telegram_001",
        userId: "user_123",
        customField: "custom_value",
      };

      expect(meta.channelId).toBe("telegram_001");
      expect(meta.userId).toBe("user_123");
      expect(meta.customField).toBe("custom_value");
    });

    test("应允许索引访问自定义属性", () => {
      const meta: SessionMetadata = {
        id: "session_001",
        createdAt: 1234567890,
        updatedAt: 1234567890,
        theme: "dark",
        language: "zh-CN",
      };

      expect(meta["theme"]).toBe("dark");
      expect(meta["language"]).toBe("zh-CN");
    });
  });
});
