/**
 * skill 模块单元测试
 *
 * 测试 Skill 类、BaseSkillLoader 抽象类、SkillRegistry 的功能
 */

import { test, expect, describe, beforeEach, mock } from "bun:test";
import { Skill, BaseSkillLoader } from "../../microagent/runtime/src/skill/loader.js";
import { SkillRegistry } from "../../microagent/runtime/src/skill/registry.js";
import type { ISkillExtended, ISkillLoaderExtended } from "../../microagent/runtime/src/skill/contract.js";
import type { SkillConfig, SkillSummary } from "../../microagent/runtime/src/skill/types.js";
import type { SkillMeta } from "../../microagent/runtime/src/types.js";
import { RegistryError } from "../../microagent/runtime/src/errors.js";

// ============================================================================
// 测试辅助函数和 Mock 实现
// ============================================================================

/**
 * 创建测试用的 Skill 配置
 */
function createSkillConfig(overrides: Partial<SkillConfig> = {}): SkillConfig {
  return {
    name: "test-skill",
    path: "/skills/test-skill.md",
    enabled: true,
    priority: 1,
    ...overrides,
  };
}

/**
 * 创建测试用的 Skill 元数据
 */
function createSkillMeta(overrides: Partial<SkillMeta> = {}): SkillMeta {
  return {
    name: "test-skill",
    description: "A test skill for unit testing",
    version: "1.0.0",
    ...overrides,
  };
}

/**
 * 可测试的 Skill 实现类
 * 重写 loadContent 方法以支持测试
 */
class TestableSkill extends Skill {
  private testContent: string | null = null;

  constructor(
    config: SkillConfig,
    meta: SkillMeta,
    initialContent?: string,
  ) {
    super(config, meta);
    this.testContent = initialContent ?? null;
  }

  /**
   * 设置测试内容
   */
  setContent(content: string): void {
    this.testContent = content;
  }

  /**
   * 加载 Skill 内容
   */
  override async loadContent(): Promise<string> {
    if (this.testContent) {
      return this.testContent;
    }
    return super.loadContent();
  }
}

/**
 * 可测试的 SkillLoader 实现类
 */
class TestableSkillLoader extends BaseSkillLoader {
  private skillList: ISkillExtended[] = [];
  private contentMap = new Map<string, string>();

  /**
   * 设置 Skill 列表
   */
  setSkills(skills: ISkillExtended[]): void {
    this.skillList = skills;
    for (const skill of skills) {
      this.registerSkill(skill);
    }
  }

  /**
   * 设置 Skill 内容
   */
  setSkillContent(name: string, content: string): void {
    this.contentMap.set(name, content);
  }

  /**
   * 列出所有可用 Skill
   */
  override async listSkills(): Promise<ISkillExtended[]> {
    return this.skillList;
  }

  /**
   * 加载指定 Skill 的内容
   */
  override async loadSkillContent(name: string): Promise<string | null> {
    return this.contentMap.get(name) ?? null;
  }
}

// ============================================================================
// Skill 类测试
// ============================================================================

