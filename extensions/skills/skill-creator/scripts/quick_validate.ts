#!/usr/bin/env bun
/**
 * Quick validation script for skills - minimal version
 *
 * Usage:
 *   bun quick_validate.ts <skill_directory>
 */

import { resolve, basename } from "node:path";
import { readFile } from "node:fs/promises";
import { load as loadYaml } from "js-yaml";

const MAX_SKILL_NAME_LENGTH = 64;

interface ValidationResult {
  valid: boolean;
  message: string;
}

async function validateSkill(skillPath: string): Promise<ValidationResult> {
  const skillMdPath = resolve(skillPath, "SKILL.md");

  let content: string;
  try {
    content = await readFile(skillMdPath, "utf-8");
  } catch {
    return { valid: false, message: "SKILL.md 未找到" };
  }

  if (!content.startsWith("---")) {
    return { valid: false, message: "未找到 YAML frontmatter" };
  }

  const match = content.match(/^---\n(.*?)\n---/s);
  if (!match) {
    return { valid: false, message: "frontmatter 格式无效" };
  }

  const frontmatterText = match[1];

  let frontmatter: Record<string, unknown>;
  try {
    frontmatter = loadYaml(frontmatterText) as Record<string, unknown>;
    if (typeof frontmatter !== "object" || frontmatter === null) {
      return { valid: false, message: "frontmatter 必须是 YAML 字典" };
    }
  } catch (e) {
    return { valid: false, message: `frontmatter 中 YAML 无效: ${e}` };
  }

  // microAgent 字段（package.json 中的扩展字段）
  const allowedProperties = new Set([
    "name",
    "description",
    "license",
    "allowed-tools",
    "metadata",
    "always",
    "dependencies",
    "compatibility",
  ]);

  const unexpectedKeys = Object.keys(frontmatter).filter(
    (key) => !allowedProperties.has(key)
  );
  if (unexpectedKeys.length > 0) {
    const allowed = [...allowedProperties].sort().join(", ");
    const unexpected = unexpectedKeys.sort().join(", ");
    return {
      valid: false,
      message: `SKILL.md frontmatter 中有未预期的键: ${unexpected}。允许的属性: ${allowed}`,
    };
  }

  if (!("name" in frontmatter)) {
    return { valid: false, message: "frontmatter 中缺少 'name'" };
  }
  if (!("description" in frontmatter)) {
    return { valid: false, message: "frontmatter 中缺少 'description'" };
  }

  const name = frontmatter.name;
  if (typeof name !== "string") {
    return { valid: false, message: `name 必须是字符串，得到 ${typeof name}` };
  }
  const trimmedName = name.trim();
  if (trimmedName) {
    if (!/^[a-z0-9-]+$/.test(trimmedName)) {
      return {
        valid: false,
        message: `name '${trimmedName}' 应为连字符格式 (仅小写字母、数字和连字符)`,
      };
    }
    if (trimmedName.startsWith("-") || trimmedName.endsWith("-") || trimmedName.includes("--")) {
      return {
        valid: false,
        message: `name '${trimmedName}' 不能以连字符开头/结尾或包含连续连字符`,
      };
    }
    if (trimmedName.length > MAX_SKILL_NAME_LENGTH) {
      return {
        valid: false,
        message: `name 过长 (${trimmedName.length} 字符)。最大为 ${MAX_SKILL_NAME_LENGTH} 字符。`,
      };
    }
  }

  const description = frontmatter.description;
  if (typeof description !== "string") {
    return { valid: false, message: `description 必须是字符串，得到 ${typeof description}` };
  }
  const trimmedDesc = description.trim();
  if (trimmedDesc) {
    if (trimmedDesc.includes("<") || trimmedDesc.includes(">")) {
      return { valid: false, message: "description 不能包含尖括号 (< 或 >)" };
    }
    if (trimmedDesc.length > 1024) {
      return {
        valid: false,
        message: `description 过长 (${trimmedDesc.length} 字符)。最大为 1024 字符。`,
      };
    }
  }

  // 检查 requires 依赖 (microAgent 扩展字段)
  const metadata = frontmatter.metadata as Record<string, unknown> | undefined;
  if (metadata && typeof metadata === "object") {
    const requires = metadata.requires as Record<string, unknown> | undefined;
    if (requires && typeof requires === "object") {
      const bins = requires.bins;
      if (bins !== undefined && !Array.isArray(bins)) {
        return { valid: false, message: "metadata.requires.bins 必须是数组" };
      }

      const env = requires.env;
      if (env !== undefined && !Array.isArray(env)) {
        return { valid: false, message: "metadata.requires.env 必须是数组" };
      }
    }
  }

  return { valid: true, message: "技能验证通过!" };
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length !== 1) {
    console.log("用法: bun quick_validate.ts <skill_directory>");
    process.exit(1);
  }

  const { valid, message } = await validateSkill(args[0]);
  console.log(message);
  process.exit(valid ? 0 : 1);
}

main();
