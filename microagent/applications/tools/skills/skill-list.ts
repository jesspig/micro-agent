/**
 * SkillList 工具
 */

import { BaseTool } from "../../../runtime/tool/base.js";
import type { ToolParameterSchema, ToolResult } from "../../../runtime/tool/types.js";
import { toolsLogger, createTimer, logMethodCall, logMethodReturn, logMethodError } from "../../shared/logger.js";
import { scanAllSkills, type SkillSummary } from "./common.js";

const MODULE_NAME = "skill-list";
const logger = toolsLogger();

export class SkillListTool extends BaseTool<Record<string, unknown>> {
  readonly name = "skill_list";
  readonly description = `列出所有可用的技能。

【重要】这是获取技能列表的唯一方式。当用户询问"有哪些技能"、"技能列表"、"能做什么"时，必须调用此工具，不要直接猜测或编造技能列表。

返回技能列表，包含名称、描述和标签。`;

  readonly parameters: ToolParameterSchema = {
    type: "object",
    properties: {},
    required: [],
  };

  async execute(): Promise<ToolResult> {
    const timer = createTimer();
    logMethodCall(logger, { method: "execute", module: MODULE_NAME, params: { tool: "skill_list" } });

    try {
      const skills = await scanAllSkills();

      if (skills.length === 0) {
        return { content: "没有可用的技能", isError: false };
      }

      const summaries: SkillSummary[] = skills.map(s => ({
        name: s.name,
        description: s.description,
        tags: s.tags,
      }));

      logMethodReturn(logger, { method: "execute", module: MODULE_NAME, result: { count: summaries.length }, duration: timer() });
      return {
        content: JSON.stringify(summaries, null, 2),
        isError: false,
        metadata: { count: summaries.length },
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logMethodError(logger, { method: "execute", module: MODULE_NAME, error: { name: err.name, message: err.message }, duration: timer() });
      return { content: `列出技能失败: ${err.message}`, isError: true };
    }
  }
}
