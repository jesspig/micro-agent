/**
 * SkillExecute 工具
 */

import { BaseTool } from "../../../runtime/tool/base.js";
import type { ToolParameterSchema, ToolResult } from "../../../runtime/tool/types.js";
import { TOOL_EXECUTION_TIMEOUT } from "../../shared/constants.js";
import { toolsLogger, createTimer, logMethodCall, logMethodReturn, logMethodError } from "../../shared/logger.js";
import { findSkillByName, executeCommand } from "./common.js";
import { validateCommand } from "../skill-security.js";

const MODULE_NAME = "skill-execute";
const logger = toolsLogger();

export class SkillExecuteTool extends BaseTool<Record<string, unknown>> {
  readonly name = "skill_execute";
  readonly description = `在技能目录中执行命令。

用于运行技能中的脚本或工具。
命令会在技能目录下执行。`;

  readonly parameters: ToolParameterSchema = {
    type: "object",
    properties: {
      name: { type: "string", description: "技能名称" },
      command: { type: "string", description: "要执行的命令" },
      args: { type: "array", description: "命令参数", items: { type: "string" } },
      timeout: { type: "number", description: "超时时间（毫秒）" },
    },
    required: ["name", "command"],
  };

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const timer = createTimer();
    logMethodCall(logger, { method: "execute", module: MODULE_NAME, params: { tool: "skill_execute", name: params.name } });

    try {
      const name = this.readStringParam(params, "name", { required: true });
      if (!name) {
        throw new Error('缺少必需参数: name');
      }

      const command = this.readStringParam(params, "command", { required: true });
      if (!command) {
        throw new Error('缺少必需参数: command');
      }

      const validation = validateCommand(command);
      if (!validation.allowed) {
        throw new Error(`命令被禁止执行: ${command}\n原因: ${validation.reason}`);
      }

      const skill = await findSkillByName(name);
      if (!skill) {
        return { content: `技能不存在: ${name}`, isError: true };
      }

      const args = this.readArrayParam<string>(params, "args");
      const timeout = this.readNumberParam(params, "timeout") ?? TOOL_EXECUTION_TIMEOUT;
      const fullCommand = args && args.length > 0 ? `${command} ${args.join(" ")}` : command;

      const execResult = await executeCommand(fullCommand, { cwd: skill.path, timeout });

      const parts: string[] = [`技能: ${name}`, `命令: ${command}`, ""];

      if (execResult.stdout) {
        parts.push("=== 标准输出 ===", execResult.stdout.trim());
      }

      if (execResult.stderr) {
        parts.push("", "=== 标准错误 ===", execResult.stderr.trim());
      }

      parts.push("");
      if (execResult.timedOut) {
        parts.push("状态: 执行超时");
      } else if (execResult.exitCode === 0) {
        parts.push("状态: 成功");
      } else {
        parts.push(`状态: 失败 (退出码: ${execResult.exitCode})`);
      }

      logMethodReturn(logger, { method: "execute", module: MODULE_NAME, result: { exitCode: execResult.exitCode }, duration: timer() });
      return {
        content: parts.join("\n"),
        isError: execResult.exitCode !== 0 || execResult.timedOut,
        metadata: { command, skillName: name, exitCode: execResult.exitCode, timedOut: execResult.timedOut },
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logMethodError(logger, { method: "execute", module: MODULE_NAME, error: { name: err.name, message: err.message }, duration: timer() });
      return { content: `执行命令失败: ${err.message}`, isError: true };
    }
  }
}