describe("Skill 类测试", () => {
  describe("构造函数和属性", () => {
    test("应正确初始化 Skill 实例", () => {
      const config = createSkillConfig();
      const meta = createSkillMeta();
      const skill = new Skill(config, meta);

      expect(skill.config).toBe(config);
      expect(skill.meta).toBe(meta);
    });

    test("config 属性应为只读", () => {
      const config = createSkillConfig({ name: "immutable-config" });
      const meta = createSkillMeta();
      const skill = new Skill(config, meta);

      expect(skill.config.name).toBe("immutable-config");
    });

    test("meta 属性应为只读", () => {
      const config = createSkillConfig();
      const meta = createSkillMeta({ name: "immutable-meta", version: "2.0.0" });
      const skill = new Skill(config, meta);

      expect(skill.meta.name).toBe("immutable-meta");
      expect(skill.meta.version).toBe("2.0.0");
    });
  });

  describe("loaded 属性", () => {
    test("初始状态应为未加载", () => {
      const config = createSkillConfig();
      const meta = createSkillMeta();
      const skill = new Skill(config, meta);

      expect(skill.loaded).toBe(false);
    });

    test("loaded 属性基于内部 content 状态", () => {
      const config = createSkillConfig();
      const meta = createSkillMeta();
      const skill = new Skill(config, meta);

      // loaded 是只读属性，由内部 content 状态决定
      // 初始状态 content 为 null，所以 loaded 为 false
      expect(skill.loaded).toBe(false);
    });
  });

  describe("loadContent 方法", () => {
    test("未重写时应抛出错误", async () => {
      const config = createSkillConfig();
      const meta = createSkillMeta();
      const skill = new Skill(config, meta);

      await expect(skill.loadContent()).rejects.toThrow("Skill.loadContent 需要子类实现");
    });

    test("子类重写后应返回正确内容", async () => {
      const config = createSkillConfig();
      const meta = createSkillMeta();
      const skill = new TestableSkill(config, meta, "custom content");

      const content = await skill.loadContent();

      expect(content).toBe("custom content");
    });
  });

  describe("reload 方法", () => {
    test("应重新加载内容", async () => {
      const config = createSkillConfig();
      const meta = createSkillMeta();
      const skill = new TestableSkill(config, meta, "initial content");

      // 首次加载
      const firstContent = await skill.loadContent();
      expect(firstContent).toBe("initial content");

      // 修改内容
      skill.setContent("reloaded content");

      // 重新加载
      const reloadedContent = await skill.reload();

      expect(reloadedContent).toBe("reloaded content");
    });
  });

  describe("getSummary 方法", () => {
    test("应返回正确的 Skill 摘要", () => {
      const config = createSkillConfig();
      const meta = createSkillMeta({
        name: "coding-assistant",
        description: "Helps with coding tasks",
      });
      const skill = new Skill(config, meta);

      const summary = skill.getSummary();

      expect(summary.name).toBe("coding-assistant");
      expect(summary.description).toBe("Helps with coding tasks");
    });

    test("应包含标签信息", () => {
      const config = createSkillConfig();
      const meta = createSkillMeta({
        name: "multi-lang-skill",
        description: "Supports multiple languages",
        tags: ["typescript", "python", "go"],
      });
      const skill = new Skill(config, meta);

      const summary = skill.getSummary();

      expect(summary.tags).toEqual(["typescript", "python", "go"]);
    });

    test("无标签时不应包含 tags 字段", () => {
      const config = createSkillConfig();
      const meta = createSkillMeta({
        name: "simple-skill",
        description: "A simple skill",
      });
      const skill = new Skill(config, meta);

      const summary = skill.getSummary();

      expect(summary.tags).toBeUndefined();
    });

    test("空标签数组应返回空数组", () => {
      const config = createSkillConfig();
      const meta = createSkillMeta({
        name: "empty-tags-skill",
        description: "Skill with empty tags",
        tags: [],
      });
      const skill = new Skill(config, meta);

      const summary = skill.getSummary();

      expect(summary.tags).toEqual([]);
    });
  });
});

// ============================================================================
// BaseSkillLoader 抽象类测试
// ============================================================================

