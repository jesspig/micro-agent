/**
 * SkillAdd 工具
 */

import { join, basename } from "node:path";
import { existsSync, cpSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { BaseTool } from "../../../runtime/tool/base.js";
import type { ToolParameterSchema, ToolResult } from "../../../runtime/tool/types.js";
import { SKILLS_DIR, WORKSPACE_DIR } from "../../shared/constants.js";
import { toolsLogger, createTimer, logMethodCall, logMethodReturn, logMethodError } from "../../shared/logger.js";
import { findSkillByName } from "./common.js";

const MODULE_NAME = "skill-add";
const logger = toolsLogger();

export class SkillAddTool extends BaseTool<Record<string, unknown>> {
  readonly name = "skill_add";
  readonly description = `从工作区添加技能。

将工作区中的技能目录复制到技能库中。
源目录必须包含 SKILL.md 文件。`;

  readonly parameters: ToolParameterSchema = {
    type: "object",
    properties: {
      source_path: { type: "string", description: "工作区中的技能目录路径" },
      name: { type: "string", description: "技能名称（可选，默认使用目录名）" },
    },
    required: ["source_path"],
  };

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const timer = createTimer();
    logMethodCall(logger, { method: "execute", module: MODULE_NAME, params: { tool: "skill_add", source_path: params.source_path } });

    try {
      const sourcePath = this.readStringParam(params, "source_path", { required: true });
      if (!sourcePath) {
        throw new Error('缺少必需参数: source_path');
      }

      const name = this.readStringParam(params, "name");

      let fullSourcePath: string;
      if (sourcePath.startsWith("~")) {
        fullSourcePath = join(homedir(), sourcePath.slice(1).replace(/^[\/\\]/, ""));
      } else if (sourcePath.startsWith("/") || /^[A-Za-z]:/.test(sourcePath)) {
        fullSourcePath = sourcePath;
      } else {
        fullSourcePath = join(WORKSPACE_DIR, sourcePath);
      }

      if (!existsSync(fullSourcePath)) {
        return { content: `源路径不存在: ${sourcePath}`, isError: true };
      }

      const skillName = name ? basename(name.replace(/[\/\\]/g, "")) : basename(fullSourcePath);

      if (!skillName || skillName === "." || skillName === "..") {
        return { content: `无效的技能名称`, isError: true };
      }

      const existing = await findSkillByName(skillName);
      if (existing) {
        return { content: `技能已存在: ${skillName}，请先删除后再添加`, isError: true };
      }

      const targetPath = join(SKILLS_DIR, skillName);

      if (!existsSync(SKILLS_DIR)) {
        await mkdir(SKILLS_DIR, { recursive: true });
      }

      try {
        cpSync(fullSourcePath, targetPath, { recursive: true });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: `复制失败: ${msg}`, isError: true };
      }

      logMethodReturn(logger, { method: "execute", module: MODULE_NAME, result: { name: skillName }, duration: timer() });
      return {
        content: `技能添加成功: ${skillName}`,
        isError: false,
        metadata: { name: skillName },
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logMethodError(logger, { method: "execute", module: MODULE_NAME, error: { name: err.name, message: err.message }, duration: timer() });
      return { content: `添加技能失败: ${err.message}`, isError: true };
    }
  }
}
