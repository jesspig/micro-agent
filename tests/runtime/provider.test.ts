/**
 * provider 模块单元测试
 *
 * 测试 BaseProvider 抽象类和 ProviderRegistry 的功能
 */

import { test, expect, describe, beforeEach, mock } from "bun:test";
import { BaseProvider } from "../../microagent/runtime/src/provider/base.js";
import { ProviderRegistry } from "../../microagent/runtime/src/provider/registry.js";
import type { IProviderExtended } from "../../microagent/runtime/src/provider/contract.js";
import type {
  ProviderConfig,
  ProviderCapabilities,
  ProviderStatus,
} from "../../microagent/runtime/src/provider/types.js";
import type { ChatRequest, ChatResponse } from "../../microagent/runtime/src/types.js";
import { RegistryError } from "../../microagent/runtime/src/errors.js";

// ============================================================================
// Mock 实现
// ============================================================================

/**
 * Mock Provider 实现
 * 继承 BaseProvider 用于测试
 */
class MockProvider extends BaseProvider {
  readonly name: string;
  readonly config: ProviderConfig;
  private supportedModels: string[];

  constructor(
    name: string = "mock-provider",
    options: {
      models?: string[];
      capabilities?: Partial<ProviderCapabilities>;
      config?: Partial<ProviderConfig>;
    } = {}
  ) {
    super();
    this.name = name;
    this.supportedModels = options.models ?? ["gpt-4", "gpt-3.5-turbo"];
    this.config = {
      id: options.config?.id ?? `provider-${name}`,
      name: name,
      baseUrl: options.config?.baseUrl ?? "https://api.example.com",
      apiKey: options.config?.apiKey ?? "test-api-key",
      models: this.supportedModels,
      capabilities: options.capabilities,
    };

    // 覆盖默认能力
    if (options.capabilities) {
      Object.assign(this.capabilities, options.capabilities);
    }
  }

  chat = mock(async (request: ChatRequest): Promise<ChatResponse> => {
    this.recordUsage();
    return {
      text: `Mock response for model: ${request.model}`,
      hasToolCall: false,
    };
  });

  getSupportedModels = mock((): string[] => {
    return [...this.supportedModels];
  });

  // 暴露 protected 方法用于测试
  exposeRecordError(): void {
    this.recordError();
  }

  exposeRecordUsage(): void {
    this.recordUsage();
  }
}

/**
 * 会抛出错误的 Mock Provider
 */
class FailingMockProvider extends BaseProvider {
  readonly name = "failing-provider";
  readonly config: ProviderConfig = {
    id: "failing-provider",
    name: "failing-provider",
    baseUrl: "https://api.example.com",
    apiKey: "test-api-key",
    models: ["model-1"],
  };

  chat = mock(async (_request: ChatRequest): Promise<ChatResponse> => {
    this.recordError();
    throw new Error("API connection failed");
  });

  getSupportedModels = mock((): string[] => {
    return ["model-1"];
  });
}

/**
 * 简单 Provider 实现（用于 Registry 测试）
 */
class SimpleProvider implements IProviderExtended {
  readonly name: string;
  readonly config: ProviderConfig;
  readonly capabilities: ProviderCapabilities;

  constructor(name: string, models: string[] = ["default-model"]) {
    this.name = name;
    this.config = {
      id: name,
      name: name,
      baseUrl: "https://api.example.com",
      apiKey: "test-key",
      models,
    };
    this.capabilities = {
      supportsStreaming: true,
      supportsVision: false,
      supportsPromptCaching: false,
      maxContextTokens: 128000,
      toolSchemaMode: "native",
    };
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    return {
      text: `Response from ${this.name}`,
      hasToolCall: false,
    };
  }

  getSupportedModels(): string[] {
    return this.config.models;
  }

  getStatus(): ProviderStatus {
    return {
      name: this.name,
      available: true,
      models: this.config.models,
      errorCount: 0,
    };
  }

