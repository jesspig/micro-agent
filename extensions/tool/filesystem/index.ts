/**
 * 文件系统工具扩展
 *
 * 提供文件读取、写入、目录列表功能。
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'fs';
import { resolve, isAbsolute } from 'path';
import { defineTool } from '@micro-agent/sdk';
import type { Tool, JSONSchema, ToolContext } from '@micro-agent/types';

/** 读取文件工具 */
export const ReadFileTool = defineTool({
  name: 'read_file',
  description: '读取文件内容',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: '文件路径' },
      limit: { type: 'number', description: '最大行数' },
    },
    required: ['path'],
  } satisfies JSONSchema,
  execute: async (input: unknown, ctx: ToolContext) => {
    // 兼容多种输入格式
    let path: string;
    let limit: number | undefined;
    
    if (typeof input === 'string') {
      path = input;
    } else if (input && typeof input === 'object') {
      const obj = input as Record<string, unknown>;
      path = String(obj.path ?? obj.action_input ?? '');
      if (typeof obj.limit === 'number') limit = obj.limit;
    } else {
      return '错误: 无效的输入格式';
    }

    const filePath = isAbsolute(path) ? path : resolve(ctx.workspace, path);

    if (!existsSync(filePath)) {
      return `错误: 文件不存在 ${path}`;
    }

    const content = readFileSync(filePath, 'utf-8');

    if (limit && limit > 0) {
      const lines = content.split('\n').slice(0, limit);
      return lines.join('\n');
    }

    return content;
  },
});

/** 写入文件工具 */
export const WriteFileTool = defineTool({
  name: 'write_file',
  description: '写入文件内容',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: '文件路径' },
      content: { type: 'string', description: '文件内容' },
    },
    required: ['path', 'content'],
  } satisfies JSONSchema,
  execute: async (input: { path: string; content: string }, ctx: ToolContext) => {
    const filePath = isAbsolute(input.path) ? input.path : resolve(ctx.workspace, input.path);
    writeFileSync(filePath, input.content, 'utf-8');
    return `已写入 ${input.path}`;
  },
});

/** 列出目录工具 */
export const ListDirTool = defineTool({
  name: 'list_dir',
  description: '列出目录内容',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: '目录路径' },
    },
    required: ['path'],
  } satisfies JSONSchema,
  execute: async (input: unknown, ctx: ToolContext) => {
    // 兼容多种输入格式
    let path: string;
    if (typeof input === 'string') {
      path = input;
    } else if (input && typeof input === 'object') {
      const obj = input as Record<string, unknown>;
      path = String(obj.path ?? obj.action_input ?? '');
    } else {
      return '错误: 无效的输入格式';
    }

    const dirPath = isAbsolute(path) ? path : resolve(ctx.workspace, path);

    if (!existsSync(dirPath)) {
      return `错误: 目录不存在 ${path}`;
    }

    const stat = statSync(dirPath);
    if (!stat.isDirectory()) {
      return `错误: ${path} 不是目录`;
    }

    const entries = readdirSync(dirPath, { withFileTypes: true });
    const lines = entries.map(e => {
      const isDir = e.isDirectory();
      return `${isDir ? 'DIR' : 'FILE'} ${e.name}`;
    });

    return lines.length > 0 ? lines.join('\n') : '(空目录)';
  },
});

/** 文件系统工具类数组（用于兼容旧代码） */
export const filesystemTools: Tool[] = [ReadFileTool, WriteFileTool, ListDirTool];
