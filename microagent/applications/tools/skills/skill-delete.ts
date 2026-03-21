/**
 * SkillDelete 工具
 */

import { rm } from "node:fs/promises";
import { BaseTool } from "../../../runtime/tool/base.js";
import type { ToolParameterSchema, ToolResult } from "../../../runtime/tool/types.js";
import { toolsLogger, createTimer, logMethodCall, logMethodReturn, logMethodError } from "../../shared/logger.js";
import { findSkillByName } from "./common.js";

const MODULE_NAME = "skill-delete";
const logger = toolsLogger();

export class SkillDeleteTool extends BaseTool<Record<string, unknown>> {
  readonly name = "skill_delete";
  readonly description = `删除技能。

只能删除用户创建的技能（主目录中的技能）。
系统内置技能无法删除。`;

  readonly parameters: ToolParameterSchema = {
    type: "object",
    properties: {
      name: { type: "string", description: "要删除的技能名称" },
    },
    required: ["name"],
  };

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const timer = createTimer();
    logMethodCall(logger, { method: "execute", module: MODULE_NAME, params: { tool: "skill_delete", name: params.name } });

    try {
      const name = this.readStringParam(params, "name", { required: true });
      if (!name) {
        throw new Error('缺少必需参数: name');
      }

      const skill = await findSkillByName(name);
      if (!skill) {
        return { content: `技能不存在: ${name}`, isError: true };
      }

      if (!skill.writable) {
        return { content: `技能 ${name} 是只读的，无法删除`, isError: true };
      }

      await rm(skill.path, { recursive: true });
      logMethodReturn(logger, { method: "execute", module: MODULE_NAME, result: { name }, duration: timer() });

      return { content: `技能删除成功: ${name}`, isError: false };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logMethodError(logger, { method: "execute", module: MODULE_NAME, error: { name: err.name, message: err.message }, duration: timer() });
      return { content: `删除技能失败: ${err.message}`, isError: true };
    }
  }
}
