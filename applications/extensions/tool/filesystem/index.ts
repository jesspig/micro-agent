/**
 * 文件系统工具扩展
 *
 * 提供文件读取、写入、目录列表功能。
 *
 * 允许访问的目录：
 * - 工作区（workspace）- 用户项目文件，默认 ~/.micro-agent/workspace
 * - 知识库 - ~/.micro-agent/knowledge/
 * - 上下文文件 - ~/.micro-agent/*.md（SOUL.md, USER.md, AGENTS.md 等）
 * - 用户配置 - ~/.micro-agent/settings.yaml
 *
 * 禁止访问：
 * - node_modules 目录
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'fs';
import { resolve, isAbsolute, normalize } from 'path';
import { homedir } from 'os';
import { defineTool } from '@micro-agent/sdk';
import type { Tool, JSONSchema, ToolContext } from '@micro-agent/types';

/** 获取 MicroAgent 主目录 */
function getMicroAgentHome(): string {
  return resolve(homedir(), '.micro-agent');
}

/**
 * 解析路径，支持：
 * - ~ 开头：用户主目录
 * - 相对路径：相对于工作区
 * - 绝对路径：保持不变
 */
function resolvePath(path: string, workspace: string): string {
  // 处理 ~ 或 ~/ 开头的路径
  if (path.startsWith('~/')) {
    return resolve(homedir(), path.slice(2));
  }
  if (path.startsWith('~')) {
    return resolve(homedir(), path.slice(1));
  }
  // 绝对路径直接返回
  if (isAbsolute(path)) {
    return path;
  }
  // 相对路径：相对于工作区
  return resolve(workspace, path);
}

/**
 * 验证路径是否允许访问
 * @param targetPath 目标路径（已解析为绝对路径）
 * @param workspace 工作区路径
 * @returns 验证结果，失败时返回错误信息
 */
function validatePathAccess(targetPath: string, workspace: string): { allowed: boolean; error?: string } {
  // 解析真实路径（处理符号链接和 .. 等）
  let resolvedTarget: string;
  try {
    // 先规范化路径，再检查
    const normalized = normalize(targetPath);
    resolvedTarget = resolve(normalized);
  } catch {
    return { allowed: false, error: '无效的路径格式' };
  }
  
  // 统一路径分隔符（Windows 上同时存在 / 和 \）
  const toComparable = (p: string) => p.toLowerCase().replace(/\//g, '\\').replace(/\\+/g, '\\');
  
  const normalizedTarget = toComparable(resolvedTarget);
  const microAgentHome = toComparable(getMicroAgentHome());
  const normalizedWorkspace = toComparable(workspace);

  // 检查是否在 node_modules 内（全局禁止）- 使用路径组件检查
  const pathParts = normalizedTarget.split(/[/\\]/);
  if (pathParts.includes('node_modules')) {
    return {
      allowed: false,
      error: `访问被拒绝：禁止访问 node_modules 目录`,
    };
  }

  // 检查路径遍历攻击模式
  if (normalizedTarget.includes('..') || targetPath.includes('..')) {
    return {
      allowed: false,
      error: `访问被拒绝：检测到路径遍历尝试`,
    };
  }

  // 1. 检查是否在工作区内
  if (normalizedTarget.startsWith(normalizedWorkspace)) {
    return { allowed: true };
  }

  // 2. 检查是否在 ~/.micro-agent 目录内（知识库、上下文、配置）
  if (normalizedTarget.startsWith(microAgentHome)) {
    return { allowed: true };
  }

  return {
    allowed: false,
    error: `访问被拒绝：路径必须在允许的目录内（工作区或 ~/.micro-agent）`,
  };
}

/** 读取文件工具 */
export const ReadFileTool = defineTool({
  name: 'read_file',
  description: '读取文件内容。支持相对路径（相对于工作区）、~ 路径或绝对路径。可访问：工作区、~/.micro-agent/ 目录',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: '文件路径（如 "README.md"、"~/.micro-agent/USER.md" 或绝对路径）' },
      limit: { type: 'number', description: '最大读取行数（可选）' },
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

    const filePath = resolvePath(path, ctx.workspace);

    // 验证路径访问权限
    const validation = validatePathAccess(filePath, ctx.workspace);
    if (!validation.allowed) {
      return `错误: ${validation.error}`;
    }

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
  description: '创建或覆盖文件。支持相对路径（相对于工作区）、~ 路径或绝对路径。可访问：工作区、~/.micro-agent/ 目录',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: '文件路径（如 "file.txt"、"~/.micro-agent/USER.md" 或绝对路径）' },
      content: { type: 'string', description: '文件内容' },
    },
    required: ['path', 'content'],
  } satisfies JSONSchema,
  execute: async (input: { path: string; content: string }, ctx: ToolContext) => {
    const filePath = resolvePath(input.path, ctx.workspace);

    // 验证路径访问权限
    const validation = validatePathAccess(filePath, ctx.workspace);
    if (!validation.allowed) {
      return `错误: ${validation.error}`;
    }

    writeFileSync(filePath, input.content, 'utf-8');
    return `已写入 ${input.path}`;
  },
});

/** 列出目录工具 */
export const ListDirTool = defineTool({
  name: 'list_dir',
  description: '列出目录内容。支持相对路径（相对于工作区）、~ 路径或绝对路径。可访问：工作区、~/.micro-agent/ 目录',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: '目录路径（如 "."、"~/.micro-agent/knowledge" 或绝对路径）' },
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

    const dirPath = resolvePath(path, ctx.workspace);

    // 验证路径访问权限
    const validation = validatePathAccess(dirPath, ctx.workspace);
    if (!validation.allowed) {
      return `错误: ${validation.error}`;
    }

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
