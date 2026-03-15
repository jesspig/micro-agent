/**
 * MCP 工具包装器
 *
 * 将 MCP 服务器提供的工具包装为 MicroAgent 原生工具
 */

import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { ITool } from "../../../runtime/contracts.js";
import type { ToolDefinition } from "../../../runtime/types.js";
import type { MCPToolDefinition, MCPToolResult } from "./types.js";
import { callMCPTool } from "./client.js";

// ============================================================================
// MCPToolWrapper 类
// ============================================================================

/**
 * MCP 工具包装器
 *
 * 将单个 MCP 工具包装为 MicroAgent 工具接口
 */
export class MCPToolWrapper implements ITool {
  /** 工具名称：mcp_{服务器名}_{工具名} */
  readonly name: string;

  /** 工具描述 */
  readonly description: string;

  /** 参数 Schema */
  readonly parameters: MCPToolDefinition["inputSchema"];

  /** MCP 客户端实例 */
  private client: Client;

  /** 原始工具名（不含前缀） */
  private originalName: string;

  /** 超时时间（毫秒） */
  private timeout: number;

  /**
   * 创建 MCP 工具包装器
   */
  constructor(
    serverName: string,
    toolDef: MCPToolDefinition,
    client: Client,
    timeout = 30000
  ) {
    this.name = `mcp_${serverName}_${toolDef.name}`;
    this.description = toolDef.description ?? toolDef.name;
    this.parameters = toolDef.inputSchema;
    this.client = client;
    this.originalName = toolDef.name;
    this.timeout = timeout;
  }

  /**
   * 获取工具定义
   */
  getDefinition(): ToolDefinition {
    return {
      name: this.name,
      description: this.description,
      parameters: this.parameters as ToolDefinition["parameters"],
    };
  }

  /**
   * 执行工具
   */
  async execute(params: Record<string, unknown>): Promise<string> {
    const result = await callMCPTool(
      this.client,
      this.originalName,
      params,
      this.timeout
    );

    return this.formatResult(result);
  }

  /**
   * 格式化执行结果
   */
  private formatResult(result: MCPToolResult): string {
    if (result.isError) {
      const errorText = result.content
        .map((c) => c.text)
        .join("\n");
      return `MCP 工具错误: ${errorText}`;
    }

    const parts = result.content.map((c) => c.text);
    return parts.join("\n") || "(无输出)";
  }
}