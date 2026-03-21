/**
 * SkillRead 工具
 */

import { join } from "node:path";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { BaseTool } from "../../../runtime/tool/base.js";
import type { ToolParameterSchema, ToolResult } from "../../../runtime/tool/types.js";
import { toolsLogger, createTimer, logMethodCall, logMethodReturn, logMethodError } from "../../shared/logger.js";
import { findSkillByName } from "./common.js";

const MODULE_NAME = "skill-read";
const logger = toolsLogger();

export class SkillReadTool extends BaseTool<Record<string, unknown>> {
  readonly name = "skill_read";
  readonly description = `读取技能文件内容。

默认读取 SKILL.md，也可指定技能内的其他文件。
使用此工具查看技能的详细说明。`;

  readonly parameters: ToolParameterSchema = {
    type: "object",
    properties: {
      name: { type: "string", description: "技能名称" },
      file: { type: "string", description: "技能内文件路径（默认: SKILL.md）" },
    },
    required: ["name"],
  };

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const timer = createTimer();
    logMethodCall(logger, { method: "execute", module: MODULE_NAME, params: { tool: "skill_read", name: params.name } });

    try {
      const name = this.readStringParam(params, "name", { required: true });
      if (!name) {
        throw new Error('缺少必需参数: name');
      }

      const skill = await findSkillByName(name);
      if (!skill) {
        return { content: `技能不存在: ${name}`, isError: true };
      }

      const file = this.readStringParam(params, "file") ?? "SKILL.md";
      const filePath = join(skill.path, file);

      if (!existsSync(filePath)) {
        return { content: `文件不存在: ${file}`, isError: true };
      }

      const content = await readFile(filePath, "utf-8");
      logMethodReturn(logger, { method: "execute", module: MODULE_NAME, result: { size: content.length }, duration: timer() });

      return {
        content,
        isError: false,
        metadata: { name, file, size: content.length },
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logMethodError(logger, { method: "execute", module: MODULE_NAME, error: { name: err.name, message: err.message }, duration: timer() });
      return { content: `读取技能失败: ${err.message}`, isError: true };
    }
  }
}
