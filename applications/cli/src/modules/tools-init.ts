/**
 * 工具初始化模块
 *
 * 提供十个核心工具：read、write、exec、glob、grep、edit、list_directory、todo_write、todo_read、ask_user
 * 更高级的功能由 skills 和 MCP 提供。
 */

import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { Tool, BuiltinToolProvider } from '@micro-agent/sdk/runtime';
import {
  coreTools,
  ReadTool,
  WriteTool,
  ExecTool,
  GlobTool,
  GrepTool,
  EditTool,
  ListDirectoryTool,
  TodoWriteTool,
  TodoReadTool,
  AskUserTool,
} from '../builtin/tool';

/**
 * 获取内置工具目录路径
 *
 * 返回内置工具模块的绝对路径，用于 IPC 模式下 Agent Service 动态加载。
 */
export function getBuiltinToolsPath(): string {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  // 从 applications/cli/src/modules 到 applications/cli/src/builtin/tool
  return resolve(currentDir, '../builtin/tool');
}

/**
 * 工具配置接口
 */
export interface ToolConfig {
  name: string;
  description: string;
  enabled: boolean;
}

/**
 * 核心工具配置列表
 */
const BUILTIN_TOOLS: ToolConfig[] = [
  {
    name: 'read',
    description: '读取文件内容。支持分页读取大文件。',
    enabled: true,
  },
  {
    name: 'write',
    description: '写入文件内容。目录不存在时自动创建。',
    enabled: true,
  },
  {
    name: 'exec',
    description: '执行 Shell 命令。支持 JS/TS/Python 脚本。',
    enabled: true,
  },
  {
    name: 'glob',
    description: '按 glob 模式查找文件。',
    enabled: true,
  },
  {
    name: 'grep',
    description: '在文件内容中搜索正则表达式。',
    enabled: true,
  },
  {
    name: 'edit',
    description: '精确编辑文件，查找并替换文本。',
    enabled: true,
  },
  {
    name: 'list_directory',
    description: '列出目录内容，支持 ignore 和 gitignore。',
    enabled: true,
  },
  {
    name: 'todo_write',
    description: '创建和管理任务列表。',
    enabled: true,
  },
  {
    name: 'todo_read',
    description: '读取当前任务列表。',
    enabled: true,
  },
  {
    name: 'ask_user',
    description: '向用户提问并获取选择。',
    enabled: true,
  },
];

/**
 * 获取内置工具配置列表
 */
export function getBuiltinToolConfigs(): ToolConfig[] {
  return [...BUILTIN_TOOLS];
}

/**
 * 获取启用的工具名称列表
 */
export function getEnabledTools(): string[] {
  return BUILTIN_TOOLS.filter(tool => tool.enabled).map(tool => tool.name);
}

/**
 * 获取工具数量统计
 */
export function getToolStats(): { total: number; enabled: number } {
  return {
    total: BUILTIN_TOOLS.length,
    enabled: BUILTIN_TOOLS.filter(tool => tool.enabled).length,
  };
}

/**
 * CLI 工具提供者实现
 */
class CLIToolProvider implements BuiltinToolProvider {
  getTools(_workspace: string): Tool[] {
    return coreTools;
  }

  getToolsPath(): string | null {
    return getBuiltinToolsPath();
  }
}

/** 单例工具提供者实例 */
const cliToolProvider = new CLIToolProvider();

/**
 * 获取 CLI 工具提供者
 */
export function getCLIToolProvider(): BuiltinToolProvider {
  return cliToolProvider;
}

// 单独导出工具（供需要单独引用的场景）
export {
  ReadTool,
  WriteTool,
  ExecTool,
  GlobTool,
  GrepTool,
  EditTool,
  ListDirectoryTool,
  TodoWriteTool,
  TodoReadTool,
  AskUserTool,
};