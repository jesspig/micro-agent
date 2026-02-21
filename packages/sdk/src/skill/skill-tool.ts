/**
 * 技能工具包装器
 *
 * 将 Skill 包装为可调用的 Tool，支持通过 ReAct 动作直接调用技能。
 */

import { existsSync } from 'fs';
import { join } from 'path';
import type { Tool, ToolResult, JSONSchema, ToolContext } from '@microbot/types';
import type { Skill } from './types';

/**
 * 技能工具
 *
 * 将技能脚本包装为可调用的工具。
 */
export class SkillTool implements Tool {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: JSONSchema;

  /** 技能路径 */
  readonly skillPath: string;

  /** 脚本入口路径 */
  private scriptEntry: string;

  /** 默认超时时间（毫秒） */
  private timeout: number;

  constructor(skill: Skill, timeout: number = 30000) {
    this.name = skill.name;
    this.description = skill.description || `执行 ${skill.name} 技能`;
    this.skillPath = skill.skillPath;
    this.timeout = timeout;

    // 查找脚本入口
    this.scriptEntry = this.findScriptEntry(skill);

    // 定义输入 Schema
    this.inputSchema = {
      type: 'object',
      properties: {
        args: {
          type: 'string',
          description: '命令行参数，如 "--type cpu" 或 "--json"',
        },
      },
      required: [],
    } satisfies JSONSchema;
  }

  /**
   * 查找技能脚本入口
   */
  private findScriptEntry(skill: Skill): string {
    // 优先查找 scripts/index.ts
    const candidates = [
      join(skill.skillPath, 'scripts', 'index.ts'),
      join(skill.skillPath, 'scripts', 'index.js'),
      join(skill.skillPath, 'index.ts'),
      join(skill.skillPath, 'index.js'),
    ];

    for (const candidate of candidates) {
      if (existsSync(candidate)) {
        return candidate;
      }
    }

    // 默认返回 scripts/index.ts
    return join(skill.skillPath, 'scripts', 'index.ts');
  }

  /**
   * 执行技能
   */
  async execute(input: unknown, ctx: ToolContext): Promise<ToolResult> {
    // 解析参数
    const args = this.parseArgs(input);

    try {
      const result = await this.runScript(args, ctx.workspace);
      return {
        content: [{ type: 'text', text: result }],
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            error: true,
            message: `技能执行失败: ${error instanceof Error ? error.message : String(error)}`,
            skill: this.name,
          }),
        }],
        isError: true,
      };
    }
  }

  /**
   * 解析输入参数
   *
   * 支持多种输入格式：
   * - 字符串: "--type cpu"
   * - 对象: { args: "--type cpu" }
   * - 对象: { type: "cpu" }
   */
  private parseArgs(input: unknown): string[] {
    if (typeof input === 'string') {
      return this.splitArgs(input);
    }

    if (input && typeof input === 'object') {
      const obj = input as Record<string, unknown>;

      // 显式 args 字段
      if (typeof obj.args === 'string') {
        return this.splitArgs(obj.args);
      }

      // action_input 字段（ReAct 兼容）
      if (typeof obj.action_input === 'string') {
        return this.splitArgs(obj.action_input);
      }

      // 键值对参数: { type: "cpu", json: true }
      const args: string[] = [];
      for (const [key, value] of Object.entries(obj)) {
        if (value === true) {
          args.push(`--${key}`);
        } else if (typeof value === 'string' || typeof value === 'number') {
          args.push(`--${key}`, String(value));
        }
      }
      return args;
    }

    return [];
  }

  /**
   * 分割参数字符串
   */
  private splitArgs(argsStr: string): string[] {
    const args: string[] = [];
    let current = '';
    let inQuote = false;
    let quoteChar = '';

    for (const char of argsStr) {
      if ((char === '"' || char === "'") && !inQuote) {
        inQuote = true;
        quoteChar = char;
      } else if (char === quoteChar && inQuote) {
        inQuote = false;
        quoteChar = '';
      } else if (char === ' ' && !inQuote) {
        if (current) {
          args.push(current);
          current = '';
        }
      } else {
        current += char;
      }
    }

    if (current) {
      args.push(current);
    }

    return args;
  }

  /**
   * 执行技能脚本
   */
  private async runScript(args: string[], workspace: string): Promise<string> {
    if (!existsSync(this.scriptEntry)) {
      return `错误: 技能脚本不存在 ${this.scriptEntry}`;
    }

    const result = Bun.spawnSync(['bun', this.scriptEntry, ...args], {
      cwd: workspace,
      timeout: this.timeout,
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
  }
}

/**
 * 为技能创建工具
 */
export function createSkillTool(skill: Skill, timeout?: number): Tool {
  return new SkillTool(skill, timeout);
}

/**
 * 为所有技能创建工具
 */
export function createSkillTools(skills: Skill[], timeout?: number): Tool[] {
  return skills.map(skill => createSkillTool(skill, timeout));
}
