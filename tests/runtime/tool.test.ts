/**
 * Tool 模块单元测试
 *
 * 测试 BaseTool 抽象类和 ToolRegistry 注册表
 */

import { test, expect, describe, beforeEach } from "bun:test";
import { BaseTool } from "../../microagent/runtime/src/tool/base.js";
import { ToolRegistry, TOOL_GROUPS } from "../../microagent/runtime/src/tool/registry.js";
import type { IToolExtended } from "../../microagent/runtime/src/tool/contract.js";
import type { ToolParameterSchema, ToolResult } from "../../microagent/runtime/src/tool/types.js";
import type { ITool } from "../../microagent/runtime/src/contracts.js";
import { RegistryError, ToolInputError } from "../../microagent/runtime/src/errors.js";

// ============================================================================
// 测试工具类
// ============================================================================

/**
 * 简单测试工具
 */
class SimpleTestTool extends BaseTool {
  readonly name = "simple_test";
  readonly description = "简单测试工具";
  readonly parameters: ToolParameterSchema = {
    type: "object",
    properties: {
      message: { type: "string", description: "消息内容" },
    },
  };

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const message = this.readStringParam(params, "message", { required: true });
    return { content: `处理: ${message}` };
  }
}

/**
 * 带多种参数类型的测试工具
 */
class MultiParamTestTool extends BaseTool<{
  text: string;
  count: number;
  enabled: boolean;
  items: string[];
  config: Record<string, unknown>;
}> {
  readonly name = "multi_param_test";
  readonly description = "多参数测试工具";
  readonly parameters: ToolParameterSchema = {
    type: "object",
    properties: {
      text: { type: "string" },
      count: { type: "number" },
      enabled: { type: "boolean" },
      items: { type: "array", items: { type: "string" } },
      config: { type: "object" },
    },
  };

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const text = this.readStringParam(params, "text", { defaultValue: "默认文本" });
    const count = this.readNumberParam(params, "count", { defaultValue: 0 });
    const enabled = this.readBooleanParam(params, "enabled", { defaultValue: false });
    const items = this.readArrayParam<string>(params, "items", { defaultValue: [] });
    const config = this.readObjectParam(params, "config", { defaultValue: {} });

    return {
      content: JSON.stringify({ text, count, enabled, items, config }),
    };
  }
}

/**
 * 返回错误的测试工具
 */
class ErrorTestTool extends BaseTool {
  readonly name = "error_test";
  readonly description = "错误测试工具";
  readonly parameters: ToolParameterSchema = { type: "object" };

  async execute(): Promise<ToolResult> {
    return { content: "操作失败", isError: true };
  }
}

/**
 * 抛出异常的测试工具
 */
class ThrowTestTool extends BaseTool {
  readonly name = "throw_test";
  readonly description = "抛出异常测试工具";
  readonly parameters: ToolParameterSchema = { type: "object" };

  async execute(): Promise<ToolResult> {
    throw new Error("工具执行异常");
  }
}

/**
 * 返回字符串的工具
 */
class StringResultTool extends BaseTool {
  readonly name = "string_result";
  readonly description = "返回字符串结果";
  readonly parameters: ToolParameterSchema = { type: "object" };

  async execute(): Promise<string> {
    return "纯字符串结果";
  }
}

// ============================================================================
// BaseTool 测试
// ============================================================================

