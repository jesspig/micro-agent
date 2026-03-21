/**
 * SkillCreate 工具
 */

import { join } from "node:path";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { BaseTool } from "../../../runtime/tool/base.js";
import type { ToolParameterSchema, ToolResult } from "../../../runtime/tool/types.js";
import { SKILLS_DIR } from "../../shared/constants.js";
import { toolsLogger, createTimer, logMethodCall, logMethodReturn, logMethodError, sanitize } from "../../shared/logger.js";
import { findSkillByName, validateSkillName, generateSkillMarkdown } from "./common.js";

const MODULE_NAME = "skill-create";
const logger = toolsLogger();

export class SkillCreateTool extends BaseTool<Record<string, unknown>> {
  readonly name = "skill_create";
  readonly description = `创建新技能（符合 agentskills.io 规范）。

【重要】当用户要求创建技能时，必须调用此工具创建文件，而不是直接输出技能内容。

必需参数：
- name: 技能名称（小写字母/数字/连字符，最长64字符）
- description: 技能描述（应包含触发关键词）

可选参数：
- instructions: 详细说明（SKILL.md 主体内容）
- license: 许可证
- compatibility: 兼容性要求
- create_dirs: 创建子目录（scripts, references, assets）
- content: 自定义完整内容（提供则忽略其他参数）`;

  readonly parameters: ToolParameterSchema = {
    type: "object",
    properties: {
      name: { type: "string", description: "技能名称（小写字母、数字、连字符，最长64字符）" },
      description: { type: "string", description: "技能描述（应包含使用场景关键词）" },
      instructions: { type: "string", description: "技能详细说明" },
      license: { type: "string", description: "许可证名称" },
      compatibility: { type: "string", description: "兼容性要求" },
      create_dirs: { type: "array", description: "创建可选目录", items: { type: "string" } },
      content: { type: "string", description: "自定义 SKILL.md 完整内容" },
    },
    required: ["name"],
  };

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const timer = createTimer();
    logMethodCall(logger, { method: "execute", module: MODULE_NAME, params: sanitize(params) as Record<string, unknown> });

    try {
      const name = this.readStringParam(params, "name", { required: true });
      if (!name) {
        throw new Error('缺少必需参数: name');
      }

      const description = this.readStringParam(params, "description");
      const license = this.readStringParam(params, "license");
      const compatibility = this.readStringParam(params, "compatibility");
      const instructions = this.readStringParam(params, "instructions");
      const createDirs = this.readArrayParam<string>(params, "create_dirs");
      const customContent = this.readStringParam(params, "content");

      const nameValidation = validateSkillName(name);
      if (!nameValidation.valid) {
        return { content: `无效的技能名称: ${nameValidation.error}`, isError: true };
      }

      const existing = await findSkillByName(name);
      if (existing) {
        return { content: `技能已存在: ${name}`, isError: true };
      }

      const skillDir = join(SKILLS_DIR, name);
      const skillFile = join(skillDir, "SKILL.md");

      if (!existsSync(skillDir)) {
        await mkdir(skillDir, { recursive: true });
      }

      const validDirs = ["scripts", "references", "assets"];
      const dirsToCreate = createDirs?.filter(d => validDirs.includes(d)) ?? [];

      for (const dir of dirsToCreate) {
        const dirPath = join(skillDir, dir);
        if (!existsSync(dirPath)) {
          await mkdir(dirPath, { recursive: true });
        }
      }

      let skillContent: string;
      if (customContent) {
        skillContent = customContent;
      } else {
        const skillParams: {
          name: string;
          description: string;
          license?: string;
          compatibility?: string;
          instructions?: string;
        } = {
          name,
          description: description ?? `执行 ${name} 相关任务。当用户提到 "${name}" 或相关关键词时使用此技能。`,
        };

        if (license) skillParams.license = license;
        if (compatibility) skillParams.compatibility = compatibility;
        if (instructions) skillParams.instructions = instructions;

        skillContent = generateSkillMarkdown(skillParams);
      }

      await writeFile(skillFile, skillContent, "utf-8");

      const resultParts: string[] = [
        `技能创建成功: ${name}`,
        "",
        "创建的文件:",
        "  - SKILL.md",
      ];

      if (dirsToCreate.length > 0) {
        resultParts.push("", "创建的目录:");
        for (const dir of dirsToCreate) {
          resultParts.push(`  - ${dir}/`);
        }
      }

      resultParts.push("", "技能路径: ~/.micro-agent/skills/" + name);

      logMethodReturn(logger, { method: "execute", module: MODULE_NAME, result: { name }, duration: timer() });
      return {
        content: resultParts.join("\n"),
        isError: false,
        metadata: { name, file: "SKILL.md", dirs: dirsToCreate },
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logMethodError(logger, { method: "execute", module: MODULE_NAME, error: { name: err.name, message: err.message }, duration: timer() });
      return { content: `创建技能失败: ${err.message}`, isError: true };
    }
  }
}
