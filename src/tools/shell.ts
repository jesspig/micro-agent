import { z } from 'zod';
import type { Tool, ToolContext } from './base';

/** Shell 执行工具 */
export class ExecTool implements Tool {
  readonly name = 'exec';
  readonly description = '执行 Shell 命令';
  readonly inputSchema = z.object({
    command: z.string().describe('命令'),
    timeout: z.number().optional().describe('超时时间（毫秒）'),
  });

  private workingDir: string;
  private defaultTimeout: number;

  constructor(workingDir: string, defaultTimeout: number = 30000) {
    this.workingDir = workingDir;
    this.defaultTimeout = defaultTimeout;
  }

  async execute(input: { command: string; timeout?: number }): Promise<string> {
    const timeout = input.timeout ?? this.defaultTimeout;

    try {
      // 根据平台选择 Shell
      const isWindows = process.platform === 'win32';
      const shell = isWindows ? 'cmd.exe' : 'sh';
      const args = isWindows ? ['/c', input.command] : ['-c', input.command];

      const result = Bun.spawnSync([shell, ...args], {
        cwd: this.workingDir,
        timeout: timeout,
      });

      if (result.stderr && result.stderr.length > 0) {
        const stderr = result.stderr.toString();
        if (stderr.trim()) {
          return `错误输出:\n${stderr}`;
        }
      }

      return result.stdout?.toString() || '(无输出)';
    } catch (error) {
      return `执行失败: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
}