describe("BaseSkillLoader 抽象类测试", () => {
  describe("getSkill 方法", () => {
    test("应返回已注册的 Skill", () => {
      const loader = new TestableSkillLoader();
      const config = createSkillConfig({ name: "registered-skill" });
      const meta = createSkillMeta({ name: "registered-skill" });
      const skill = new TestableSkill(config, meta, "content");

      loader.setSkills([skill]);

      const result = loader.getSkill("registered-skill");

      expect(result).toBe(skill);
    });

    test("未注册的 Skill 应返回 undefined", () => {
      const loader = new TestableSkillLoader();

      const result = loader.getSkill("non-existent");

      expect(result).toBeUndefined();
    });
  });

  describe("buildSkillsSummary 方法", () => {
    test("无 Skill 时应返回空字符串", async () => {
      const loader = new TestableSkillLoader();
      loader.setSkills([]);

      const summary = await loader.buildSkillsSummary();

      expect(summary).toBe("");
    });

    test("应正确生成单个 Skill 的摘要", async () => {
      const loader = new TestableSkillLoader();
      const config = createSkillConfig({ name: "single-skill" });
      const meta = createSkillMeta({
        name: "single-skill",
        description: "A single skill",
      });
      const skill = new TestableSkill(config, meta, "content");

      loader.setSkills([skill]);

      const summary = await loader.buildSkillsSummary();

      expect(summary).toContain("<skills>");
      expect(summary).toContain("</skills>");
      expect(summary).toContain("- single-skill: A single skill");
    });

    test("应正确生成多个 Skill 的摘要", async () => {
      const loader = new TestableSkillLoader();

      const skill1 = new TestableSkill(
        createSkillConfig({ name: "skill-1" }),
        createSkillMeta({ name: "skill-1", description: "First skill" }),
        "content1",
      );

      const skill2 = new TestableSkill(
        createSkillConfig({ name: "skill-2" }),
        createSkillMeta({ name: "skill-2", description: "Second skill" }),
        "content2",
      );

      loader.setSkills([skill1, skill2]);

      const summary = await loader.buildSkillsSummary();

      expect(summary).toContain("- skill-1: First skill");
      expect(summary).toContain("- skill-2: Second skill");
    });

    test("摘要应包含标签信息", async () => {
      const loader = new TestableSkillLoader();
      const config = createSkillConfig({ name: "tagged-skill" });
      const meta = createSkillMeta({
        name: "tagged-skill",
        description: "A skill with tags",
        tags: ["ai", "assistant"],
      });
      const skill = new TestableSkill(config, meta, "content");

      loader.setSkills([skill]);

      const summary = await loader.buildSkillsSummary();

      expect(summary).toContain("[ai, assistant]");
    });

    test("应正确格式化输出", async () => {
      const loader = new TestableSkillLoader();
      const config = createSkillConfig({ name: "format-skill" });
      const meta = createSkillMeta({
        name: "format-skill",
        description: "Testing format",
        tags: ["test"],
      });
      const skill = new TestableSkill(config, meta, "content");

      loader.setSkills([skill]);

      const summary = await loader.buildSkillsSummary();

      // 验证格式：每行一个 Skill
      const lines = summary.split("\n");
      expect(lines[0]).toBe("<skills>");
      expect(lines[lines.length - 1]).toBe("</skills>");
      expect(lines[1]).toBe("- format-skill: Testing format [test]");
    });
  });

  describe("registerSkill 方法", () => {
    test("应正确注册 Skill", () => {
      const loader = new TestableSkillLoader();
      const config = createSkillConfig({ name: "new-skill" });
      const meta = createSkillMeta({ name: "new-skill" });
      const skill = new TestableSkill(config, meta, "content");

      loader.setSkills([skill]);

      expect(loader.getSkill("new-skill")).toBe(skill);
    });

    test("重复注册应覆盖之前的 Skill", () => {
      const loader = new TestableSkillLoader();

      const skill1 = new TestableSkill(
        createSkillConfig({ name: "duplicate" }),
        createSkillMeta({ name: "duplicate", description: "First" }),
        "content1",
      );

      const skill2 = new TestableSkill(
        createSkillConfig({ name: "duplicate" }),
        createSkillMeta({ name: "duplicate", description: "Second" }),
        "content2",
      );

      loader.setSkills([skill1]);
      loader.setSkills([skill2]);

      const result = loader.getSkill("duplicate");
      expect(result?.meta.description).toBe("Second");
    });
  });
});

// ============================================================================
// SkillRegistry 测试
// ============================================================================