  async testConnection(): Promise<boolean> {
    return true;
  }
}

// ============================================================================
// BaseProvider 测试
// ============================================================================

describe("BaseProvider 抽象类测试", () => {
  describe("默认能力配置", () => {
    test("应提供正确的默认能力值", () => {
      const provider = new MockProvider();

      expect(provider.capabilities.supportsStreaming).toBe(true);
      expect(provider.capabilities.supportsVision).toBe(false);
      expect(provider.capabilities.supportsPromptCaching).toBe(false);
      expect(provider.capabilities.maxContextTokens).toBe(128000);
      expect(provider.capabilities.toolSchemaMode).toBe("native");
    });

    test("应允许覆盖默认能力", () => {
      const provider = new MockProvider("vision-provider", {
        capabilities: {
          supportsVision: true,
          maxContextTokens: 200000,
        },
      });

      expect(provider.capabilities.supportsVision).toBe(true);
      expect(provider.capabilities.maxContextTokens).toBe(200000);
      // 其他能力保持默认
      expect(provider.capabilities.supportsStreaming).toBe(true);
    });
  });

  describe("getStatus 方法", () => {
    test("应返回正确的状态信息", () => {
      const provider = new MockProvider("test-provider", {
        models: ["model-a", "model-b"],
      });

      const status = provider.getStatus();

      expect(status.name).toBe("test-provider");
      expect(status.available).toBe(true);
      expect(status.models).toEqual(["model-a", "model-b"]);
      expect(status.errorCount).toBe(0);
      expect(status.lastUsed).toBeUndefined();
    });

    test("应在使用后记录 lastUsed 时间", async () => {
      const provider = new MockProvider();
      const beforeTime = Date.now();

      await provider.chat({
        model: "gpt-4",
        messages: [{ role: "user", content: "Hello" }],
      });

      const status = provider.getStatus();

      expect(status.lastUsed).toBeDefined();
      expect(status.lastUsed!).toBeGreaterThanOrEqual(beforeTime);
    });

    test("应正确记录错误计数", () => {
      const provider = new MockProvider();

      provider.exposeRecordError();
      provider.exposeRecordError();
      provider.exposeRecordError();

      const status = provider.getStatus();
      expect(status.errorCount).toBe(3);
    });
  });

  describe("testConnection 方法", () => {
    test("成功连接应返回 true", async () => {
      const provider = new MockProvider();

      const result = await provider.testConnection();

      expect(result).toBe(true);
    });

    test("连接失败应返回 false", async () => {
      const provider = new FailingMockProvider();

      const result = await provider.testConnection();

      expect(result).toBe(false);
    });

    test("无模型时应使用 default 模型", async () => {
      const provider = new MockProvider("empty-provider", { models: [] });

      const result = await provider.testConnection();

      expect(result).toBe(true);
      expect(provider.chat).toHaveBeenCalledWith(
        expect.objectContaining({
          model: "default",
        })
      );
    });
  });

  describe("chat 方法", () => {
    test("应正确处理聊天请求", async () => {
      const provider = new MockProvider();

      const response = await provider.chat({
        model: "gpt-4",
        messages: [
          { role: "system", content: "You are helpful" },
          { role: "user", content: "Hello" },
        ],
        temperature: 0.7,
        maxTokens: 100,
      });

      expect(response.text).toContain("Mock response");
      expect(response.hasToolCall).toBe(false);
      expect(provider.chat).toHaveBeenCalled();
    });

    test("应记录使用时间", async () => {
      const provider = new MockProvider();

      await provider.chat({
        model: "gpt-4",
        messages: [{ role: "user", content: "Test" }],
      });

      const status = provider.getStatus();
      expect(status.lastUsed).toBeDefined();
    });
  });

  describe("getSupportedModels 方法", () => {
    test("应返回模型列表", () => {
      const provider = new MockProvider("test", {
        models: ["model-1", "model-2", "model-3"],
      });

      const models = provider.getSupportedModels();

      expect(models).toEqual(["model-1", "model-2", "model-3"]);
    });

    test("应返回模型列表的副本", () => {
      const provider = new MockProvider();
      const models1 = provider.getSupportedModels();
      const models2 = provider.getSupportedModels();

      expect(models1).not.toBe(models2); // 不同的引用
      expect(models1).toEqual(models2); // 相同的内容
    });
  });

  describe("配置属性", () => {
    test("应正确暴露配置信息", () => {
      const provider = new MockProvider("configured-provider", {
        config: {
          baseUrl: "https://custom.api.com",
          apiKey: "custom-key",
        },
      });

      expect(provider.config.name).toBe("configured-provider");
      expect(provider.config.baseUrl).toBe("https://custom.api.com");
      expect(provider.config.apiKey).toBe("custom-key");
    });
  });
});

