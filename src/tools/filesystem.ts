import { z } from 'zod';
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'fs';
import { resolve, isAbsolute } from 'path';
import type { Tool, ToolContext } from './base';

/** 读取文件工具 */
export class ReadFileTool implements Tool {
  readonly name = 'read_file';
  readonly description = '读取文件内容';
  readonly inputSchema = z.object({
    path: z.string().describe('文件路径'),
    limit: z.number().optional().describe('最大行数'),
  });

  async execute(input: { path: string; limit?: number }, ctx: ToolContext): Promise<string> {
    const filePath = this.resolvePath(input.path, ctx.workspace);
    
    if (!existsSync(filePath)) {
      return `错误: 文件不存在 ${input.path}`;
    }
    
    const content = readFileSync(filePath, 'utf-8');
    
    if (input.limit && input.limit > 0) {
      const lines = content.split('\n').slice(0, input.limit);
      return lines.join('\n');
    }
    
    return content;
  }

  private resolvePath(path: string, workspace: string): string {
    return isAbsolute(path) ? path : resolve(workspace, path);
  }
}

/** 写入文件工具 */
export class WriteFileTool implements Tool {
  readonly name = 'write_file';
  readonly description = '写入文件内容';
  readonly inputSchema = z.object({
    path: z.string().describe('文件路径'),
    content: z.string().describe('文件内容'),
  });

  async execute(input: { path: string; content: string }, ctx: ToolContext): Promise<string> {
    const filePath = isAbsolute(input.path) 
      ? input.path 
      : resolve(ctx.workspace, input.path);
    
    writeFileSync(filePath, input.content, 'utf-8');
    return `已写入 ${input.path}`;
  }
}

/** 列出目录工具 */
export class ListDirTool implements Tool {
  readonly name = 'list_dir';
  readonly description = '列出目录内容';
  readonly inputSchema = z.object({
    path: z.string().describe('目录路径'),
  });

  async execute(input: { path: string }, ctx: ToolContext): Promise<string> {
    const dirPath = isAbsolute(input.path) 
      ? input.path 
      : resolve(ctx.workspace, input.path);
    
    if (!existsSync(dirPath)) {
      return `错误: 目录不存在 ${input.path}`;
    }

    const stat = statSync(dirPath);
    if (!stat.isDirectory()) {
      return `错误: ${input.path} 不是目录`;
    }

    const entries = readdirSync(dirPath, { withFileTypes: true });
    const lines = entries.map(e => {
      const isDir = e.isDirectory();
      return `${isDir ? 'DIR' : 'FILE'} ${e.name}`;
    });
    
    return lines.length > 0 ? lines.join('\n') : '(空目录)';
  }
}
