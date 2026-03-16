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
import {
  mcpLogger,
  createTimer,
  sanitize,
  logMethodCall,
  logMethodReturn,
  logMethodError,
} from "../../shared/logger.js";

const logger = mcpLogger();
const MODULE_NAME = "MCPToolWrapper";

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

    logger.info("MCP工具包装器创建", {
      toolName: this.name,
      serverName,
      originalName: toolDef.name,
      timeout,
    });
  }

  /**
   * 获取工具定义
   */
  getDefinition(): ToolDefinition {
    const timer = createTimer();
    logMethodCall(logger, {
      method: "getDefinition",
      module: MODULE_NAME,
      params: { toolName: this.name },
    });

    const definition: ToolDefinition = {
      name: this.name,
      description: this.description,
      parameters: this.parameters as ToolDefinition["parameters"],
    };

    logMethodReturn(logger, {
      method: "getDefinition",
      module: MODULE_NAME,
      result: sanitize({ name: this.name }),
      duration: timer(),
    });

    return definition;
  }

  /**
   * 执行工具
   */
  async execute(params: Record<string, unknown>): Promise<string> {
    const timer = createTimer();
    logMethodCall(logger, {
      method: "execute",
      module: MODULE_NAME,
      params: { toolName: this.name, originalName: this.originalName, arguments: params },
    });

    try {
      logger.info("执行MCP工具", {
        toolName: this.name,
        originalName: this.originalName,
        timeout: this.timeout,
      });

      const result = await callMCPTool(
        this.client,
        this.originalName,
        params,
        this.timeout
      );

      const formatted = this.formatResult(result);

      logMethodReturn(logger, {
        method: "execute",
        module: MODULE_NAME,
        result: sanitize({ isError: result.isError, outputLength: formatted.length }),
        duration: timer(),
      });

      return formatted;
    } catch (error) {
      const err = error as Error;
      logMethodError(logger, {
        method: "execute",
        module: MODULE_NAME,
        error: { name: err.name, message: err.message, stack: err.stack },
        params: { toolName: this.name },
        duration: timer(),
      });
      throw error;
    }
  }

  /**
   * 格式化执行结果
   */
  private formatResult(result: MCPToolResult): string {
    const timer = createTimer();
    logMethodCall(logger, {
      method: "formatResult",
      module: MODULE_NAME,
      params: { isError: result.isError, contentCount: result.content.length },
    });

    let output: string;

    if (result.isError) {
      const errorText = result.content
        .map((c) => c.text)
        .join("\n");
      output = `MCP 工具错误: ${errorText}`;
    } else {
      const parts = result.content.map((c) => c.text);
      output = parts.join("\n") || "(无输出)";
    }

    logMethodReturn(logger, {
      method: "formatResult",
      module: MODULE_NAME,
      result: sanitize({ outputLength: output.length }),
      duration: timer(),
    });

    return output;
  }
}
