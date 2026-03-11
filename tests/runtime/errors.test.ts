/**
 * errors.ts 单元测试
 * 测试所有错误类的创建、属性和继承关系
 */

import { test, expect, describe } from "bun:test";
import {
  MicroAgentError,
  ProviderError,
  ToolError,
  ToolInputError,
  ChannelError,
  ConfigError,
  SessionError,
  MemoryError,
  TimeoutError,
  MaxIterationsError,
  RegistryError,
} from "../../microagent/runtime/src/errors";

describe("MicroAgentError", () => {
  test("创建基础错误实例", () => {
    const error = new MicroAgentError("测试错误消息", "TEST_CODE");

    expect(error.message).toBe("测试错误消息");
    expect(error.code).toBe("TEST_CODE");
    expect(error.name).toBe("MicroAgentError");
  });

  test("继承自 Error", () => {
    const error = new MicroAgentError("测试", "CODE");

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(MicroAgentError);
  });

  test("可以正确抛出和捕获", () => {
    expect(() => {
      throw new MicroAgentError("抛出测试", "THROW_CODE");
    }).toThrow(MicroAgentError);
  });
});

describe("ProviderError", () => {
  test("创建 Provider 错误实例", () => {
    const error = new ProviderError("Provider 连接失败", "OpenAI");

    expect(error.message).toBe("Provider 连接失败");
    expect(error.code).toBe("PROVIDER_ERROR");
    expect(error.name).toBe("ProviderError");
    expect(error.provider).toBe("OpenAI");
    expect(error.cause).toBeUndefined();
  });

  test("带 cause 参数创建", () => {
    const cause = new Error("底层连接错误");
    const error = new ProviderError("Provider 错误", "Anthropic", cause);

    expect(error.provider).toBe("Anthropic");
    expect(error.cause).toBe(cause);
    expect(error.cause?.message).toBe("底层连接错误");
  });

  test("继承自 MicroAgentError", () => {
    const error = new ProviderError("测试", "Provider");

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(MicroAgentError);
    expect(error).toBeInstanceOf(ProviderError);
  });
});

describe("ToolError", () => {
  test("创建工具错误实例", () => {
    const error = new ToolError("工具执行失败", "searchTool");

    expect(error.message).toBe("工具执行失败");
    expect(error.code).toBe("TOOL_ERROR");
    expect(error.name).toBe("ToolError");
    expect(error.tool).toBe("searchTool");
    expect(error.cause).toBeUndefined();
  });

  test("带 cause 参数创建", () => {
    const cause = new Error("参数解析错误");
    const error = new ToolError("工具错误", "calcTool", cause);

    expect(error.tool).toBe("calcTool");
    expect(error.cause).toBe(cause);
  });

  test("继承自 MicroAgentError", () => {
    const error = new ToolError("测试", "tool");

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(MicroAgentError);
    expect(error).toBeInstanceOf(ToolError);
  });
});

describe("ToolInputError", () => {
  test("创建工具参数错误实例", () => {
    const error = new ToolInputError("参数验证失败", "validateTool");

    expect(error.message).toBe("参数验证失败");
    expect(error.name).toBe("ToolInputError");
    expect(error.tool).toBe("validateTool");
  });

  test("继承自 ToolError 和 MicroAgentError", () => {
    const error = new ToolInputError("测试", "tool");

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(MicroAgentError);
    expect(error).toBeInstanceOf(ToolError);
    expect(error).toBeInstanceOf(ToolInputError);
  });

  test("继承 ToolError 的 code 属性", () => {
    const error = new ToolInputError("测试", "tool");

    // ToolInputError 继承 ToolError，ToolError 的 code 是 "TOOL_ERROR"
    expect(error.code).toBe("TOOL_ERROR");
  });
});

describe("ChannelError", () => {
  test("创建通道错误实例", () => {
    const error = new ChannelError("通道连接失败", "mainChannel");

    expect(error.message).toBe("通道连接失败");
    expect(error.code).toBe("CHANNEL_ERROR");
    expect(error.name).toBe("ChannelError");
    expect(error.channel).toBe("mainChannel");
    expect(error.cause).toBeUndefined();
  });

  test("带 cause 参数创建", () => {
    const cause = new Error("网络中断");
    const error = new ChannelError("通道错误", "eventChannel", cause);

    expect(error.channel).toBe("eventChannel");
    expect(error.cause).toBe(cause);
  });

  test("继承自 MicroAgentError", () => {
    const error = new ChannelError("测试", "channel");

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(MicroAgentError);
    expect(error).toBeInstanceOf(ChannelError);
  });
});

describe("ConfigError", () => {
  test("创建配置错误实例（无 field）", () => {
    const error = new ConfigError("配置加载失败");

    expect(error.message).toBe("配置加载失败");
    expect(error.code).toBe("CONFIG_ERROR");
    expect(error.name).toBe("ConfigError");
    expect(error.field).toBeUndefined();
  });

  test("创建配置错误实例（带 field）", () => {
    const error = new ConfigError("配置项缺失", "apiKey");

    expect(error.message).toBe("配置项缺失");
    expect(error.field).toBe("apiKey");
  });

  test("继承自 MicroAgentError", () => {
    const error = new ConfigError("测试");

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(MicroAgentError);
    expect(error).toBeInstanceOf(ConfigError);
  });
});