describe("BaseTool", () => {
  describe("getDefinition", () => {
    test("应正确返回工具定义", () => {
      const tool = new SimpleTestTool();
      const definition = tool.getDefinition();

      expect(definition.name).toBe("simple_test");
      expect(definition.description).toBe("简单测试工具");
      expect(definition.parameters).toEqual({
        type: "object",
        properties: {
          message: { type: "string", description: "消息内容" },
        },
      });
    });
  });

  describe("readStringParam", () => {
    test("应正确读取字符串参数", () => {
      const tool = new SimpleTestTool();
      const result = tool["readStringParam"]({ name: "test" }, "name");
      expect(result).toBe("test");
    });

    test("参数不存在时应返回 undefined", () => {
      const tool = new SimpleTestTool();
      const result = tool["readStringParam"]({}, "missing");
      expect(result).toBeUndefined();
    });

    test("参数不存在时应返回默认值", () => {
      const tool = new SimpleTestTool();
      const result = tool["readStringParam"]({}, "missing", { defaultValue: "默认值" });
      expect(result).toBe("默认值");
    });

    test("必需参数缺失时应抛出错误", () => {
      const tool = new SimpleTestTool();
      expect(() => tool["readStringParam"]({}, "required", { required: true })).toThrow(
        '参数 "required" 是必需的'
      );
    });

    test("类型不匹配时应返回 undefined", () => {
      const tool = new SimpleTestTool();
      const result = tool["readStringParam"]({ name: 123 }, "name");
      expect(result).toBeUndefined();
    });
  });

  describe("readNumberParam", () => {
    test("应正确读取数字参数", () => {
      const tool = new MultiParamTestTool();
      const result = tool["readNumberParam"]({ count: 42 }, "count");
      expect(result).toBe(42);
    });

    test("参数不存在时应返回默认值", () => {
      const tool = new MultiParamTestTool();
      const result = tool["readNumberParam"]({}, "count", { defaultValue: 10 });
      expect(result).toBe(10);
    });

    test("必需参数缺失时应抛出错误", () => {
      const tool = new MultiParamTestTool();
      expect(() => tool["readNumberParam"]({}, "count", { required: true })).toThrow(
        '参数 "count" 是必需的'
      );
    });

    test("类型不匹配时应返回 undefined", () => {
      const tool = new MultiParamTestTool();
      const result = tool["readNumberParam"]({ count: "not a number" }, "count");
      expect(result).toBeUndefined();
    });
  });

  describe("readBooleanParam", () => {
    test("应正确读取布尔参数", () => {
      const tool = new MultiParamTestTool();
      const result = tool["readBooleanParam"]({ enabled: true }, "enabled");
      expect(result).toBe(true);
    });

    test("参数不存在时应返回默认值", () => {
      const tool = new MultiParamTestTool();
      const result = tool["readBooleanParam"]({}, "enabled", { defaultValue: true });
      expect(result).toBe(true);
    });

    test("参数不存在且无默认值时应返回 false", () => {
      const tool = new MultiParamTestTool();
      const result = tool["readBooleanParam"]({}, "enabled");
      expect(result).toBe(false);
    });

    test("类型不匹配时应返回默认值", () => {
      const tool = new MultiParamTestTool();
      const result = tool["readBooleanParam"]({ enabled: "yes" }, "enabled", {
        defaultValue: true,
      });
      expect(result).toBe(true);
    });
  });

  describe("readArrayParam", () => {
    test("应正确读取数组参数", () => {
      const tool = new MultiParamTestTool();
      const result = tool["readArrayParam"]({ items: ["a", "b", "c"] }, "items");
      expect(result).toEqual(["a", "b", "c"]);
    });

    test("参数不存在时应返回默认值", () => {
      const tool = new MultiParamTestTool();
      const result = tool["readArrayParam"]({}, "items", { defaultValue: ["default"] });
      expect(result).toEqual(["default"]);
    });

    test("必需参数缺失时应抛出错误", () => {
      const tool = new MultiParamTestTool();
      expect(() => tool["readArrayParam"]({}, "items", { required: true })).toThrow(
        '参数 "items" 是必需的'
      );
    });

    test("类型不匹配时应返回 undefined", () => {
      const tool = new MultiParamTestTool();
      const result = tool["readArrayParam"]({ items: "not an array" }, "items");
      expect(result).toBeUndefined();
    });
  });

  describe("readObjectParam", () => {
    test("应正确读取对象参数", () => {
      const tool = new MultiParamTestTool();
      const config = { key: "value" };
      const result = tool["readObjectParam"]({ config }, "config");
      expect(result).toEqual(config);
    });

    test("参数不存在时应返回默认值", () => {
      const tool = new MultiParamTestTool();
      const defaultConfig = { default: true };
      const result = tool["readObjectParam"]({}, "config", { defaultValue: defaultConfig });
      expect(result).toEqual(defaultConfig);
    });

    test("必需参数缺失时应抛出错误", () => {
      const tool = new MultiParamTestTool();
      expect(() => tool["readObjectParam"]({}, "config", { required: true })).toThrow(
        '参数 "config" 是必需的'
      );
    });

    test("数组不应被视为对象", () => {
      const tool = new MultiParamTestTool();
      const result = tool["readObjectParam"]({ config: [1, 2, 3] }, "config");
      expect(result).toBeUndefined();
    });

    test("null 不应被视为对象", () => {
      const tool = new MultiParamTestTool();
      const result = tool["readObjectParam"]({ config: null }, "config");
      expect(result).toBeUndefined();
    });
  });

  describe("execute - 多参数处理", () => {
    test("应正确处理所有参数类型", async () => {
      const tool = new MultiParamTestTool();
      const result = await tool.execute({
        text: "hello",
        count: 5,
        enabled: true,
        items: ["x", "y"],
        config: { nested: "value" },
      });

      expect(result.content).toBe(
        JSON.stringify({
          text: "hello",
          count: 5,
          enabled: true,
          items: ["x", "y"],
          config: { nested: "value" },
        })
      );
    });

    test("应使用默认值处理缺失参数", async () => {
      const tool = new MultiParamTestTool();
      const result = await tool.execute({});

      expect(result.content).toBe(
        JSON.stringify({
          text: "默认文本",
          count: 0,
          enabled: false,
          items: [],
          config: {},
        })
      );
    });
  });
});