// ============================================================================
// ProviderRegistry 测试
// ============================================================================

describe("ProviderRegistry 测试", () => {
  let registry: ProviderRegistry;

  beforeEach(() => {
    registry = new ProviderRegistry();
  });

  describe("register 方法", () => {
    test("应成功注册 Provider", () => {
      const provider = new SimpleProvider("openai");

      registry.register(provider);

      expect(registry.has("openai")).toBe(true);
      expect(registry.get("openai")).toBe(provider);
    });

    test("注册已存在的 Provider 应抛出 RegistryError", () => {
      const provider1 = new SimpleProvider("anthropic");
      const provider2 = new SimpleProvider("anthropic");

      registry.register(provider1);

      expect(() => registry.register(provider2)).toThrow(RegistryError);
      expect(() => registry.register(provider2)).toThrow('Provider "anthropic" 已存在');
    });

    test("RegistryError 应包含正确的错误信息", () => {
      const provider = new SimpleProvider("test-provider");
      registry.register(provider);

      try {
        registry.register(new SimpleProvider("test-provider"));
      } catch (error) {
        expect(error).toBeInstanceOf(RegistryError);
        const registryError = error as RegistryError;
        expect(registryError.itemType).toBe("Provider");
        expect(registryError.itemName).toBe("test-provider");
      }
    });

    test("应支持注册多个不同的 Provider", () => {
      const openai = new SimpleProvider("openai");
      const anthropic = new SimpleProvider("anthropic");
      const google = new SimpleProvider("google");

      registry.register(openai);
      registry.register(anthropic);
      registry.register(google);

      expect(registry.list()).toHaveLength(3);
      expect(registry.has("openai")).toBe(true);
      expect(registry.has("anthropic")).toBe(true);
      expect(registry.has("google")).toBe(true);
    });
  });

  describe("get 方法", () => {
    test("应返回已注册的 Provider", () => {
      const provider = new SimpleProvider("test");
      registry.register(provider);

      const result = registry.get("test");

      expect(result).toBe(provider);
    });

    test("获取不存在的 Provider 应返回 undefined", () => {
      const result = registry.get("non-existent");

      expect(result).toBeUndefined();
    });
  });

  describe("has 方法", () => {
    test("已注册应返回 true", () => {
      registry.register(new SimpleProvider("existing"));

      expect(registry.has("existing")).toBe(true);
    });

    test("未注册应返回 false", () => {
      expect(registry.has("non-existent")).toBe(false);
    });
  });

  describe("list 方法", () => {
    test("空注册表应返回空数组", () => {
      const result = registry.list();

      expect(result).toEqual([]);
    });

    test("应返回所有已注册的 Provider", () => {
      const provider1 = new SimpleProvider("provider-1");
      const provider2 = new SimpleProvider("provider-2");

      registry.register(provider1);
      registry.register(provider2);

      const result = registry.list();

      expect(result).toHaveLength(2);
      expect(result).toContain(provider1);
      expect(result).toContain(provider2);
    });
  });

  describe("delete 方法", () => {
    test("应成功移除已注册的 Provider", () => {
      registry.register(new SimpleProvider("to-delete"));

      const result = registry.delete("to-delete");

      expect(result).toBe(true);
      expect(registry.has("to-delete")).toBe(false);
    });

    test("移除不存在的 Provider 应返回 false", () => {
      const result = registry.delete("non-existent");

      expect(result).toBe(false);
    });

    test("移除后重新注册应成功", () => {
      registry.register(new SimpleProvider("recycle"));
      registry.delete("recycle");

      expect(() => registry.register(new SimpleProvider("recycle"))).not.toThrow();
    });
  });
});

