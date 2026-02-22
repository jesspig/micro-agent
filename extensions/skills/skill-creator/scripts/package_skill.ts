#!/usr/bin/env bun
/**
 * Skill Packager - Creates a distributable .skill file of a skill folder
 *
 * Usage:
 *   bun package_skill.ts <path/to/skill-folder> [output-directory]
 *
 * Example:
 *   bun package_skill.ts skills/public/my-skill
 *   bun package_skill.ts skills/public/my-skill ./dist
 */

import { resolve, basename, relative } from "node:path";
import { readdir, stat, readFile, writeFile, mkdir } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { cwd } from "node:process";
import { load as loadYaml } from "js-yaml";
// @ts-expect-error - @aspect-build/zip types not available
import { ZipWriter, BlobReader, BlobWriter } from "@aspect-build/zip";

const MAX_SKILL_NAME_LENGTH = 64;

interface ValidationResult {
  valid: boolean;
  message: string;
}

async function validateSkill(skillPath: string): Promise<ValidationResult> {
  const skillMdPath = resolve(skillPath, "SKILL.md");

  try {
    const content = await readFile(skillMdPath, "utf-8");

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
      return {
        valid: false,
        message: `SKILL.md frontmatter 中有未预期的键: ${unexpectedKeys.join(", ")}。允许的属性: ${[...allowedProperties].sort().join(", ")}`,
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

    return { valid: true, message: "技能验证通过!" };
  } catch (e) {
    return { valid: false, message: `SKILL.md 未找到或读取失败: ${e}` };
  }
}

async function getAllFiles(dir: string, baseDir: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await getAllFiles(fullPath, baseDir)));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }

  return files;
}

async function packageSkill(
  skillPath: string,
  outputDir?: string
): Promise<string | null> {
  const resolvedSkillPath = resolve(skillPath);

  try {
    const stats = await stat(resolvedSkillPath);
    if (!stats.isDirectory()) {
      console.error(`[错误] 路径不是目录: ${resolvedSkillPath}`);
      return null;
    }
  } catch {
    console.error(`[错误] 技能文件夹未找到: ${resolvedSkillPath}`);
    return null;
  }

  // 验证
  console.log("验证技能...");
  const { valid, message } = await validateSkill(resolvedSkillPath);
  if (!valid) {
    console.error(`[错误] 验证失败: ${message}`);
    console.error("   请在打包前修复验证错误。");
    return null;
  }
  console.log(`[OK] ${message}\n`);

  const skillName = basename(resolvedSkillPath);
  const outputLocation = outputDir ? resolve(outputDir) : cwd();
  
  await mkdir(outputLocation, { recursive: true });
  const skillFilename = resolve(outputLocation, `${skillName}.skill`);

  try {
    const files = await getAllFiles(resolvedSkillPath, resolvedSkillPath);
    const parentDir = resolve(resolvedSkillPath, "..");
    
    // 使用 zip 库创建压缩文件
    const writer = new BlobWriter("application/zip");
    const zipFile = new ZipWriter(writer);
    
    for (const filePath of files) {
      const arcname = relative(parentDir, filePath);
      const content = await readFile(filePath);
      await zipFile.addFile(arcname, new BlobReader(new Blob([content])));
      console.log(`  添加: ${arcname}`);
    }
    
    await zipFile.close();
    const blob = await writer.getData();
    const buffer = Buffer.from(await blob.arrayBuffer());
    await writeFile(skillFilename, buffer);

    console.log(`\n[OK] 成功打包技能到: ${skillFilename}`);
    return skillFilename;
  } catch (e) {
    console.error(`[错误] 创建 .skill 文件失败: ${e}`);
    return null;
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.log("用法: bun package_skill.ts <path/to/skill-folder> [output-directory]");
    console.log("\n示例:");
    console.log("  bun package_skill.ts skills/public/my-skill");
    console.log("  bun package_skill.ts skills/public/my-skill ./dist");
    process.exit(1);
  }

  const skillPath = args[0];
  const outputDir = args[1];

  console.log(`打包技能: ${skillPath}`);
  if (outputDir) {
    console.log(`   输出目录: ${outputDir}`);
  }
  console.log();

  const result = await packageSkill(skillPath, outputDir);
  process.exit(result ? 0 : 1);
}

main();
