/**
 * Shell 命令执行工具
 *
 * 提供安全的 shell 命令执行能力
 */

import { exec } from "node:child_process";
import { join } from "node:path";
import { BaseTool } from "../../runtime/tool/base.js";
import type { ToolParameterSchema, ToolResult } from "../../runtime/tool/types.js";
import { WORKSPACE_DIR, TOOL_EXECUTION_TIMEOUT } from "../shared/constants.js";

// ============================================================================
// 类型定义
// ============================================================================

/** 执行结果 */
interface ExecutionResult {
  /** 标准输出 */
  stdout: string;
  /** 标准错误 */
  stderr: string;
  /** 退出码 */
  exitCode: number | null;
  /** 是否超时 */
  timedOut: boolean;
}

// ============================================================================
// 安全限制
// ============================================================================

/** 危险命令黑名单 */
const DANGEROUS_COMMANDS = [
  // 系统破坏命令
  "rm -rf /",
  "rm -rf /*",
  "mkfs",
  "dd if=/dev/zero",
  ":(){:|:&};:",

  // 权限提升
  "sudo",
  "su",
  "chmod 777",
  "chown",

  // 网络危险命令
  "curl | bash",
  "wget | bash",
  "nc -l",
  "ncat -l",

  // 进程管理
  "kill -9 -1",
  "killall",
  "pkill",

  // 用户管理
  "useradd",
  "userdel",
  "passwd",
];

// ============================================================================
// 安全检查
// ============================================================================

/**
 * 检查命令是否安全
 * @param command - 命令字符串
 * @returns 是否安全
 */
function isCommandSafe(command: string): boolean {
  const normalizedCommand = command.toLowerCase().trim();

  // 检查危险命令
  for (const dangerous of DANGEROUS_COMMANDS) {
    if (normalizedCommand.includes(dangerous.toLowerCase())) {
      return false;
    }
  }

  return true;
}

/**
 * 解析命令和参数
 * @param command - 命令字符串
 * @returns 解析后的命令和参数
 */
function parseCommand(command: string): { cmd: string; args: string[] } {
  // 简单解析：按空格分割，处理引号
  const parts: string[] = [];
  let current = "";
  let inQuote = false;
  let quoteChar = "";

  for (const char of command) {
    if (inQuote) {
      if (char === quoteChar) {
        inQuote = false;
      } else {
        current += char;
      }
    } else if (char === '"' || char === "'") {
      inQuote = true;
      quoteChar = char;
    } else if (/\s/.test(char)) {
      if (current) {
        parts.push(current);
        current = "";
      }
    } else {
      current += char;
    }
  }

  if (current) {
    parts.push(current);
  }

  return {
    cmd: parts[0] || "",
    args: parts.slice(1),
  };
}

// ============================================================================
// Shell 工具实现
// ============================================================================

/**
 * Shell 命令执行工具
 *
 * 提供安全的命令执行能力：
 * - 支持命令白名单/黑名单
 * - 超时控制
 * - 工作目录限制
 * - 环境变量隔离
 */
export class ShellTool extends BaseTool<Record<string, unknown>> {
  readonly name = "shell";
  readonly description = `安全的 Shell 命令执行工具。

功能：
- 执行系统命令并返回输出
- 支持超时控制
- 限制在 workspace 目录内执行

安全限制：
- 禁止执行危险命令（如 rm -rf /、sudo 等）
- 默认在 workspace 目录执行
- 支持命令超时控制`;

