/**
 * MCP 命令实现
 *
 * 启动 MCP (Model Context Protocol) Server，通过 stdio 暴露工具给 MCP 客户端。
 * @see https://modelcontextprotocol.io
 */

import { createMCPServer, type MCPServerConfig, type ToolHandler } from '@micro-agent/server';
import type { MCPToolResult } from '@micro-agent/providers';

/** MCP 命令配置 */
export interface MCPCommandConfig {
  /** 服务器名称 */
  name?: string;
  /** 服务器版本 */
  version?: string;
  /** 说明文本 */
  instructions?: string;
}

/**
 * 显示帮助信息
 */
function showHelp(): void {
  console.log(`
MCP 服务命令

用法:
  micro-agent mcp [子命令] [选项]

子命令:
  stdio         启动 stdio 模式（默认）

选项:
  --name <name>       服务器名称（默认 micro-agent）
  --version <ver>     服务器版本（默认 0.1.0）
  --help              显示帮助

说明:
  MCP (Model Context Protocol) 是一种让 AI 助手与外部工具交互的协议。
  stdio 模式通过标准输入/输出通信，适用于 Claude Desktop 等客户端。

示例:
  micro-agent mcp                    # 启动 stdio 模式
  micro-agent mcp stdio              # 同上
  micro-agent mcp --name my-server
`);
}

/**
 * 解析命令行参数
 */
function parseArgs(args: string[]): { mode: 'stdio'; config: MCPCommandConfig; showHelp: boolean } {
  const config: MCPCommandConfig = {};
  let mode: 'stdio' = 'stdio';

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    // 子命令
    if (arg === 'stdio') {
      mode = 'stdio';
      continue;
    }

    // 选项
    if (arg === '--name' || arg === '-n') {
      const value = args[++i];
      if (value) {
        config.name = value;
      }
    } else if (arg === '--version' || arg === '-v') {
      const value = args[++i];
      if (value) {
        config.version = value;
      }
    } else if (arg === '--help' || arg === '-h') {
      return { mode, config, showHelp: true };
    }
  }

  return { mode, config, showHelp: false };
}

/**
 * 注册内置工具
 *
 * 提供基础的示例工具，用于测试和演示。
 */
function registerBuiltinTools(
  server: ReturnType<typeof createMCPServer>,
  config: MCPCommandConfig
): void {
  // Echo 工具 - 返回输入文本
  server.registerTool(
    {
      name: 'echo',
      description: '返回输入文本，用于测试 MCP 连接',
      inputSchema: {
        type: 'object',
        properties: {
          text: { type: 'string', description: '要返回的文本' },
        },
        required: ['text'],
      },
    },
    (async (_name, args): Promise<MCPToolResult> => {
      const text = args.text as string;
      return {
        content: [{ type: 'text', text }],
      };
    }) as ToolHandler
  );

  // 时间工具 - 获取当前时间
  server.registerTool(
    {
      name: 'get_current_time',
      description: '获取当前时间',
      inputSchema: {
        type: 'object',
        properties: {
          timezone: {
            type: 'string',
            description: '时区 (如 Asia/Shanghai)',
          },
        },
      },
    },
    (async (_name, args): Promise<MCPToolResult> => {
      const timezone = args.timezone as string | undefined;
      const now = new Date();
      const options: Intl.DateTimeFormatOptions = {
        timeZone: timezone ?? 'UTC',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      };
      const timeStr = now.toLocaleString('zh-CN', options);
      return {
        content: [{ type: 'text', text: timeStr }],
      };
    }) as ToolHandler
  );

  // 服务信息工具
  server.registerTool(
    {
      name: 'get_server_info',
      description: '获取 MCP 服务器信息',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    (async (): Promise<MCPToolResult> => {
      const info = {
        name: config.name ?? 'micro-agent',
        version: config.version ?? '0.1.0',
        protocol: 'MCP',
        startTime: new Date().toISOString(),
      };
      return {
        content: [{ type: 'text', text: JSON.stringify(info, null, 2) }],
      };
    }) as ToolHandler
  );
}

/**
 * 运行 MCP stdio 模式
 */
async function runStdioMode(config: MCPCommandConfig): Promise<void> {
  const serverConfig: MCPServerConfig = {
    serverInfo: {
      name: config.name ?? 'micro-agent',
      version: config.version ?? '0.1.0',
    },
    instructions: config.instructions ?? 'MicroAgent MCP Server - 提供 AI 助手工具调用能力',
  };

  const server = createMCPServer(serverConfig);

  // 注册内置工具
  registerBuiltinTools(server, config);

  // 输出启动信息到 stderr（stdout 用于 MCP 协议通信）
  console.error('');
  console.error('\x1b[1m\x1b[36m启动 MCP Server (stdio 模式)\x1b[0m');
  console.error('─'.repeat(50));
  console.error(`  \x1b[2m名称:\x1b[0m ${serverConfig.serverInfo.name}`);
  console.error(`  \x1b[2m版本:\x1b[0m ${serverConfig.serverInfo.version}`);
  console.error(`  \x1b[2m模式:\x1b[0m stdio`);
  console.error('');
  console.error('\x1b[1m已注册工具:\x1b[0m');
  console.error('  \x1b[32m•\x1b[0m echo - 返回输入文本');
  console.error('  \x1b[32m•\x1b[0m get_current_time - 获取当前时间');
  console.error('  \x1b[32m•\x1b[0m get_server_info - 获取服务器信息');
  console.error('');
  console.error('\x1b[2m通过 stdin/stdout 通信，按 Ctrl+C 停止\x1b[0m');
  console.error('─'.repeat(50));
  console.error('');

  // 启动 stdio 模式
  await server.startStdio();
}

/**
 * 执行 MCP 命令
 * @param args - 命令参数
 */
export async function runMCPCommand(args: string[]): Promise<void> {
  const { mode, config, showHelp: shouldShowHelp } = parseArgs(args);

  if (shouldShowHelp) {
    showHelp();
    return;
  }

  // 目前只支持 stdio 模式
  if (mode === 'stdio') {
    await runStdioMode(config);
  }
}
