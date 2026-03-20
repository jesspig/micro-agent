/**
 * MCP 服务器管理器
 *
 * 负责加载配置、连接 MCP 服务器、注册工具
 */

import { readFile } from "node:fs/promises";
import type { ITool } from "../../../runtime/contracts.js";
import { connectMCPServer, type MCPConnectionResult } from "./client.js";
import { MCPToolWrapper } from "./wrapper.js";
import type { MCPConfig, MCPServerConfig, MCPServerInfo } from "./types.js";
import { resolveEnvVars } from "../../config/env-resolver.js";
import { MCP_CONFIG_FILE } from "../../shared/constants.js";
import {
  mcpLogger,
  createTimer,
  sanitize,
  logMethodCall,
  logMethodReturn,
  logMethodError,
} from "../../shared/logger.js";

const logger = mcpLogger();
const MODULE_NAME = "MCPManager";

// ============================================================================
// MCP 服务器管理器
// ============================================================================

/**
 * MCP 服务器管理器
 *
 * 管理 MCP 服务器的生命周期和工具注册
 */
export class MCPManager {
  private connections = new Map<string, MCPConnectionResult>();
  private tools = new Map<string, MCPToolWrapper>();
  private serverInfo = new Map<string, MCPServerInfo>();
  private config: MCPConfig | null = null;

  /**
   * 加载 MCP 配置
   */
  async loadConfig(configPath?: string): Promise<MCPConfig> {
    const timer = createTimer();
    logMethodCall(logger, {
      method: "loadConfig",
      module: MODULE_NAME,
      params: { configPath },
    });

    const path = configPath || MCP_CONFIG_FILE;

    try {
      const content = await readFile(path, "utf-8");
      const rawConfig = JSON.parse(content);

      // 解析环境变量
      this.config = this.resolveEnvInConfig(rawConfig);

      const serverCount = Object.keys(this.config.mcpServers).length;
      logger.info("MCP配置加载成功", { path, serverCount });

      logMethodReturn(logger, {
        method: "loadConfig",
        module: MODULE_NAME,
        result: sanitize({ serverCount }),
        duration: timer(),
      });

      return this.config;
    } catch (error) {
      // 配置文件不存在或解析失败，返回空配置
      this.config = { mcpServers: {} };

      const err = error as Error;
      logger.warn("MCP配置加载失败，使用空配置", {
        path,
        error: err.message,
      });

      logMethodReturn(logger, {
        method: "loadConfig",
        module: MODULE_NAME,
        result: sanitize({ serverCount: 0, fallback: true }),
        duration: timer(),
      });

      return this.config;
    }
  }

  /**
   * 连接所有已启用的 MCP 服务器
   */
  async connectAll(
    onRegister?: (tool: ITool, serverName: string) => void
  ): Promise<MCPServerInfo[]> {
    const timer = createTimer();
    logMethodCall(logger, {
      method: "connectAll",
      module: MODULE_NAME,
      params: {},
    });

    if (!this.config) {
      await this.loadConfig();
    }

    const results: MCPServerInfo[] = [];
    const serverEntries = Object.entries(this.config!.mcpServers);

    logger.info("开始连接所有MCP服务器", {
      serverCount: serverEntries.length,
    });

    for (const [name, serverConfig] of serverEntries) {
      if (serverConfig.disabled) {
        logger.info("跳过已禁用的MCP服务器", { serverName: name });
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

    const connectedCount = results.filter((r) => r.status === "connected").length;
    const errorCount = results.filter((r) => r.status === "error").length;

    logger.info("MCP服务器连接完成", {
      total: results.length,
      connected: connectedCount,
      errors: errorCount,
    });

    logMethodReturn(logger, {
      method: "connectAll",
      module: MODULE_NAME,
      result: sanitize({ total: results.length, connected: connectedCount, errors: errorCount }),
      duration: timer(),
    });

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
    const timer = createTimer();
    logMethodCall(logger, {
      method: "connectServer",
      module: MODULE_NAME,
      params: { serverName: name },
    });

    this.serverInfo.set(name, { name, status: "connecting", toolCount: 0 });

    try {
      logger.info("正在连接MCP服务器", { serverName: name });

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

      logger.info("MCP服务器连接成功", {
        serverName: name,
        toolCount: connection.tools.length,
      });

      logMethodReturn(logger, {
        method: "connectServer",
        module: MODULE_NAME,
        result: sanitize(info),
        duration: timer(),
      });

      return info;
    } catch (error) {
      const err = error as Error;
      const info: MCPServerInfo = {
        name,
        status: "error",
        toolCount: 0,
        error: err.message,
      };
      this.serverInfo.set(name, info);

      logger.error("MCP服务器连接失败", {
        serverName: name,
        error: err.message,
      });

      logMethodError(logger, {
        method: "connectServer",
        module: MODULE_NAME,
        error: { name: err.name, message: err.message, stack: err.stack },
        params: { serverName: name },
        duration: timer(),
      });

      return info;
    }
  }

  /**
   * 获取所有 MCP 工具
   */
  getTools(): ITool[] {
    const timer = createTimer();
    logMethodCall(logger, {
      method: "getTools",
      module: MODULE_NAME,
      params: {},
    });

    const tools = Array.from(this.tools.values());

    logMethodReturn(logger, {
      method: "getTools",
      module: MODULE_NAME,
      result: sanitize({ toolCount: tools.length }),
      duration: timer(),
    });

    return tools;
  }

  /**
   * 获取服务器状态列表
   */
  getServerInfo(): MCPServerInfo[] {
    const timer = createTimer();
    logMethodCall(logger, {
      method: "getServerInfo",
      module: MODULE_NAME,
      params: {},
    });

    const info = Array.from(this.serverInfo.values());

    logMethodReturn(logger, {
      method: "getServerInfo",
      module: MODULE_NAME,
      result: sanitize({ serverCount: info.length }),
      duration: timer(),
    });

    return info;
  }

  /**
   * 关闭所有连接
   */
  async closeAll(): Promise<void> {
    const timer = createTimer();
    logMethodCall(logger, {
      method: "closeAll",
      module: MODULE_NAME,
      params: {},
    });

    const connectionCount = this.connections.size;
    let errorCount = 0;

    for (const [name, connection] of this.connections) {
      try {
        await connection.close();
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        logger.warn("MCP连接关闭失败", { serverName: name, error: error.message });
        errorCount++;
      }
    }

    this.connections.clear();
    this.tools.clear();
    this.serverInfo.clear();

    logger.info("所有MCP连接已关闭", { closedCount: connectionCount, errorCount });

    logMethodReturn(logger, {
      method: "closeAll",
      module: MODULE_NAME,
      result: sanitize({ closedCount: connectionCount, errorCount }),
      duration: timer(),
    });
  }

  // ============================================================================
  // 私有方法
  // ============================================================================

  /**
   * 解析配置中的环境变量
   */
  private resolveEnvInConfig(config: MCPConfig): MCPConfig {
    const timer = createTimer();
    logMethodCall(logger, {
      method: "resolveEnvInConfig",
      module: MODULE_NAME,
      params: {},
    });

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

    logMethodReturn(logger, {
      method: "resolveEnvInConfig",
      module: MODULE_NAME,
      result: sanitize({ serverCount: Object.keys(resolved.mcpServers).length }),
      duration: timer(),
    });

    return resolved;
  }
}