// ============================================================================
// ProviderRegistry 静态方法测试
// ============================================================================

describe("ProviderRegistry 静态方法测试", () => {
  describe("findByModel 方法", () => {
    test("应根据模型关键词匹配 Provider", () => {
      // 测试 GPT 模型
      const gptResult = ProviderRegistry.findByModel("gpt-4");
      expect(gptResult?.name).toBe("openai");

      // 测试 Claude 模型
      const claudeResult = ProviderRegistry.findByModel("claude-3-opus");
      expect(claudeResult?.name).toBe("anthropic");

      // 测试 Gemini 模型
      const geminiResult = ProviderRegistry.findByModel("gemini-pro");
      expect(geminiResult?.name).toBe("google");
    });

    test("应支持多种关键词匹配", () => {
      // O1/O3 系列
      const o1Result = ProviderRegistry.findByModel("o1-preview");
      expect(o1Result?.name).toBe("openai");

      const o3Result = ProviderRegistry.findByModel("o3-mini");
      expect(o3Result?.name).toBe("openai");
    });

    test("不匹配的模型应返回 undefined", () => {
      const result = ProviderRegistry.findByModel("unknown-model-xyz");

      expect(result).toBeUndefined();
    });

    test("网关类型 Provider 不应被匹配", () => {
      // openrouter 是网关，不应被 findByModel 匹配
      const result = ProviderRegistry.findByModel("openrouter-model");
      expect(result?.name).not.toBe("openrouter");
    });

    test("匹配应不区分大小写", () => {
      const result1 = ProviderRegistry.findByModel("GPT-4");
      const result2 = ProviderRegistry.findByModel("CLAUDE-3");
      const result3 = ProviderRegistry.findByModel("Gemini-Pro");

      expect(result1?.name).toBe("openai");
      expect(result2?.name).toBe("anthropic");
      expect(result3?.name).toBe("google");
    });
  });

  describe("getBuiltinProviders 方法", () => {
    test("应返回内置 Provider 列表", () => {
      const providers = ProviderRegistry.getBuiltinProviders();

      expect(providers.length).toBeGreaterThan(0);
      expect(providers.some((p) => p.name === "openai")).toBe(true);
      expect(providers.some((p) => p.name === "anthropic")).toBe(true);
    });

    test("应返回副本而非原数组", () => {
      const providers1 = ProviderRegistry.getBuiltinProviders();
      const providers2 = ProviderRegistry.getBuiltinProviders();

      expect(providers1).not.toBe(providers2);
      expect(providers1).toEqual(providers2);
    });

    test("修改返回数组不应影响内置数据", () => {
      const providers = ProviderRegistry.getBuiltinProviders();
      const originalLength = providers.length;

      providers.push({
        name: "fake-provider",
        envKey: "FAKE_KEY",
      });

      const newProviders = ProviderRegistry.getBuiltinProviders();
      expect(newProviders.length).toBe(originalLength);
    });

    test("应包含必要的 Provider 规格", () => {
      const providers = ProviderRegistry.getBuiltinProviders();

      // 检查 openai
      const openai = providers.find((p) => p.name === "openai");
      expect(openai).toBeDefined();
      expect(openai!.keywords).toContain("gpt");
      expect(openai!.envKey).toBe("OPENAI_API_KEY");

      // 检查 anthropic
      const anthropic = providers.find((p) => p.name === "anthropic");
      expect(anthropic).toBeDefined();
      expect(anthropic!.keywords).toContain("claude");
      expect(anthropic!.supportsPromptCaching).toBe(true);

      // 检查 openrouter（网关）
      const openrouter = providers.find((p) => p.name === "openrouter");
      expect(openrouter).toBeDefined();
      expect(openrouter!.isGateway).toBe(true);
    });
  });
});

