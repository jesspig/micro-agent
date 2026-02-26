/**
 * MCP 命令实现
 *
 * 启动 MCP Server，暴露工具给 MCP 客户端。
 */

import { createMCPServer, type MCPServerConfig } from '@micro-agent/server'
import type { MCPToolDefinition, MCPToolResult } from '@micro-agent/providers'

/** MCP 命令配置 */
export interface MCPCommandConfig {
  /** 服务器名称 */
  name?: string
  /** 服务器版本 */
  version?: string
  /** 说明文本 */
  instructions?: string
}

/**
 * 运行 MCP 命令
 */
export async function runMCPCommand(config: MCPCommandConfig): Promise<void> {
  const serverConfig: MCPServerConfig = {
    serverInfo: {
      name: config.name ?? 'micro-agent',
      version: config.version ?? '0.1.0',
    },
    instructions: config.instructions,
  }

  const server = createMCPServer(serverConfig)

  // 注册示例工具
  server.registerTool(
    {
      name: 'echo',
      description: '返回输入文本',
      inputSchema: {
        type: 'object',
        properties: {
          text: { type: 'string', description: '要返回的文本' },
        },
        required: ['text'],
      },
    },
    async (name, args): Promise<MCPToolResult> => {
      const text = args.text as string
      return {
        content: [{ type: 'text', text }],
      }
    }
  )

  // 注册时间工具
  server.registerTool(
    {
      name: 'get_current_time',
      description: '获取当前时间',
      inputSchema: {
        type: 'object',
        properties: {
          timezone: { type: 'string', description: '时区 (如 Asia/Shanghai)' },
        },
      },
    },
    async (name, args): Promise<MCPToolResult> => {
      const timezone = args.timezone as string | undefined
      const now = new Date()
      const options: Intl.DateTimeFormatOptions = {
        timeZone: timezone ?? 'UTC',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }
      const timeStr = now.toLocaleString('zh-CN', options)
      return {
        content: [{ type: 'text', text: timeStr }],
      }
    }
  )

  // 启动 stdio 模式
  console.error(`[MCP] Starting ${serverConfig.serverInfo.name} v${serverConfig.serverInfo.version}`)
  await server.startStdio()
}

/** MCP 命令定义 */
export const mcpCommand = {
  command: 'mcp',
  description: '启动 MCP Server (stdio 模式)',
  options: [
    { name: 'name', alias: 'n', description: '服务器名称', type: 'string' },
    { name: 'version', alias: 'v', description: '服务器版本', type: 'string' },
  ],
  action: async (options: Record<string, unknown>) => {
    await runMCPCommand({
      name: options.name as string | undefined,
      version: options.version as string | undefined,
    })
  },
}