// ============================================================================
// TOOL_GROUPS 常量测试
// ============================================================================

describe("TOOL_GROUPS 常量", () => {
  test("应包含 fs 工具组", () => {
    expect(TOOL_GROUPS["group:fs"]).toEqual(["read", "write", "edit"]);
  });

  test("应包含 shell 工具组", () => {
    expect(TOOL_GROUPS["group:shell"]).toEqual(["exec", "process"]);
  });

  test("应包含 web 工具组", () => {
    expect(TOOL_GROUPS["group:web"]).toEqual(["web_search", "web_fetch"]);
  });

  test("应包含 memory 工具组", () => {
    expect(TOOL_GROUPS["group:memory"]).toEqual(["memory_search", "memory_get"]);
  });
});

// ============================================================================
// ToolRegistry 测试
// ============================================================================

describe("ToolRegistry", () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  // ----------------------------------------------------------------------------
  // register 测试
  // ----------------------------------------------------------------------------

  describe("register", () => {
    test("应成功注册工具", () => {
      const tool = new SimpleTestTool();
      registry.register(tool);

      expect(registry.has("simple_test")).toBe(true);
    });

    test("重复注册相同工具应抛出 RegistryError", () => {
      const tool = new SimpleTestTool();
      registry.register(tool);

      expect(() => registry.register(tool)).toThrow(RegistryError);
    });

    test("重复注册应包含正确的错误信息", () => {
      const tool = new SimpleTestTool();
      registry.register(tool);

      try {
        registry.register(tool);
        expect.unreachable();
      } catch (error) {
        expect(error).toBeInstanceOf(RegistryError);
        const registryError = error as RegistryError;
        expect(registryError.itemType).toBe("Tool");
        expect(registryError.itemName).toBe("simple_test");
        expect(registryError.message).toContain("已存在");
      }
    });
  });

  // ----------------------------------------------------------------------------
  // registerFactory 测试
  // ----------------------------------------------------------------------------

  describe("registerFactory", () => {
    test("应成功注册工厂函数", () => {
      registry.registerFactory("lazy_tool", () => new SimpleTestTool());

      expect(registry.has("lazy_tool")).toBe(true);
    });

    test("工厂函数可以覆盖注册", () => {
      registry.registerFactory("lazy_tool", () => new SimpleTestTool());
      registry.registerFactory("lazy_tool", () => new MultiParamTestTool());

      expect(registry.has("lazy_tool")).toBe(true);
    });
  });

  // ----------------------------------------------------------------------------
  // get 测试
  // ----------------------------------------------------------------------------

  describe("get", () => {
    test("应返回已注册的工具", () => {
      const tool = new SimpleTestTool();
      registry.register(tool);

      const result = registry.get("simple_test");

      expect(result).toBe(tool);
    });

    test("未注册的工具应返回 undefined", () => {
      const result = registry.get("non_existent");

      expect(result).toBeUndefined();
    });

    test("工厂函数延迟创建工具", () => {
      const tool = new SimpleTestTool();
      registry.registerFactory("lazy_tool", () => tool);

      // 第一次获取，工厂创建
      const result1 = registry.get("lazy_tool");
      expect(result1).toBe(tool);

      // 第二次获取，返回已创建实例
      const result2 = registry.get("lazy_tool");
      expect(result2).toBe(tool);
    });

    test("工厂函数返回 null 时应返回 undefined", () => {
      registry.registerFactory("null_factory", () => null);

      const result = registry.get("null_factory");

      expect(result).toBeUndefined();
    });
  });

  // ----------------------------------------------------------------------------
  // has 测试
  // ----------------------------------------------------------------------------

  describe("has", () => {
    test("已注册工具应返回 true", () => {
      registry.register(new SimpleTestTool());

      expect(registry.has("simple_test")).toBe(true);
    });

    test("有工厂函数的工具应返回 true", () => {
      registry.registerFactory("lazy_tool", () => new SimpleTestTool());

      expect(registry.has("lazy_tool")).toBe(true);
    });

    test("未注册工具应返回 false", () => {
      expect(registry.has("non_existent")).toBe(false);
    });
  });

  // ----------------------------------------------------------------------------
  // list 测试
  // ----------------------------------------------------------------------------

  describe("list", () => {
    test("无策略时应返回所有工具", () => {
      registry.register(new SimpleTestTool());
      registry.register(new MultiParamTestTool());

      const tools = registry.list();

      expect(tools).toHaveLength(2);
      expect(tools.map((t) => t.name).sort()).toEqual(["multi_param_test", "simple_test"]);
    });

    test("空注册表应返回空数组", () => {
      const tools = registry.list();

      expect(tools).toEqual([]);
    });

    test("允许策略应过滤工具", () => {
      registry.register(new SimpleTestTool());
      registry.register(new MultiParamTestTool());

      const tools = registry.list({ allow: ["simple_test"] });

      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe("simple_test");
    });

    test("禁止策略应排除工具", () => {
      registry.register(new SimpleTestTool());
      registry.register(new MultiParamTestTool());

      const tools = registry.list({ deny: ["simple_test"] });

      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe("multi_param_test");
    });

    test("允许和禁止策略同时作用", () => {
      registry.register(new SimpleTestTool());
      registry.register(new MultiParamTestTool());
      registry.register(new ErrorTestTool());

      const tools = registry.list({
        allow: ["simple_test", "multi_param_test", "error_test"],
        deny: ["multi_param_test"],
      });

      expect(tools).toHaveLength(2);
      expect(tools.map((t) => t.name).sort()).toEqual(["error_test", "simple_test"]);
    });
  });

  // ----------------------------------------------------------------------------
  // 工具组展开测试
  // ----------------------------------------------------------------------------

  describe("工具组展开", () => {
    beforeEach(() => {
      // 注册与工具组匹配的测试工具
      const createTool = (name: string): ITool => ({
        name,
        description: `测试工具 ${name}`,
        getDefinition: () => ({ name, description: `测试工具 ${name}` }),
        execute: async () => `执行 ${name}`,
      });

      // 注册 fs 组工具
      for (const name of TOOL_GROUPS["group:fs"]) {
        registry.register(createTool(name));
      }

      // 注册 shell 组工具
      for (const name of TOOL_GROUPS["group:shell"]) {
        registry.register(createTool(name));
      }
    });

    test("group:fs 应展开为具体工具", () => {
      const tools = registry.list({ allow: ["group:fs"] });

      expect(tools).toHaveLength(3);
      expect(tools.map((t) => t.name).sort()).toEqual(["edit", "read", "write"]);
    });

    test("group:shell 应展开为具体工具", () => {
      const tools = registry.list({ allow: ["group:shell"] });

      expect(tools).toHaveLength(2);
      expect(tools.map((t) => t.name).sort()).toEqual(["exec", "process"]);
    });

    test("组展开与单独工具名混合使用", () => {
      const tools = registry.list({ allow: ["group:fs", "exec"] });

      expect(tools).toHaveLength(4);
      expect(tools.map((t) => t.name).sort()).toEqual(["edit", "exec", "read", "write"]);
    });

    test("不存在的组展开后为空数组，不进行过滤", () => {
      // 当 allow 只有不存在的组时，展开后为空数组
      // list() 方法在 allowed.length === 0 时不进行过滤
      const tools = registry.list({ allow: ["group:nonexistent"] });

      // 因此返回所有已注册的工具
      expect(tools).toHaveLength(5);
    });

    test("禁止策略中的组展开", () => {
      const tools = registry.list({ deny: ["group:fs"] });

      expect(tools).toHaveLength(2);
      expect(tools.map((t) => t.name).sort()).toEqual(["exec", "process"]);
    });
  });

  // ----------------------------------------------------------------------------
  // getDefinitions 测试
  // ----------------------------------------------------------------------------

  describe("getDefinitions", () => {
    test("应返回工具定义列表", () => {
      registry.register(new SimpleTestTool());
      registry.register(new MultiParamTestTool());

      const definitions = registry.getDefinitions();

      expect(definitions).toHaveLength(2);
      expect(definitions.map((d) => d.name).sort()).toEqual(["multi_param_test", "simple_test"]);
    });

    test("定义应包含完整的参数 schema", () => {
      registry.register(new SimpleTestTool());

      const definitions = registry.getDefinitions();

      expect(definitions[0].parameters).toEqual({
        type: "object",
        properties: {
          message: { type: "string", description: "消息内容" },
        },
      });
    });

    test("应支持策略过滤", () => {
      registry.register(new SimpleTestTool());
      registry.register(new MultiParamTestTool());

      const definitions = registry.getDefinitions({ allow: ["simple_test"] });

      expect(definitions).toHaveLength(1);
      expect(definitions[0].name).toBe("simple_test");
    });
  });

  // ----------------------------------------------------------------------------
  // execute 测试
  // ----------------------------------------------------------------------------

  describe("execute", () => {
    test("应成功执行工具并返回字符串结果", async () => {
      registry.register(new SimpleTestTool());

      const result = await registry.execute("simple_test", { message: "测试消息" });

      expect(result).toBe("处理: 测试消息");
    });

    test("工具不存在时应抛出 RegistryError", async () => {
      try {
        await registry.execute("non_existent", {});
        expect.unreachable();
      } catch (error) {
        expect(error).toBeInstanceOf(RegistryError);
        const registryError = error as RegistryError;
        expect(registryError.itemType).toBe("Tool");
        expect(registryError.itemName).toBe("non_existent");
      }
    });

    test("工具执行异常时应抛出 ToolInputError", async () => {
      registry.register(new ThrowTestTool());

      try {
        await registry.execute("throw_test", {});
        expect.unreachable();
      } catch (error) {
        expect(error).toBeInstanceOf(ToolInputError);
        const toolError = error as ToolInputError;
        expect(toolError.tool).toBe("throw_test");
        expect(toolError.message).toContain("工具执行异常");
      }
    });

    test("工具返回 isError 标记时应返回错误前缀", async () => {
      registry.register(new ErrorTestTool());

      const result = await registry.execute("error_test", {});

      expect(result).toBe("错误: 操作失败");
    });

    test("工具返回纯字符串时应直接返回", async () => {
      registry.register(new StringResultTool() as unknown as ITool);

      const result = await registry.execute("string_result", {});

      expect(result).toBe("纯字符串结果");
    });

    test("多参数工具应正确执行", async () => {
      registry.register(new MultiParamTestTool());

      const result = await registry.execute("multi_param_test", {
        text: "hello",
        count: 3,
        enabled: true,
        items: ["a", "b"],
        config: { key: "value" },
      });

      const parsed = JSON.parse(result);
      expect(parsed).toEqual({
        text: "hello",
        count: 3,
        enabled: true,
        items: ["a", "b"],
        config: { key: "value" },
      });
    });

    test("工厂创建的工具可以执行", async () => {
      registry.registerFactory("lazy_tool", () => new SimpleTestTool());

      const result = await registry.execute("lazy_tool", { message: "延迟加载" });

      expect(result).toBe("处理: 延迟加载");
    });
  });
});

// ============================================================================
// IRegistry 接口合规性测试
// ============================================================================

describe("ToolRegistry - IRegistry 接口合规性", () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  test("实现 IRegistry 基本方法", () => {
    const tool = new SimpleTestTool();

    // register
    registry.register(tool);
    expect(registry.has("simple_test")).toBe(true);

    // get
    expect(registry.get("simple_test")).toBe(tool);

    // list
    expect(registry.list()).toHaveLength(1);

    // has
    expect(registry.has("simple_test")).toBe(true);
    expect(registry.has("non_existent")).toBe(false);
  });
});
