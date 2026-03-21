/**
 * 兼容旧版 skill 工具
 * @deprecated 请使用独立的 skill_* 工具
 */

import { BaseTool } from "../../../runtime/tool/base.js";
import type { ToolParameterSchema, ToolResult } from "../../../runtime/tool/types.js";

export class SkillTool extends BaseTool<Record<string, unknown>> {
  readonly name = "skill";
  readonly description = `【已废弃】请使用独立的 skill_* 工具：
- skill_list: 列出所有技能
- skill_search: 搜索技能
- skill_read: 读取技能内容
- skill_create: 创建新技能
- skill_delete: 删除技能
- skill_execute: 执行技能命令
- skill_add: 添加技能`;

  readonly parameters: ToolParameterSchema = {
    type: "object",
    properties: {
      action: { type: "string", description: "操作类型（已废弃）" },
    },
    required: [],
  };

  async execute(): Promise<ToolResult> {
    return {
      content: "skill 工具已废弃。请使用独立的 skill_* 工具：skill_list, skill_search, skill_read, skill_create, skill_delete, skill_execute, skill_add",
      isError: true,
    };
  }
}
