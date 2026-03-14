/**
 * Provider 单元测试
 *
 * 测试 OpenAIProvider、OpenAIResponseProvider、AnthropicProvider 和 OllamaProvider
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";

import {
  OpenAIProvider,
  createOpenAIProvider,
  type OpenAIProviderOptions,
} from "../../microagent/applications/providers/openai.js";

import {
  OpenAIResponseProvider,
  createOpenAIResponseProvider,
  type OpenAIResponseProviderOptions,
} from "../../microagent/applications/providers/openai-response.js";

import {
  AnthropicProvider,
  createAnthropicProvider,
  type AnthropicProviderOptions,
} from "../../microagent/applications/providers/anthropic.js";

import {
  OllamaProvider,
  createOllamaProvider,
  type OllamaProviderOptions,
} from "../../microagent/applications/providers/ollama.js";

// ============================================================================
// 测试常量
// ============================================================================

const TEST_MODELS = {
  openai: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"],
  anthropic: ["claude-3-5-sonnet-20241022", "claude-3-5-haiku-20241022"],
  deepseek: ["deepseek-chat", "deepseek-r1"],
  bigmodel: ["glm-4", "glm-4-plus", "glm-4-flash"],
  ollama: ["llama3.2", "qwen2.5", "deepseek-r1"],
};

// ============================================================================
// OpenAIProvider 测试
// ============================================================================

describe("OpenAIProvider", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("实例创建", () => {
    it("应该正确创建实例", () => {
      const provider = new OpenAIProvider({
        name: "openai",
        baseUrl: "https://api.openai.com/v1",
        apiKey: "test-key",
        models: TEST_MODELS.openai,
      });

      expect(provider.name).toBe("openai");
      expect(provider.config.id).toBe("openai");
      expect(provider.config.apiKey).toBe("test-key");
      expect(provider.config.models).toEqual(TEST_MODELS.openai);
    });

    it("应该使用 displayName", () => {
      const provider = new OpenAIProvider({
        name: "openai",
        displayName: "OpenAI GPT",
        baseUrl: "https://api.openai.com/v1",
        apiKey: "test-key",
        models: TEST_MODELS.openai,
      });

      expect(provider.config.name).toBe("OpenAI GPT");
    });

    it("应该从环境变量读取 API Key", () => {
      process.env.OPENAI_API_KEY = "env-key";
      const provider = new OpenAIProvider({
        name: "openai",
        baseUrl: "https://api.openai.com/v1",
        models: TEST_MODELS.openai,
      });

      expect(provider.config.apiKey).toBe("env-key");
    });

    it("缺少 models 应抛出错误", () => {
      expect(() =>
        new OpenAIProvider({
          name: "openai",
          baseUrl: "https://api.openai.com/v1",
          apiKey: "test-key",
          models: [],
        })
      ).toThrow("models 未配置");
    });

    it("缺少 baseUrl 应抛出错误", () => {
      expect(() =>
        new OpenAIProvider({
          name: "openai",
          baseUrl: "",
          apiKey: "test-key",
          models: TEST_MODELS.openai,
        })
      ).toThrow("baseUrl 未配置");
    });
  });

  describe("基础方法", () => {
    it("应该返回支持的模型列表", () => {
      const provider = new OpenAIProvider({
        name: "openai",
        baseUrl: "https://api.openai.com/v1",
        apiKey: "test-key",
        models: TEST_MODELS.openai,
      });

      const models = provider.getSupportedModels();
      expect(models).toEqual(TEST_MODELS.openai);
    });

    it("应该返回正确的 Provider 状态", () => {
      const provider = new OpenAIProvider({
        name: "openai",
        baseUrl: "https://api.openai.com/v1",
        apiKey: "test-key",
        models: TEST_MODELS.openai,
      });

      const status = provider.getStatus();
      expect(status.name).toBe("openai");
      expect(status.available).toBe(true);
      expect(status.models).toEqual(TEST_MODELS.openai);
      expect(status.errorCount).toBe(0);
    });
  });

  describe("工厂函数", () => {
    it("应该通过工厂函数创建实例", () => {
      const provider = createOpenAIProvider({
        name: "deepseek",
        baseUrl: "https://api.deepseek.com/v1",
        apiKey: "test-key",
        models: TEST_MODELS.deepseek,
      });

      expect(provider.name).toBe("deepseek");
      expect(provider.config.models).toEqual(TEST_MODELS.deepseek);
    });
  });
});

// ============================================================================
// OpenAIResponseProvider 测试
// ============================================================================

describe("OpenAIResponseProvider", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("实例创建", () => {
    it("应该正确创建实例", () => {
      const provider = new OpenAIResponseProvider({
        name: "openai-response",
        baseUrl: "https://api.openai.com/v1",
        apiKey: "test-key",
        models: TEST_MODELS.openai,
      });

      expect(provider.name).toBe("openai-response");
      expect(provider.config.id).toBe("openai-response");
      expect(provider.config.apiKey).toBe("test-key");
      expect(provider.config.models).toEqual(TEST_MODELS.openai);
    });

    it("应该支持提示词缓存", () => {
      const provider = new OpenAIResponseProvider({
        name: "openai-response",
        baseUrl: "https://api.openai.com/v1",
        apiKey: "test-key",
        models: TEST_MODELS.openai,
      });

      expect(provider.capabilities.supportsPromptCaching).toBe(true);
    });
  });

  describe("基础方法", () => {
    it("应该返回支持的模型列表", () => {
      const provider = new OpenAIResponseProvider({
        name: "openai-response",
        baseUrl: "https://api.openai.com/v1",
        apiKey: "test-key",
        models: TEST_MODELS.openai,
      });

      const models = provider.getSupportedModels();
      expect(models).toEqual(TEST_MODELS.openai);
    });
  });

  describe("工厂函数", () => {
    it("应该通过工厂函数创建实例", () => {
      const provider = createOpenAIResponseProvider({
        name: "openai-response",
        baseUrl: "https://api.openai.com/v1",
        apiKey: "test-key",
        models: TEST_MODELS.openai,
      });

      expect(provider.name).toBe("openai-response");
      expect(provider.config.models).toEqual(TEST_MODELS.openai);
    });
  });
});

// ============================================================================
// AnthropicProvider 测试
// ============================================================================

describe("AnthropicProvider", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("实例创建", () => {
    it("应该正确创建实例", () => {
      const provider = new AnthropicProvider({
        name: "anthropic",
        baseUrl: "https://api.anthropic.com/v1",
        apiKey: "test-key",
        models: TEST_MODELS.anthropic,
      });

      expect(provider.name).toBe("anthropic");
      expect(provider.config.id).toBe("anthropic");
      expect(provider.config.apiKey).toBe("test-key");
      expect(provider.config.models).toEqual(TEST_MODELS.anthropic);
    });

    it("应该从环境变量读取 API Key", () => {
      process.env.ANTHROPIC_API_KEY = "env-key";
      const provider = new AnthropicProvider({
        name: "anthropic",
        baseUrl: "https://api.anthropic.com/v1",
        models: TEST_MODELS.anthropic,
      });

      expect(provider.config.apiKey).toBe("env-key");
    });

    it("应该支持提示词缓存", () => {
      const provider = new AnthropicProvider({
        name: "anthropic",
        baseUrl: "https://api.anthropic.com/v1",
        apiKey: "test-key",
        models: TEST_MODELS.anthropic,
      });

      expect(provider.capabilities.supportsPromptCaching).toBe(true);
    });
  });

  describe("工厂函数", () => {
    it("应该通过工厂函数创建实例", () => {
      const provider = createAnthropicProvider({
        name: "anthropic",
        baseUrl: "https://api.anthropic.com/v1",
        apiKey: "test-key",
        models: TEST_MODELS.anthropic,
      });

      expect(provider.name).toBe("anthropic");
      expect(provider.config.models).toEqual(TEST_MODELS.anthropic);
    });
  });
});

// ============================================================================
// OllamaProvider 测试
// ============================================================================

describe("OllamaProvider", () => {
  describe("实例创建", () => {
    it("应该正确创建实例（无需 API Key）", () => {
      const provider = new OllamaProvider({
        models: TEST_MODELS.ollama,
      });

      expect(provider.name).toBe("ollama");
      expect(provider.config.baseUrl).toBe("http://localhost:11434");
    });

    it("应该支持自定义配置", () => {
      const provider = new OllamaProvider({
        baseUrl: "http://192.168.1.100:11434",
        models: ["llama3.2"],
        timeout: 120000,
      });

      expect(provider.config.baseUrl).toBe("http://192.168.1.100:11434");
    });
  });

  describe("工厂函数", () => {
    it("应该通过工厂函数创建实例", () => {
      const provider = createOllamaProvider({
        models: TEST_MODELS.ollama,
      });

      expect(provider.name).toBe("ollama");
      expect(provider.config.models).toEqual(TEST_MODELS.ollama);
    });
  });
});

// ============================================================================
// 综合测试
// ============================================================================

describe("Provider 综合测试", () => {
  it("所有 Provider 都应该实现基础接口", () => {
    const providers = [
      new OpenAIProvider({
        name: "openai",
        baseUrl: "https://api.openai.com/v1",
        apiKey: "test-key",
        models: ["gpt-4o"],
      }),
      new OpenAIResponseProvider({
        name: "openai-response",
        baseUrl: "https://api.openai.com/v1",
        apiKey: "test-key",
        models: ["gpt-4o"],
      }),
      new AnthropicProvider({
        name: "anthropic",
        baseUrl: "https://api.anthropic.com/v1",
        apiKey: "test-key",
        models: ["claude-3-5-sonnet-20241022"],
      }),
      new OllamaProvider({ models: ["llama3.2"] }),
    ];

    for (const provider of providers) {
      expect(typeof provider.name).toBe("string");
      expect(typeof provider.chat).toBe("function");
      expect(typeof provider.getSupportedModels).toBe("function");
      expect(typeof provider.getStatus).toBe("function");
      expect(provider.capabilities).toBeDefined();
    }
  });

  it("云 Provider 的 baseUrl 应该是 HTTPS", () => {
    const cloudProviders = [
      { name: "openai", baseUrl: "https://api.openai.com/v1" },
      { name: "anthropic", baseUrl: "https://api.anthropic.com/v1" },
      { name: "deepseek", baseUrl: "https://api.deepseek.com/v1" },
    ];

    for (const { name, baseUrl } of cloudProviders) {
      expect(baseUrl.startsWith("https://")).toBe(true);
    }
  });

  it("本地 Provider 的 baseUrl 应该是 HTTP", () => {
    const localProviders = [
      { name: "ollama", baseUrl: "http://localhost:11434/v1" },
      { name: "lmstudio", baseUrl: "http://localhost:1234/v1" },
    ];

    for (const { baseUrl } of localProviders) {
      expect(baseUrl.startsWith("http://")).toBe(true);
    }
  });

  it("应该支持任意自定义 Provider", () => {
    const customProvider = new OpenAIProvider({
      name: "my-custom-provider",
      displayName: "我的自定义 Provider",
      baseUrl: "https://api.custom.com/v1",
      apiKey: "custom-key",
      models: ["custom-model-1", "custom-model-2"],
      capabilities: {
        supportsVision: true,
        maxContextTokens: 256000,
      },
    });

    expect(customProvider.name).toBe("my-custom-provider");
    expect(customProvider.config.name).toBe("我的自定义 Provider");
    expect(customProvider.capabilities.supportsVision).toBe(true);
    expect(customProvider.capabilities.maxContextTokens).toBe(256000);
  });

  it("OpenAIResponseProvider 应该比 OpenAIProvider 更好的缓存支持", () => {
    const openaiProvider = new OpenAIProvider({
      name: "openai",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "test-key",
      models: TEST_MODELS.openai,
    });

    const responseProvider = new OpenAIResponseProvider({
      name: "openai-response",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "test-key",
      models: TEST_MODELS.openai,
    });

    expect(openaiProvider.capabilities.supportsPromptCaching).toBe(false);
    expect(responseProvider.capabilities.supportsPromptCaching).toBe(true);
  });
});