describe("SkillRegistry 测试", () => {
  let registry: SkillRegistry;

  beforeEach(() => {
    registry = new SkillRegistry();
  });

  describe("register 方法", () => {
    test("应正确注册 Skill", () => {
      const config = createSkillConfig({ name: "registry-skill" });
      const meta = createSkillMeta({ name: "registry-skill" });
      const skill = new TestableSkill(config, meta, "content");

      registry.register(skill);

      expect(registry.has("registry-skill")).toBe(true);
      expect(registry.get("registry-skill")).toBe(skill);
    });

    test("重复注册应抛出 RegistryError", () => {
      const skill1 = new TestableSkill(
        createSkillConfig({ name: "duplicate-skill" }),
        createSkillMeta({ name: "duplicate-skill" }),
        "content1",
      );

      registry.register(skill1);

      const skill2 = new TestableSkill(
        createSkillConfig({ name: "duplicate-skill" }),
        createSkillMeta({ name: "duplicate-skill" }),
        "content2",
      );

      expect(() => registry.register(skill2)).toThrow(RegistryError);
    });

    test("重复注册的错误信息应包含 Skill 名称", () => {
      const skill1 = new TestableSkill(
        createSkillConfig({ name: "error-skill" }),
        createSkillMeta({ name: "error-skill" }),
        "content",
      );

      registry.register(skill1);

      const skill2 = new TestableSkill(
        createSkillConfig({ name: "error-skill" }),
        createSkillMeta({ name: "error-skill" }),
        "content2",
      );

      try {
        registry.register(skill2);
        expect.fail("Should throw error");
      } catch (error) {
        expect(error).toBeInstanceOf(RegistryError);
        expect((error as RegistryError).itemType).toBe("Skill");
        expect((error as RegistryError).itemName).toBe("error-skill");
      }
    });
  });

  describe("get 方法", () => {
    test("应返回已注册的 Skill", () => {
      const skill = new TestableSkill(
        createSkillConfig({ name: "get-skill" }),
        createSkillMeta({ name: "get-skill" }),
        "content",
      );

      registry.register(skill);

      const result = registry.get("get-skill");

      expect(result).toBe(skill);
    });

    test("未注册的 Skill 应返回 undefined", () => {
      const result = registry.get("non-existent");

      expect(result).toBeUndefined();
    });
  });

  describe("list 方法", () => {
    test("空注册表应返回空数组", () => {
      const result = registry.list();

      expect(result).toEqual([]);
    });

    test("应返回所有已注册的 Skill", () => {
      const skill1 = new TestableSkill(
        createSkillConfig({ name: "list-1" }),
        createSkillMeta({ name: "list-1" }),
        "content1",
      );
      const skill2 = new TestableSkill(
        createSkillConfig({ name: "list-2" }),
        createSkillMeta({ name: "list-2" }),
        "content2",
      );
      const skill3 = new TestableSkill(
        createSkillConfig({ name: "list-3" }),
        createSkillMeta({ name: "list-3" }),
        "content3",
      );

      registry.register(skill1);
      registry.register(skill2);
      registry.register(skill3);

      const result = registry.list();

      expect(result).toHaveLength(3);
      expect(result).toContain(skill1);
      expect(result).toContain(skill2);
      expect(result).toContain(skill3);
    });
  });

  describe("has 方法", () => {
    test("已注册应返回 true", () => {
      const skill = new TestableSkill(
        createSkillConfig({ name: "has-skill" }),
        createSkillMeta({ name: "has-skill" }),
        "content",
      );

      registry.register(skill);

      expect(registry.has("has-skill")).toBe(true);
    });

    test("未注册应返回 false", () => {
      expect(registry.has("non-existent")).toBe(false);
    });
  });

  describe("registerLoader 方法", () => {
    test("应正确注册加载器函数", () => {
      const loader = mock(async (): Promise<ISkillExtended[]> => []);

      registry.registerLoader(loader);

      // 加载器应在 loadAll 时被调用
      expect(loader).not.toHaveBeenCalled();
    });
  });

  describe("loadAll 方法", () => {
    test("应执行所有注册的加载器", async () => {
      const loader1 = mock(async (): Promise<ISkillExtended[]> => []);
      const loader2 = mock(async (): Promise<ISkillExtended[]> => []);

      registry.registerLoader(loader1);
      registry.registerLoader(loader2);

      await registry.loadAll();

      expect(loader1).toHaveBeenCalled();
      expect(loader2).toHaveBeenCalled();
    });

    test("应将加载器返回的 Skill 注册到注册表", async () => {
      const skill1 = new TestableSkill(
        createSkillConfig({ name: "loaded-1" }),
        createSkillMeta({ name: "loaded-1" }),
        "content1",
      );
      const skill2 = new TestableSkill(
        createSkillConfig({ name: "loaded-2" }),
        createSkillMeta({ name: "loaded-2" }),
        "content2",
      );

      registry.registerLoader(async () => [skill1, skill2]);

      await registry.loadAll();

      expect(registry.has("loaded-1")).toBe(true);
      expect(registry.has("loaded-2")).toBe(true);
      expect(registry.list()).toHaveLength(2);
    });

    test("多个加载器应按顺序执行", async () => {
      const executionOrder: string[] = [];

      registry.registerLoader(async () => {
        executionOrder.push("first");
        return [];
      });

      registry.registerLoader(async () => {
        executionOrder.push("second");
        return [];
      });

      await registry.loadAll();

      expect(executionOrder).toEqual(["first", "second"]);
    });

    test("加载器尝试注册重复 Skill 应抛出错误", async () => {
      const skill = new TestableSkill(
        createSkillConfig({ name: "duplicate" }),
        createSkillMeta({ name: "duplicate" }),
        "content",
      );

      // 手动注册
      registry.register(skill);

      // 加载器也尝试注册同名 Skill
      registry.registerLoader(async () => [
        new TestableSkill(
          createSkillConfig({ name: "duplicate" }),
          createSkillMeta({ name: "duplicate" }),
          "content2",
        ),
      ]);

      await expect(registry.loadAll()).rejects.toThrow(RegistryError);
    });
  });
});

