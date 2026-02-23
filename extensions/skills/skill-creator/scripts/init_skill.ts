#!/usr/bin/env bun
/**
 * Skill Initializer - Creates a new skill from template
 *
 * Usage:
 *   bun init_skill.ts <skill-name> --path <path> [--resources scripts,references,assets] [--examples]
 *
 * Examples:
 *   bun init_skill.ts my-new-skill --path skills/public
 *   bun init_skill.ts my-new-skill --path skills/public --resources scripts,references
 *   bun init_skill.ts my-api-helper --path skills/private --resources scripts --examples
 */

import { parseArgs } from "node:util";
import { mkdir, writeFile, chmod } from "node:fs/promises";
import { resolve, basename } from "node:path";

const MAX_SKILL_NAME_LENGTH = 64;
const ALLOWED_RESOURCES = new Set(["scripts", "references", "assets"]);

const SKILL_TEMPLATE = `---
name: {skill_name}
description: [TODO: 完整描述技能的功能和使用场景。包含 WHEN - 特定场景、文件类型或触发任务。]
---

# {skill_title}

## 概述

[TODO: 1-2 句话说明此技能的功能]

## 结构设计

[TODO: 选择最适合此技能的结构。常见模式：

**1. 工作流导向** (适合顺序流程)
- 适合清晰的分步流程
- 结构: ## 概述 -> ## 工作流 -> ## 步骤1 -> ## 步骤2...

**2. 任务导向** (适合工具集合)
- 适合提供不同操作/能力
- 结构: ## 概述 -> ## 快速开始 -> ## 任务类别1 -> ## 任务类别2...

**3. 参考/规范** (适合标准或规格)
- 适合品牌指南、编码规范或需求
- 结构: ## 概述 -> ## 规范 -> ## 规格 -> ## 用法...

删除此"结构设计"部分 - 仅作指导用。]

## [TODO: 根据选择的结构替换为第一个主要部分]

[TODO: 在此添加内容。参考现有技能：
- 技术技能的代码示例
- 复杂工作流的决策树
- 实际用户请求的具体示例
- 按需引用 scripts/templates/references]

## 资源 (可选)

仅创建此技能实际需要的资源目录。如无需要可删除此部分。

### scripts/
可执行代码 (TypeScript/JavaScript/Bash 等)，可直接运行执行特定操作。

### references/
文档和参考材料，按需加载到上下文中。

### assets/
不加载到上下文，而是用于输出产出的文件。

---

**并非每个技能都需要所有三种资源。**
`;

const EXAMPLE_SCRIPT = `#!/usr/bin/env bun
/**
 * {skill_name} 示例辅助脚本
 *
 * 这是一个可直接执行的占位脚本。
 * 根据实际需求替换或删除。
 */

export async function main() {
  console.log("这是 {skill_name} 的示例脚本");
  // TODO: 在此添加实际脚本逻辑
}

main().catch(console.error);
`;

const EXAMPLE_REFERENCE = `# {skill_title} 参考文档

这是详细参考文档的占位符。
根据实际需求替换或删除。

## 何时使用参考文档

参考文档适合：
- 完整的 API 文档
- 详细的工作流指南
- 复杂的多步骤流程
`;

const EXAMPLE_ASSET = `# 示例资源文件

此占位符表示资源文件的存储位置。
根据实际需求替换为真实资源文件或删除。
`;

function normalizeSkillName(skillName: string): string {
  let normalized = skillName.trim().toLowerCase();
  normalized = normalized.replace(/[^a-z0-9]+/g, "-");
  normalized = normalized.replace(/^-+|-+$/g, "");
  normalized = normalized.replace(/-{2,}/g, "-");
  return normalized;
}

function titleCaseSkillName(skillName: string): string {
  return skillName
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function parseResources(rawResources: string): string[] {
  if (!rawResources) return [];
  const resources = rawResources
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item);

  const invalid = resources.filter((item) => !ALLOWED_RESOURCES.has(item));
  if (invalid.length > 0) {
    console.error(`[错误] 未知资源类型: ${invalid.join(", ")}`);
    console.error(`   允许: ${[...ALLOWED_RESOURCES].sort().join(", ")}`);
    process.exit(1);
  }

  return [...new Set(resources)];
}

