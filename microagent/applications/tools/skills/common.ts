/**
 * Skill 工具公共函数
 */

import { join, dirname, basename } from "node:path";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { exec } from "node:child_process";
import { SKILLS_DIR, SKILLS_DIRS } from "../../shared/constants.js";

/** 技能摘要信息 */
export interface SkillSummary {
  name: string;
  description: string | undefined;
  tags: string[] | undefined;
}

/** 技能内部信息 */
export interface SkillInternal {
  name: string;
  path: string;
  writable: boolean;
  description: string | undefined;
  tags: string[] | undefined;
}

/** 执行结果 */
export interface ExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
}

/** 获取有效技能目录 */
export function getValidSkillDirs(): Array<{ path: string; writable: boolean }> {
  return SKILLS_DIRS.map(path => ({
    path,
    writable: path === SKILLS_DIR,
  })).filter(dir => existsSync(dir.path));
}

/** 查找技能 */
export async function findSkillByName(name: string): Promise<SkillInternal | null> {
  const validDirs = getValidSkillDirs();

  for (const dir of validDirs) {
    const skillDir = join(dir.path, name);
    const skillFile = join(skillDir, "SKILL.md");

    if (existsSync(skillFile)) {
      const meta = await parseSkillMetadata(skillFile);
      return {
        name,
        path: skillDir,
        writable: dir.writable,
        description: meta.description,
        tags: meta.tags,
      };
    }
  }

  return null;
}

/** 解析技能元数据 */
export async function parseSkillMetadata(skillFile: string): Promise<{ description?: string; tags?: string[] }> {
  try {
    const content = await readFile(skillFile, "utf-8");
    const result: { description?: string; tags?: string[] } = {};

    const descMatch = content.match(/^description:\s*(.+)$/m);
    if (descMatch?.[1]) {
      result.description = descMatch[1].trim().replace(/^["']|["']$/g, "");
    }

    const tagsMatch = content.match(/^tags:\s*\[(.+)\]$/m);
    if (tagsMatch?.[1]) {
      result.tags = tagsMatch[1].split(",").map(t => t.trim().replace(/^["']|["']$/g, ""));
    }

    return result;
  } catch {
    return {};
  }
}

/** 扫描所有技能 */
export async function scanAllSkills(): Promise<SkillInternal[]> {
  const validDirs = getValidSkillDirs();
  const skills = new Map<string, SkillInternal>();

  for (const dir of validDirs) {
    try {
      const glob = new Bun.Glob("*/SKILL.md");
      const entries = Array.from(glob.scanSync(dir.path));

      for (const relativePath of entries) {
        const skillName = basename(dirname(relativePath));
        const skillDir = join(dir.path, dirname(relativePath));
        const skillFile = join(skillDir, "SKILL.md");

        if (skills.has(skillName)) continue;

        const meta = await parseSkillMetadata(skillFile);
        skills.set(skillName, {
          name: skillName,
          path: skillDir,
          writable: dir.writable,
          description: meta.description,
          tags: meta.tags,
        });
      }
    } catch {
      // ignore
    }
  }

  return Array.from(skills.values());
}

/** 验证技能名称 */
export function validateSkillName(name: string): { valid: boolean; error?: string } {
  if (!name || name.length === 0) {
    return { valid: false, error: "技能名称不能为空" };
  }
  if (name.length > 64) {
    return { valid: false, error: `技能名称过长 (${name.length}/64 字符)` };
  }
  if (!/^[a-z0-9-]+$/.test(name)) {
    return { valid: false, error: "技能名称只能包含小写字母、数字和连字符" };
  }
  if (name.startsWith("-") || name.endsWith("-")) {
    return { valid: false, error: "技能名称不能以连字符开头或结尾" };
  }
  if (name.includes("--")) {
    return { valid: false, error: "技能名称不能包含连续连字符" };
  }
  return { valid: true };
}

/** 生成 SKILL.md 内容 */
export function generateSkillMarkdown(params: {
  name: string;
  description: string;
  license?: string;
  compatibility?: string;
  metadata?: Record<string, string>;
  instructions?: string;
}): string {
  const { name, description, license, compatibility, metadata, instructions } = params;

  const frontmatterLines: string[] = [
    "---",
    `name: ${name}`,
    `description: ${description}`,
  ];

  if (license) frontmatterLines.push(`license: ${license}`);
  if (compatibility) frontmatterLines.push(`compatibility: ${compatibility}`);
  if (metadata && Object.keys(metadata).length > 0) {
    frontmatterLines.push("metadata:");
    for (const [key, value] of Object.entries(metadata)) {
      frontmatterLines.push(`  ${key}: ${value}`);
    }
  }

  frontmatterLines.push("---");

  const body = instructions ?? `# ${name}\n\n## 功能说明\n\n[请描述此技能的具体功能]\n\n## 使用场景\n\n[请描述何时应该使用此技能]\n\n## 使用方法\n\n[请提供具体的使用步骤]\n\n## 示例\n\n[请提供使用示例]`;

  return [...frontmatterLines, "", body].join("\n");
}

/** 执行命令 */
export function executeCommand(command: string, options: { cwd: string; timeout: number }): Promise<ExecutionResult> {
  return new Promise((resolve) => {
    const result: ExecutionResult = { stdout: "", stderr: "", exitCode: null, timedOut: false };

    exec(
      command,
      { cwd: options.cwd, timeout: options.timeout, maxBuffer: 10 * 1024 * 1024, windowsHide: true },
      (error: Error | null, stdout: string, stderr: string) => {
        result.stdout = stdout;
        result.stderr = stderr;

        if (error) {
          if ((error as Error & { killed?: boolean }).killed) result.timedOut = true;
          const errorCode = (error as NodeJS.ErrnoException).code;
          result.exitCode = typeof errorCode === "number" ? errorCode : 1;
        } else {
          result.exitCode = 0;
        }

        resolve(result);
      }
    );
  });
}