// ============================================================================
// IProviderExtended 接口兼容性测试
// ============================================================================

describe("IProviderExtended 接口兼容性测试", () => {
  test("BaseProvider 应实现 IProviderExtended 接口", () => {
    const provider: IProviderExtended = new MockProvider();

    // 基础属性
    expect(provider.name).toBeDefined();
    expect(provider.config).toBeDefined();
    expect(provider.capabilities).toBeDefined();

    // 方法
    expect(typeof provider.chat).toBe("function");
    expect(typeof provider.getSupportedModels).toBe("function");
    expect(typeof provider.getStatus).toBe("function");
    expect(typeof provider.testConnection).toBe("function");
  });

  test("SimpleProvider 应实现 IProviderExtended 接口", () => {
    const provider: IProviderExtended = new SimpleProvider("test");

    expect(provider.name).toBe("test");
    expect(provider.config).toBeDefined();
    expect(provider.capabilities).toBeDefined();
    expect(typeof provider.getStatus).toBe("function");
    expect(typeof provider.testConnection).toBe("function");
  });

  test("ProviderStatus 结构应符合接口定义", async () => {
    const provider = new MockProvider("status-test");
    await provider.chat({
      model: "gpt-4",
      messages: [{ role: "user", content: "test" }],
    });

    const status = provider.getStatus();

    // 验证必需字段
    expect(typeof status.name).toBe("string");
    expect(typeof status.available).toBe("boolean");
    expect(Array.isArray(status.models)).toBe(true);
    expect(typeof status.errorCount).toBe("number");

    // 验证可选字段
    if (status.lastUsed !== undefined) {
      expect(typeof status.lastUsed).toBe("number");
    }
  });
});

// ============================================================================
// 边界情况和错误处理测试
// ============================================================================

describe("边界情况和错误处理测试", () => {
  describe("空模型列表处理", () => {
    test("空模型列表的 Provider 应能正常工作", () => {
      const provider = new MockProvider("empty-models", { models: [] });

      expect(provider.getSupportedModels()).toEqual([]);
      expect(provider.getStatus().models).toEqual([]);
    });
  });

  describe("特殊字符处理", () => {
    test("Provider 名称支持特殊字符", () => {
      const registry = new ProviderRegistry();
      const provider = new SimpleProvider("my-custom-provider_v2");

      registry.register(provider);

      expect(registry.get("my-custom-provider_v2")).toBe(provider);
    });
  });

  describe("并发访问安全", () => {
    test("多次并发注册不应导致重复", async () => {
      const registry = new ProviderRegistry();

      // 模拟并发注册尝试
      const registerAttempt = () => {
        try {
          registry.register(new SimpleProvider("concurrent-test"));
          return true;
        } catch {
          return false;
        }
      };

      // 多次尝试注册同名 Provider
      const results = await Promise.all([
        Promise.resolve(registerAttempt()),
        Promise.resolve(registerAttempt()),
        Promise.resolve(registerAttempt()),
      ]);

      // 只有第一个应该成功
      const successCount = results.filter(Boolean).length;
      expect(successCount).toBe(1);
      expect(registry.has("concurrent-test")).toBe(true);
    });
  });

  describe("长名称处理", () => {
    test("支持长 Provider 名称", () => {
      const longName = "a".repeat(100);
      const provider = new SimpleProvider(longName);
      const registry = new ProviderRegistry();

      registry.register(provider);

      expect(registry.has(longName)).toBe(true);
      expect(registry.get(longName)?.name).toBe(longName);
    });
  });
});
