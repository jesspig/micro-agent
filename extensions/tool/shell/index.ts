/**
 * Shell 工具扩展
 * 
 * 提供命令执行功能，支持多种运行时。
 * 自动解析可执行文件路径，解决 PATH 环境变量问题。
 */
import { z } from 'zod';
import { which } from 'bun';
import type { Tool, ToolContext } from '@microbot/core';

/**
 * Shell 执行工具
 * 
 * 执行命令或脚本，支持：
 * - JS/TS 脚本 (自动用 bun 执行)
 * - Shell 命令
 * - Python 脚本
 */
export class ExecTool implements Tool {
  /** 工具名称 */
  readonly name = 'exec';
  /** 工具描述 */
  readonly description = `执行命令或脚本。支持:
- JS/TS 脚本 (自动用 bun 执行)
- Shell 命令
- Python 脚本
示例: "script.ts", "bun script.ts", "echo hello"`;
  /** 输入参数 Schema */
  readonly inputSchema = z.object({
    command: z.string().describe('命令'),
    timeout: z.number().optional().describe('超时时间（毫秒）'),
  });

  /** 工作目录 */
  private workingDir: string;
  /** 默认超时时间 */
  private defaultTimeout: number;

  /**
   * 创建 ExecTool 实例
   * @param workingDir - 工作目录
   * @param defaultTimeout - 默认超时时间（毫秒）
   */
  constructor(workingDir: string, defaultTimeout: number = 30000) {
    this.workingDir = workingDir;
    this.defaultTimeout = defaultTimeout;
  }

  /**
   * 执行命令
   * @param input - 输入参数，包含命令和可选超时时间
   * @returns 执行结果或错误信息
   */
  async execute(input: { command: string; timeout?: number }): Promise<string> {
    const timeout = input.timeout ?? this.defaultTimeout;
    const cmd = input.command.trim();

    try {
      const { existsSync, mkdirSync } = await import('fs');
      if (!existsSync(this.workingDir)) {
        mkdirSync(this.workingDir, { recursive: true });
      }
      
      const { runner, args } = this.parseCommand(cmd);
      
      const resolvedRunner = await this.resolveExecutable(runner);
      if (!resolvedRunner) {
        return `找不到可执行文件: ${runner}`;
      }

      const result = Bun.spawnSync([resolvedRunner, ...args], {
        cwd: this.workingDir,
        timeout: timeout,
        env: process.env,
      });

      const stdout = result.stdout?.toString() || '';
      const stderr = result.stderr?.toString() || '';
      const exitCode = result.exitCode;

      let output = '';
      if (stdout.trim()) output += stdout;
      if (stderr.trim()) output += (output ? '\n' : '') + `[stderr] ${stderr}`;
      if (!output && exitCode !== 0) output = `(退出码: ${exitCode})`;
      if (!output) output = '(无输出)';

      return output;
    } catch (error) {
      return `执行失败: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  /**
   * 解析命令，返回运行时和参数
   * @param cmd - 原始命令字符串
   * @returns 运行时和参数数组
   */
  private parseCommand(cmd: string): { runner: string; args: string[] } {
    const parts = this.splitCommand(cmd);
    if (parts.length === 0) {
      return { runner: '', args: [] };
    }

    const first = parts[0];

    // 直接指定的运行时: bun/node/deno script.js [args]
    if (['bun', 'node', 'deno'].includes(first) && parts.length > 1) {
      return { runner: first, args: parts.slice(1) };
    }

    // Python 运行时
    if (['python', 'python3', 'py'].includes(first) && parts.length > 1) {
      return { runner: 'python', args: parts.slice(1) };
    }

    // npx/bunx
    if (['npx', 'bunx'].includes(first) && parts.length > 1) {
      return { runner: first, args: parts.slice(1) };
    }

    // 检测脚本文件扩展名，自动选择运行时
    if (first.endsWith('.ts') || first.endsWith('.tsx') || first.endsWith('.js') || first.endsWith('.mjs') || first.endsWith('.cjs')) {
      return { runner: 'bun', args: parts };
    }
    if (first.endsWith('.py')) {
      return { runner: 'python', args: parts };
    }

    // 默认通过 shell 执行
    const isWindows = process.platform === 'win32';
    if (isWindows) {
      return { runner: 'cmd.exe', args: ['/c', cmd] };
    } else {
      return { runner: '/bin/sh', args: ['-c', cmd] };
    }
  }

  /**
   * 解析可执行文件路径
   * @param name - 可执行文件名
   * @returns 绝对路径或 null
   */
  private async resolveExecutable(name: string): Promise<string | null> {
    // 已经是绝对路径
    if (name.startsWith('/') || name.match(/^[A-Za-z]:/)) {
      return name;
    }

    // 特殊处理 cmd.exe
    if (name === 'cmd.exe') {
      return process.env.COMSPEC || 'C:\\Windows\\System32\\cmd.exe';
    }

    // 特殊处理 bun - 使用当前运行的 bun
    if (name === 'bun') {
      const bunPath = which('bun');
      return bunPath || process.execPath;
    }

    // 使用 Bun.which 查找
    const found = which(name);
    if (found) {
      return found;
    }

    // Windows 常见路径补充
    if (process.platform === 'win32') {
      const winPaths = [
        `C:\\Windows\\System32\\${name}`,
        `C:\\Windows\\System32\\${name}.exe`,
        `C:\\Program Files\\nodejs\\${name}.exe`,
        `C:\\Program Files\\Bun\\${name}.exe`,
      ];
      
      const { existsSync } = await import('fs');
      for (const p of winPaths) {
        if (existsSync(p)) return p;
      }
    }

    return null;
  }

  /**
   * 分割命令字符串（支持引号）
   * @param cmd - 原始命令字符串
   * @returns 分割后的参数数组
   */
  private splitCommand(cmd: string): string[] {
    const parts: string[] = [];
    let current = '';
    let inQuote = false;
    let quoteChar = '';

    for (const char of cmd) {
      if ((char === '"' || char === "'") && !inQuote) {
        inQuote = true;
        quoteChar = char;
      } else if (char === quoteChar && inQuote) {
        inQuote = false;
        quoteChar = '';
      } else if (char === ' ' && !inQuote) {
        if (current) {
          parts.push(current);
          current = '';
        }
      } else {
        current += char;
      }
    }

    if (current) parts.push(current);
    return parts;
  }
}

/** Shell 工具类数组 */
export const shellTools = [ExecTool];