// ============================================================================
// 接口类型兼容性测试
// ============================================================================

describe("接口类型兼容性测试", () => {
  test("Skill 应实现 ISkillExtended 接口", () => {
    const config = createSkillConfig();
    const meta = createSkillMeta();
    const skill: ISkillExtended = new TestableSkill(config, meta, "content");

    expect(skill.config).toBeDefined();
    expect(skill.meta).toBeDefined();
    expect(skill.loaded).toBeDefined();
    expect(typeof skill.loadContent).toBe("function");
    expect(typeof skill.reload).toBe("function");
    expect(typeof skill.getSummary).toBe("function");
  });

  test("BaseSkillLoader 应实现 ISkillLoaderExtended 接口", () => {
    const loader: ISkillLoaderExtended = new TestableSkillLoader();

    expect(typeof loader.listSkills).toBe("function");
    expect(typeof loader.loadSkillContent).toBe("function");
    expect(typeof loader.getSkill).toBe("function");
    expect(typeof loader.buildSkillsSummary).toBe("function");
  });

  test("getSummary 返回值应符合 SkillSummary 接口", () => {
    const config = createSkillConfig();
    const meta = createSkillMeta({
      name: "type-check-skill",
      description: "Type checking",
      tags: ["test"],
    });
    const skill = new TestableSkill(config, meta, "content");

    const summary: SkillSummary = skill.getSummary();

    expect(typeof summary.name).toBe("string");
    expect(typeof summary.description).toBe("string");
    expect(Array.isArray(summary.tags)).toBe(true);
  });
});

// ============================================================================
// 边界情况测试
// ============================================================================

describe("边界情况测试", () => {
  describe("Skill 边界情况", () => {
    test("空描述应正常处理", () => {
      const config = createSkillConfig();
      const meta = createSkillMeta({ description: "" });
      const skill = new TestableSkill(config, meta, "content");

      const summary = skill.getSummary();

      expect(summary.description).toBe("");
    });

    test("特殊字符名称应正常处理", () => {
      const config = createSkillConfig({ name: "skill-with-special_chars.123" });
      const meta = createSkillMeta({ name: "skill-with-special_chars.123" });
      const skill = new TestableSkill(config, meta, "content");

      expect(skill.config.name).toBe("skill-with-special_chars.123");
      expect(skill.meta.name).toBe("skill-with-special_chars.123");
    });
  });

  describe("SkillRegistry 边界情况", () => {
    test("空名称应正常处理", () => {
      const registry = new SkillRegistry();
      const skill = new TestableSkill(
        createSkillConfig({ name: "" }),
        createSkillMeta({ name: "" }),
        "content",
      );

      registry.register(skill);

      expect(registry.has("")).toBe(true);
    });

    test("大量 Skill 注册应正常工作", () => {
      const registry = new SkillRegistry();
      const count = 100;

      for (let i = 0; i < count; i++) {
        const skill = new TestableSkill(
          createSkillConfig({ name: `bulk-skill-${i}` }),
          createSkillMeta({ name: `bulk-skill-${i}` }),
          `content-${i}`,
        );
        registry.register(skill);
      }

      expect(registry.list()).toHaveLength(count);
    });
  });

  describe("BaseSkillLoader 边界情况", () => {
    test("大量 Skill 摘要生成应正常工作", async () => {
      const loader = new TestableSkillLoader();
      const skills: ISkillExtended[] = [];

      for (let i = 0; i < 50; i++) {
        skills.push(
          new TestableSkill(
            createSkillConfig({ name: `bulk-skill-${i}` }),
            createSkillMeta({
              name: `bulk-skill-${i}`,
              description: `Description ${i}`,
              tags: [`tag-${i}`],
            }),
            `content-${i}`,
          ),
        );
      }

      loader.setSkills(skills);

      const summary = await loader.buildSkillsSummary();

      expect(summary).toContain("<skills>");
      expect(summary).toContain("</skills>");
      // 验证包含部分 Skill
      expect(summary).toContain("bulk-skill-0:");
      expect(summary).toContain("bulk-skill-49:");
    });
  });
});
