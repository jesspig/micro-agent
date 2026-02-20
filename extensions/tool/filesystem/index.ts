/**
 * 文件系统工具扩展
 * 
 * 提供文件读取、写入、目录列表功能。
 */
import { z } from 'zod';
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'fs';
import { resolve, isAbsolute } from 'path';
import type { Tool, ToolContext } from '@microbot/core';

/**
 * 读取文件工具
 * 
 * 读取指定路径的文件内容，支持限制行数。
 */
export class ReadFileTool implements Tool {
  /** 工具名称 */
  readonly name = 'read_file';
  /** 工具描述 */
  readonly description = '读取文件内容';
  /** 输入参数 Schema */
  readonly inputSchema = z.object({
    path: z.string().describe('文件路径'),
    limit: z.number().optional().describe('最大行数'),
  });

  /**
   * 执行文件读取
   * @param input - 输入参数，包含文件路径和可选行数限制
   * @param ctx - 工具上下文
   * @returns 文件内容或错误信息
   */
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

  /**
   * 解析文件路径
   * @param path - 原始路径
   * @param workspace - 工作目录
   * @returns 解析后的绝对路径
   */
  private resolvePath(path: string, workspace: string): string {
    return isAbsolute(path) ? path : resolve(workspace, path);
  }
}

/**
 * 写入文件工具
 * 
 * 将内容写入指定路径的文件。
 */
export class WriteFileTool implements Tool {
  /** 工具名称 */
  readonly name = 'write_file';
  /** 工具描述 */
  readonly description = '写入文件内容';
  /** 输入参数 Schema */
  readonly inputSchema = z.object({
    path: z.string().describe('文件路径'),
    content: z.string().describe('文件内容'),
  });

  /**
   * 执行文件写入
   * @param input - 输入参数，包含文件路径和内容
   * @param ctx - 工具上下文
   * @returns 操作结果信息
   */
  async execute(input: { path: string; content: string }, ctx: ToolContext): Promise<string> {
    const filePath = isAbsolute(input.path) 
      ? input.path 
      : resolve(ctx.workspace, input.path);
    
    writeFileSync(filePath, input.content, 'utf-8');
    return `已写入 ${input.path}`;
  }
}

/**
 * 列出目录工具
 * 
 * 列出指定目录下的文件和子目录。
 */
export class ListDirTool implements Tool {
  /** 工具名称 */
  readonly name = 'list_dir';
  /** 工具描述 */
  readonly description = '列出目录内容';
  /** 输入参数 Schema */
  readonly inputSchema = z.object({
    path: z.string().describe('目录路径'),
  });

  /**
   * 执行目录列表
   * @param input - 输入参数，包含目录路径
   * @param ctx - 工具上下文
   * @returns 目录内容列表或错误信息
   */
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

/** 文件系统工具类数组 */
export const filesystemTools = [ReadFileTool, WriteFileTool, ListDirTool];