async function createResourceDirs(
  skillDir: string,
  skillName: string,
  skillTitle: string,
  resources: string[],
  includeExamples: boolean
): Promise<void> {
  for (const resource of resources) {
    const resourceDir = resolve(skillDir, resource);
    await mkdir(resourceDir, { recursive: true });

    if (resource === "scripts") {
      if (includeExamples) {
        const exampleScript = resolve(resourceDir, "example.ts");
        await writeFile(exampleScript, EXAMPLE_SCRIPT.replace(/{skill_name}/g, skillName));
        console.log("[OK] 创建 scripts/example.ts");
      } else {
        console.log("[OK] 创建 scripts/");
      }
    } else if (resource === "references") {
      if (includeExamples) {
        const exampleRef = resolve(resourceDir, "api_reference.md");
        await writeFile(exampleRef, EXAMPLE_REFERENCE.replace(/{skill_title}/g, skillTitle));
        console.log("[OK] 创建 references/api_reference.md");
      } else {
        console.log("[OK] 创建 references/");
      }
    } else if (resource === "assets") {
      if (includeExamples) {
        const exampleAsset = resolve(resourceDir, "example_asset.txt");
        await writeFile(exampleAsset, EXAMPLE_ASSET);
        console.log("[OK] 创建 assets/example_asset.txt");
      } else {
        console.log("[OK] 创建 assets/");
      }
    }
  }
}

async function initSkill(
  skillName: string,
  path: string,
  resources: string[],
  includeExamples: boolean
): Promise<string | null> {
  const skillDir = resolve(path, skillName);

  try {
    await mkdir(skillDir, { recursive: true });
    console.log(`[OK] 创建技能目录: ${skillDir}`);
  } catch (e) {
    console.error(`[错误] 创建目录失败: ${e}`);
    return null;
  }

  const skillTitle = titleCaseSkillName(skillName);
  const skillContent = SKILL_TEMPLATE.replace(/{skill_name}/g, skillName).replace(
    /{skill_title}/g,
    skillTitle
  );

  const skillMdPath = resolve(skillDir, "SKILL.md");
  try {
    await writeFile(skillMdPath, skillContent, "utf-8");
    console.log("[OK] 创建 SKILL.md");
  } catch (e) {
    console.error(`[错误] 创建 SKILL.md 失败: ${e}`);
    return null;
  }

  if (resources.length > 0) {
    try {
      await createResourceDirs(skillDir, skillName, skillTitle, resources, includeExamples);
    } catch (e) {
      console.error(`[错误] 创建资源目录失败: ${e}`);
      return null;
    }
  }

  console.log(`\n[OK] 技能 '${skillName}' 初始化成功: ${skillDir}`);
  console.log("\n后续步骤:");
  console.log("1. 编辑 SKILL.md 完成 TODO 项目并更新描述");
  if (resources.length > 0) {
    if (includeExamples) {
      console.log("2. 自定义或删除 scripts/, references/, assets/ 中的示例文件");
    } else {
      console.log("2. 按需向 scripts/, references/, assets/ 添加资源");
    }
  } else {
    console.log("2. 仅在需要时创建资源目录;");
  }
  console.log("3. 完成后运行验证器检查技能结构");

  return skillDir;
}

async function main() {
  const { values, positionals } = parseArgs({
    options: {
      path: {
        type: "string",
        short: "p",
      },
      resources: {
        type: "string",
        short: "r",
      },
      examples: {
        type: "boolean",
        short: "e",
        default: false,
      },
    },
    strict: true,
    allowPositionals: true,
  });

  if (positionals.length < 1 || !values.path) {
    console.log("用法: bun init_skill.ts <skill-name> --path <path> [--resources scripts,references,assets] [--examples]");
    console.log("\n示例:");
    console.log("  bun init_skill.ts my-new-skill --path skills/public");
    console.log("  bun init_skill.ts my-new-skill --path skills/public --resources scripts,references");
    console.log("  bun init_skill.ts my-api-helper --path skills/private --resources scripts --examples");
    process.exit(1);
  }

  const rawSkillName = positionals[0];
  const skillName = normalizeSkillName(rawSkillName);

  if (!skillName) {
    console.error("[错误] 技能名称必须包含至少一个字母或数字。");
    process.exit(1);
  }

  if (skillName.length > MAX_SKILL_NAME_LENGTH) {
    console.error(
      `[错误] 技能名称 '${skillName}' 过长 (${skillName.length} 字符)。` +
        `最大为 ${MAX_SKILL_NAME_LENGTH} 字符。`
    );
    process.exit(1);
  }

  if (skillName !== rawSkillName) {
    console.log(`注意: 技能名称从 '${rawSkillName}' 规范化为 '${skillName}'。`);
  }

  const resources = parseResources(values.resources || "");

  if (values.examples && resources.length === 0) {
    console.error("[错误] --examples 需要设置 --resources。");
    process.exit(1);
  }

  const path = values.path;

  console.log(`初始化技能: ${skillName}`);
  console.log(`   位置: ${path}`);
  if (resources.length > 0) {
    console.log(`   资源: ${resources.join(", ")}`);
    if (values.examples) {
      console.log("   示例: 启用");
    }
  } else {
    console.log("   资源: 无 (按需创建)");
  }
  console.log();

  const result = await initSkill(skillName, path, resources, values.examples);
  process.exit(result ? 0 : 1);
}

main();
