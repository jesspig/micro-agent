/**
 * SkillSearch 工具
 */

import { BaseTool } from "../../../runtime/tool/base.js";
import type { ToolParameterSchema, ToolResult } from "../../../runtime/tool/types.js";
import { toolsLogger, createTimer, logMethodCall, logMethodReturn, logMethodError } from "../../shared/logger.js";
import { scanAllSkills, type SkillSummary } from "./common.js";

const MODULE_NAME = "skill-search";
const logger = toolsLogger();

export class SkillSearchTool extends BaseTool<Record<string, unknown>> {
  readonly name = "skill_search";
  readonly description = `按关键词搜索技能。

在技能名称、描述和标签中搜索匹配项。
使用此工具查找特定功能的技能。`;

  readonly parameters: ToolParameterSchema = {
    type: "object",
    properties: {
      query: { type: "string", description: "搜索关键词" },
    },
    required: ["query"],
  };

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const timer = createTimer();
    logMethodCall(logger, { method: "execute", module: MODULE_NAME, params: { tool: "skill_search", query: params.query } });

    try {
      const query = this.readStringParam(params, "query", { required: true });
      if (!query) {
        throw new Error('缺少必需参数: query');
      }

      const skills = await scanAllSkills();
      const queryLower = query.toLowerCase();

      const results: SkillSummary[] = skills
        .filter(s =>
          s.name.toLowerCase().includes(queryLower) ||
          (s.description && s.description.toLowerCase().includes(queryLower)) ||
          (s.tags && s.tags.some(t => t.toLowerCase().includes(queryLower)))
        )
        .map(s => ({
          name: s.name,
          description: s.description,
          tags: s.tags,
        }));

      logMethodReturn(logger, { method: "execute", module: MODULE_NAME, result: { count: results.length }, duration: timer() });
      return {
        content: JSON.stringify(results, null, 2),
        isError: false,
        metadata: { query, count: results.length },
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logMethodError(logger, { method: "execute", module: MODULE_NAME, error: { name: err.name, message: err.message }, duration: timer() });
      return { content: `搜索技能失败: ${err.message}`, isError: true };
    }
  }
}