describe("SessionError", () => {
  test("创建会话错误实例", () => {
    const error = new SessionError("会话已过期", "session-123");

    expect(error.message).toBe("会话已过期");
    expect(error.code).toBe("SESSION_ERROR");
    expect(error.name).toBe("SessionError");
    expect(error.sessionKey).toBe("session-123");
  });

  test("继承自 MicroAgentError", () => {
    const error = new SessionError("测试", "key");

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(MicroAgentError);
    expect(error).toBeInstanceOf(SessionError);
  });
});

describe("MemoryError", () => {
  test("创建内存错误实例（无 cause）", () => {
    const error = new MemoryError("内存读取失败");

    expect(error.message).toBe("内存读取失败");
    expect(error.code).toBe("MEMORY_ERROR");
    expect(error.name).toBe("MemoryError");
    expect(error.cause).toBeUndefined();
  });

  test("创建内存错误实例（带 cause）", () => {
    const cause = new Error("存储溢出");
    const error = new MemoryError("内存错误", cause);

    expect(error.cause).toBe(cause);
  });

  test("继承自 MicroAgentError", () => {
    const error = new MemoryError("测试");

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(MicroAgentError);
    expect(error).toBeInstanceOf(MemoryError);
  });
});

describe("TimeoutError", () => {
  test("创建超时错误实例", () => {
    const error = new TimeoutError("操作超时", 5000);

    expect(error.message).toBe("操作超时");
    expect(error.code).toBe("TIMEOUT_ERROR");
    expect(error.name).toBe("TimeoutError");
    expect(error.timeoutMs).toBe(5000);
  });

  test("继承自 MicroAgentError", () => {
    const error = new TimeoutError("测试", 1000);

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(MicroAgentError);
    expect(error).toBeInstanceOf(TimeoutError);
  });
});

describe("MaxIterationsError", () => {
  test("创建迭代超限错误实例", () => {
    const error = new MaxIterationsError(100);

    expect(error.message).toBe("达到最大迭代次数: 100");
    expect(error.code).toBe("MAX_ITERATIONS_ERROR");
    expect(error.name).toBe("MaxIterationsError");
  });

  test("不同迭代次数生成不同消息", () => {
    const error1 = new MaxIterationsError(50);
    const error2 = new MaxIterationsError(200);

    expect(error1.message).toBe("达到最大迭代次数: 50");
    expect(error2.message).toBe("达到最大迭代次数: 200");
  });

  test("继承自 MicroAgentError", () => {
    const error = new MaxIterationsError(10);

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(MicroAgentError);
    expect(error).toBeInstanceOf(MaxIterationsError);
  });
});

describe("RegistryError", () => {
  test("创建注册表错误实例", () => {
    const error = new RegistryError("注册失败", "tool", "searchTool");

    expect(error.message).toBe("注册失败");
    expect(error.code).toBe("REGISTRY_ERROR");
    expect(error.name).toBe("RegistryError");
    expect(error.itemType).toBe("tool");
    expect(error.itemName).toBe("searchTool");
  });

  test("继承自 MicroAgentError", () => {
    const error = new RegistryError("测试", "type", "name");

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(MicroAgentError);
    expect(error).toBeInstanceOf(RegistryError);
  });
});

describe("错误继承关系综合测试", () => {
  test("所有错误类都继承自 MicroAgentError", () => {
    const errors = [
      new ProviderError("测试", "p"),
      new ToolError("测试", "t"),
      new ToolInputError("测试", "t"),
      new ChannelError("测试", "c"),
      new ConfigError("测试"),
      new SessionError("测试", "s"),
      new MemoryError("测试"),
      new TimeoutError("测试", 1000),
      new MaxIterationsError(10),
      new RegistryError("测试", "type", "name"),
    ];

    for (const error of errors) {
      expect(error).toBeInstanceOf(MicroAgentError);
      expect(error).toBeInstanceOf(Error);
    }
  });

  test("所有错误都有 name 属性", () => {
    const errorNames = [
      { error: new ProviderError("测试", "p"), expectedName: "ProviderError" },
      { error: new ToolError("测试", "t"), expectedName: "ToolError" },
      { error: new ToolInputError("测试", "t"), expectedName: "ToolInputError" },
      { error: new ChannelError("测试", "c"), expectedName: "ChannelError" },
      { error: new ConfigError("测试"), expectedName: "ConfigError" },
      { error: new SessionError("测试", "s"), expectedName: "SessionError" },
      { error: new MemoryError("测试"), expectedName: "MemoryError" },
      { error: new TimeoutError("测试", 1000), expectedName: "TimeoutError" },
      { error: new MaxIterationsError(10), expectedName: "MaxIterationsError" },
      { error: new RegistryError("测试", "type", "name"), expectedName: "RegistryError" },
    ];

    for (const { error, expectedName } of errorNames) {
      expect(error.name).toBe(expectedName);
    }
  });

  test("错误可以被正确抛出和捕获", () => {
    // 测试 ProviderError
    expect(() => throwProviderError()).toThrow(ProviderError);
    expect(() => throwProviderError()).toThrow("Provider 失败");

    // 测试 ToolError
    expect(() => throwToolError()).toThrow(ToolError);

    // 测试 TimeoutError
    expect(() => throwTimeoutError()).toThrow(TimeoutError);

    // 测试 MaxIterationsError
    expect(() => throwMaxIterationsError()).toThrow(MaxIterationsError);
  });
});

// 辅助函数：用于测试错误抛出
function throwProviderError(): never {
  throw new ProviderError("Provider 失败", "testProvider");
}

function throwToolError(): never {
  throw new ToolError("Tool 失败", "testTool");
}

function throwTimeoutError(): never {
  throw new TimeoutError("操作超时", 3000);
}

function throwMaxIterationsError(): never {
  throw new MaxIterationsError(100);
}