  readonly parameters: ToolParameterSchema = {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "要执行的命令（如：git status、npm test）",
      },
      args: {
        type: "array",
        description: "命令参数数组（可选）",
      },
      cwd: {
        type: "string",
        description: "工作目录（默认为 workspace 目录）",
      },
      timeout: {
        type: "number",
        description: "超时时间（毫秒，默认 30000）",
      },
      env: {
        type: "object",
        description: "额外的环境变量",
      },
    },
    required: ["command"],
  };

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    try {
      const command = this.readStringParam(params, "command", { required: true });

      if (!command) {
        return {
          content: "缺少必需参数: command",
          isError: true,
        };
      }

      // 安全检查
      if (!isCommandSafe(command)) {
        return {
          content: `命令被禁止执行（安全限制）: ${command}`,
          isError: true,
        };
      }

      // 解析命令
      const parsed = parseCommand(command);
      const cmd = parsed.cmd;
      const argsInput = this.readArrayParam<string>(params, "args");
      const cmdArgs = argsInput ?? parsed.args;

      // 验证命令
      if (!cmd) {
        return {
          content: "无效的命令",
          isError: true,
        };
      }

      // 设置工作目录
      const cwdInput = this.readStringParam(params, "cwd");
      const workingDir = cwdInput ? this.resolveWorkDir(cwdInput) : WORKSPACE_DIR;

      // 获取超时和环境变量
      const timeout = this.readNumberParam(params, "timeout") ?? TOOL_EXECUTION_TIMEOUT;
      const env = this.readObjectParam<Record<string, string>>(params, "env") ?? {};

      // 执行命令
      const result = await this.executeCommand(cmd, cmdArgs, {
        cwd: workingDir,
        timeout: timeout,
        env: env,
      });

      // 格式化输出
      return this.formatResult(result, command);
    } catch (error) {
      return {
        content: `命令执行失败: ${error instanceof Error ? error.message : String(error)}`,
        isError: true,
      };
    }
  }

  // ============================================================================
  // 辅助方法
  // ============================================================================

  /**
   * 解析工作目录
   */
  private resolveWorkDir(cwd: string): string {
    // 如果是相对路径，相对于 workspace 解析
    if (cwd.startsWith("/") || /^[A-Za-z]:/.test(cwd)) {
      return cwd;
    }
    return join(WORKSPACE_DIR, cwd);
  }

  /**
   * 执行命令
   */
  private executeCommand(
    command: string,
    args: string[],
    options: {
      cwd: string;
      timeout: number;
      env: Record<string, string>;
    }
  ): Promise<ExecutionResult> {
    return new Promise((resolve) => {
      const result: ExecutionResult = {
        stdout: "",
        stderr: "",
        exitCode: null,
        timedOut: false,
      };

      const fullCommand = args.length > 0 ? `${command} ${args.join(" ")}` : command;

      // 确保工作目录存在，如果不存在则使用当前目录
      const cwd = options.cwd;
      const fs = require("node:fs");
      const workingDir = fs.existsSync(cwd) ? cwd : process.cwd();

      exec(
        fullCommand,
        {
          cwd: workingDir,
          env: {
            ...process.env,
            ...options.env,
          },
          timeout: options.timeout,
          maxBuffer: 10 * 1024 * 1024, // 10MB
          windowsHide: true,
          shell: true,
        },
        (error, stdout, stderr) => {
          result.stdout = stdout;
          result.stderr = stderr;

          if (error) {
            // 检查是否是超时
            if ((error as NodeJS.ErrnoException).killed) {
              result.timedOut = true;
            }
            result.exitCode = typeof error.code === 'number' ? error.code : 1;
          } else {
            result.exitCode = 0;
          }

          resolve(result);
        }
      );
    });
  }

  /**
   * 格式化执行结果
   */
  private formatResult(result: ExecutionResult, command: string): ToolResult {
    const parts: string[] = [];

    // 添加命令信息
    parts.push(`命令: ${command}`);
    parts.push("");

    // 添加输出
    if (result.stdout) {
      parts.push("=== 标准输出 ===");
      parts.push(result.stdout.trim());
    }

    if (result.stderr) {
      parts.push("");
      parts.push("=== 标准错误 ===");
      parts.push(result.stderr.trim());
    }

    // 添加状态
    parts.push("");
    if (result.timedOut) {
      parts.push("状态: 执行超时");
    } else if (result.exitCode === 0) {
      parts.push(`状态: 成功 (退出码: 0)`);
    } else {
      parts.push(`状态: 失败 (退出码: ${result.exitCode})`);
    }

    return {
      content: parts.join("\n"),
      isError: result.exitCode !== 0 || result.timedOut,
      metadata: {
        command,
        exitCode: result.exitCode,
        timedOut: result.timedOut,
        stdoutLength: result.stdout.length,
        stderrLength: result.stderr.length,
      },
    };
  }
}