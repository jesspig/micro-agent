/**
 * MCP 服务器管理器
 *
 * 负责加载配置、连接 MCP 服务器、注册工具
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ITool } from "../../../runtime/contracts.js";
import { connectMCPServer, type MCPConnectionResult } from "./client.js";
import { MCPToolWrapper } from "./wrapper.js";
import type { MCPConfig, MCPServerConfig, MCPServerInfo } from "./types.js";
import { resolveEnvVars } from "../../config/env-resolver.js";
import { AGENT_DIR } from "../../shared/constants.js";
import { getLogger } from "../../shared/logger.js";

// ============================================================================
// MCP 服务器管理器
// ============================================================================

/**
 * MCP 服务器管理器
 *
 * 管理 MCP 服务器的生命周期和工具注册
 */
export class MCPManager {
  private readonly logger = getLogger();
  private connections = new Map<string, MCPConnectionResult>();
  private tools = new Map<string, MCPToolWrapper>();
  private serverInfo = new Map<string, MCPServerInfo>();
  private config: MCPConfig | null = null;

  /**
   * 加载 MCP 配置
   */
  async loadConfig(configPath?: string): Promise<MCPConfig> {
    const path = configPath || join(AGENT_DIR, "mcp.json");

    try {
      this.logger.debug(`加载 MCP 配置: ${path}`);
      const content = await readFile(path, "utf-8");
      const rawConfig = JSON.parse(content);

      // 解析环境变量
      this.config = this.resolveEnvInConfig(rawConfig);
      this.logger.info(`MCP 配置已加载: ${Object.keys(this.config.mcpServers).length} 个服务器`);
      return this.config;
    } catch (error) {
      // 配置文件不存在或解析失败，返回空配置
      this.logger.warn(`MCP 配置加载失败: ${path}`, { error: error instanceof Error ? error.message : String(error) });
      this.config = { mcpServers: {} };
      return this.config;
    }
  }

  /**
   * 连接所有已启用的 MCP 服务器
   */
  async connectAll(
    onRegister?: (tool: ITool, serverName: string) => void
  ): Promise<MCPServerInfo[]> {
    if (!this.config) {
      await this.loadConfig();
    }

    const results: MCPServerInfo[] = [];

    for (const [name, serverConfig] of Object.entries(
      this.config!.mcpServers
    )) {
      if (serverConfig.disabled) {
        this.serverInfo.set(name, {
          name,
          status: "disconnected",
          toolCount: 0,
        });
        results.push(this.serverInfo.get(name)!);
        continue;
      }

      const info = await this.connectServer(name, serverConfig, onRegister);
      results.push(info);
    }

    return results;
  }

  /**
   * 连接单个 MCP 服务器
   */
  async connectServer(
    name: string,
    config: MCPServerConfig,
    onRegister?: (tool: ITool, serverName: string) => void
  ): Promise<MCPServerInfo> {
    this.serverInfo.set(name, { name, status: "connecting", toolCount: 0 });

    try {
      // 连接服务器
      const connection = await connectMCPServer(name, config);

      // 注册工具
      for (const toolDef of connection.tools) {
        const wrapper = new MCPToolWrapper(
          name,
          toolDef,
          connection.client,
          config.toolTimeout ?? 30000
        );

        this.tools.set(wrapper.name, wrapper);
        onRegister?.(wrapper, name);
      }

      // 保存连接
      this.connections.set(name, connection);

      const info: MCPServerInfo = {
        name,
        status: "connected",
        toolCount: connection.tools.length,
        connectedAt: Date.now(),
      };
      this.serverInfo.set(name, info);

      this.logger.info(
        `MCP 服务器 '${name}' 已连接，注册 ${connection.tools.length} 个工具`
      );

      return info;
    } catch (error) {
      const info: MCPServerInfo = {
        name,
        status: "error",
        toolCount: 0,
        error: error instanceof Error ? error.message : String(error),
      };
      this.serverInfo.set(name, info);

      this.logger.error(
        `MCP 服务器 '${name}' 连接失败: ${error instanceof Error ? error.message : String(error)}`
      );

      return info;
    }
  }

  /**
   * 获取所有 MCP 工具
   */
  getTools(): ITool[] {
    return Array.from(this.tools.values());
  }

  /**
   * 获取服务器状态列表
   */
  getServerInfo(): MCPServerInfo[] {
    return Array.from(this.serverInfo.values());
  }

  /**
   * 关闭所有连接
   */
  async closeAll(): Promise<void> {
    for (const [name, connection] of this.connections) {
      try {
        await connection.close();
        this.logger.debug(`MCP 服务器 '${name}' 已断开`);
      } catch (error) {
        this.logger.error(
          `MCP 服务器 '${name}' 断开失败: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    this.connections.clear();
    this.tools.clear();
    this.serverInfo.clear();
  }

  // ============================================================================
  // 私有方法
  // ============================================================================

  /**
   * 解析配置中的环境变量
   */
  private resolveEnvInConfig(config: MCPConfig): MCPConfig {
    const resolved: MCPConfig = {
      mcpServers: {},
    };

    if (config.globalSettings) {
      resolved.globalSettings = config.globalSettings;
    }

    for (const [name, server] of Object.entries(config.mcpServers)) {
      const resolvedConfig: MCPServerConfig = {
        disabled: server.disabled ?? false,
        args: server.args ? server.args.map((arg) => resolveEnvVars(arg)) : [],
        ...(server.type && { type: server.type }),
        ...(server.command && { command: server.command }),
        ...(server.env && {
          env: Object.fromEntries(
            Object.entries(server.env).map(([k, v]) => [k, resolveEnvVars(v)])
          ),
        }),
        ...(server.url && { url: resolveEnvVars(server.url) }),
        ...(server.headers && { headers: server.headers }),
        ...(server.toolTimeout && { toolTimeout: server.toolTimeout }),
        ...(server.description && { description: server.description }),
      };
      resolved.mcpServers[name] = resolvedConfig;
    }

    return resolved;
  }
}

// ============================================================================
// 单例导出
// ============================================================================

/** 全局 MCP 管理器实例 */
export const mcpManager = new MCPManager();