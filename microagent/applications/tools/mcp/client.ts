/**
 * MCP 客户端实现
 *
 * 使用官方 @modelcontextprotocol/sdk
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type {
  MCPServerConfig,
  MCPToolDefinition,
  MCPToolResult,
} from "./types.js";

// ============================================================================
// MCP 客户端封装
// ============================================================================

/**
 * MCP 客户端连接结果
 */
export interface MCPConnectionResult {
  client: Client;
  tools: MCPToolDefinition[];
  close: () => Promise<void>;
}

// ============================================================================
// MCP 客户端工厂
// ============================================================================

/**
 * 创建并连接 MCP 客户端
 */
export async function connectMCPServer(
  _name: string,
  config: MCPServerConfig
): Promise<MCPConnectionResult> {
  // 自动检测传输类型
  let transportType = config.type;
  if (!transportType) {
    if (config.command) {
      transportType = "stdio";
    } else if (config.url) {
      // URL 以 /sse 结尾使用 SSE，否则尝试 StreamableHTTP
      transportType = config.url.endsWith("/sse") ? "sse" : "streamableHttp";
    }
  }

  // 创建传输层
  const transport = createTransport(transportType, config);

  // 创建客户端
  const client = new Client(
    { name: "micro-agent", version: "0.1.0" },
    { capabilities: {} }
  );

  // 连接服务器
  await client.connect(transport as Parameters<Client["connect"]>[0]);

  // 获取工具列表
  const { tools } = await client.listTools();

  // 转换工具定义格式
  const mcpTools: MCPToolDefinition[] = tools.map((tool) => ({
    name: tool.name,
    description: tool.description ?? tool.name,
    inputSchema: tool.inputSchema as MCPToolDefinition["inputSchema"],
  }));

  // 创建关闭函数（确保终止子进程）
  const close = async () => {
    await client.close();

    // 显式终止子进程（修复 SDK 不终止子进程的问题）
    // StdioClientTransport 有 pid getter 可以获取进程 ID
    if (transport instanceof StdioClientTransport) {
      const pid = (transport as StdioClientTransport & { pid: number | null }).pid;
      if (pid) {
        // 在 Windows 上使用 taskkill 静默终止进程树
        if (process.platform === "win32") {
          try {
            const { execSync } = await import("node:child_process");
            // 使用 /F 强制终止，/T 终止进程树
            execSync(`taskkill /pid ${pid} /T /F`, {
              stdio: "ignore", // 隐藏输出
            });
          } catch {
            // taskkill 失败时回退到普通 kill
            process.kill(pid, "SIGKILL");
          }
        } else {
          // Unix 系统使用 SIGTERM 然后 SIGKILL
          try {
            process.kill(pid, "SIGTERM");
            // 给进程 3 秒时间优雅退出
            await new Promise<void>((resolve) => {
              const timeout = setTimeout(() => {
                try {
                  process.kill(pid, "SIGKILL");
                } catch {
                  // 进程可能已经退出
                }
                resolve();
              }, 3000);
              // 检查进程是否退出
              const checkInterval = setInterval(() => {
                try {
                  process.kill(pid, 0); // 检查进程是否存在
                } catch {
                  // 进程已退出
                  clearTimeout(timeout);
                  clearInterval(checkInterval);
                  resolve();
                }
              }, 100);
            });
          } catch {
            // 进程可能已经退出
          }
        }
      }
    }
  };

  return { client, tools: mcpTools, close };
}

/**
 * 创建传输层
 */
function createTransport(
  transportType: string | undefined,
  config: MCPServerConfig
): StdioClientTransport | SSEClientTransport | StreamableHTTPClientTransport {
  switch (transportType) {
    case "stdio": {
      if (!config.command) {
        throw new Error("stdio 模式需要配置 command");
      }
      // 过滤 undefined 值
      const baseEnv: Record<string, string> = {};
      for (const [key, value] of Object.entries(process.env)) {
        if (value !== undefined) {
          baseEnv[key] = value;
        }
      }
      return new StdioClientTransport({
        command: config.command,
        args: config.args ?? [],
        env: config.env ? { ...baseEnv, ...config.env } : baseEnv,
        // 隐藏子进程的 stderr 输出（避免 Python 进程终止时的堆栈跟踪）
        stderr: "ignore",
      });
    }

    case "sse": {
      if (!config.url) {
        throw new Error("sse 模式需要配置 url");
      }
      return new SSEClientTransport(new URL(config.url), {
        requestInit: {
          headers: config.headers,
        },
      });
    }

    case "streamableHttp": {
      if (!config.url) {
        throw new Error("streamableHttp 模式需要配置 url");
      }
      return new StreamableHTTPClientTransport(new URL(config.url), {
        requestInit: {
          headers: config.headers,
        },
      });
    }

    default:
      throw new Error(`不支持的传输类型: ${transportType}`);
  }
}

/**
 * 调用 MCP 工具
 */
export async function callMCPTool(
  client: Client,
  toolName: string,
  args: Record<string, unknown>,
  timeout?: number
): Promise<MCPToolResult> {
  const controller = new AbortController();
  const timeoutId = timeout
    ? setTimeout(() => controller.abort(), timeout)
    : undefined;

  try {
    const result = await client.callTool(
      { name: toolName, arguments: args },
      undefined,
      { signal: controller.signal }
    );

    // 转换结果格式
    const content: MCPToolResult["content"] = [];
    const isError = result.isError === true;

    if (result.content && Array.isArray(result.content)) {
      for (const block of result.content) {
        if (block.type === "text" && "text" in block) {
          content.push({ type: "text", text: block.text });
        } else {
          content.push({ type: block.type, text: JSON.stringify(block) });
        }
      }
    }

    return { content, isError };
  } catch (error) {
    if (controller.signal.aborted) {
      return {
        content: [{ type: "text", text: `MCP 工具调用超时 (${timeout}ms)` }],
        isError: true,
      };
    }
    return {
      content: [
        {
          type: "text",
          text: `MCP 工具调用失败: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}