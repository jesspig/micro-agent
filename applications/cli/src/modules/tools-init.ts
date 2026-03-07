/**
 * 工具初始化模块
 *
 * 为 Agent Service 准备工具配置数据。
 * 此模块仅负责准备配置数据，不负责实际注册。
 */

/**
 * 工具配置接口
 */
export interface ToolConfig {
  /** 工具名称 */
  name: string;
  /** 工具描述 */
  description: string;
  /** 是否启用 */
  enabled: boolean;
}

/**
 * 内置工具配置列表
 *
 * 包含所有内置工具的基本配置信息。
 * 与旧版 CLI 的 registerBuiltinTools 保持一致。
 */
const BUILTIN_TOOLS: ToolConfig[] = [
  {
    name: 'read_file',
    description: '读取文件内容。支持相对路径（相对于工作区）、~ 路径或绝对路径',
    enabled: true,
  },
  {
    name: 'write_file',
    description: '创建或覆盖文件。支持相对路径（相对于工作区）、~ 路径或绝对路径',
    enabled: true,
  },
  {
    name: 'list_dir',
    description: '列出目录内容。支持相对路径（相对于工作区）、~ 路径或绝对路径',
    enabled: true,
  },
  {
    name: 'exec',
    description: '执行命令或脚本。支持 JS/TS 脚本、Shell 命令、Python 脚本',
    enabled: true,
  },
  {
    name: 'web_fetch',
    description: '获取网页内容。仅允许 HTTP/HTTPS 协议',
    enabled: true,
  },
  {
    name: 'message',
    description: '发送消息到指定通道',
    enabled: true,
  },
];

/**
 * 获取内置工具配置列表
 *
 * 返回所有内置工具的配置信息。
 * 配置将传递给 Agent Service 进行实际工具注册。
 *
 * @returns 内置工具配置数组
 */
export function getBuiltinToolConfigs(): ToolConfig[] {
  return [...BUILTIN_TOOLS];
}

/**
 * 获取启用的工具名称列表
 *
 * 返回所有 enabled=true 的工具名称。
 * 用于启动时显示已加载的工具列表。
 *
 * @returns 启用的工具名称数组
 */
export function getEnabledTools(): string[] {
  return BUILTIN_TOOLS.filter(tool => tool.enabled).map(tool => tool.name);
}

/**
 * 获取工具数量统计
 *
 * @returns 包含总数和启用数的统计对象
 */
export function getToolStats(): { total: number; enabled: number } {
  return {
    total: BUILTIN_TOOLS.length,
    enabled: BUILTIN_TOOLS.filter(tool => tool.enabled).length,
  };
}
