/**
 * MCP 工具模块测试
 *
 * 测试 MCP 工具包装器和管理器
 */

import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { MCPToolWrapper, MCPManager, type MCPToolDefinition, type MCPServerConfig, type MCPConfig } from "../../microagent/applications/tools/mcp/index.js";
import { join } from "node:path";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";

// ============================================================================
// 测试常量
// ============================================================================

const TEST_DIR = join(tmpdir(), "micro-agent-mcp-test");

// 官方 MCP 服务器配置
const OFFICIAL_SERVERS = {
  filesystem: {
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-filesystem", TEST_DIR],
  },
  git: {
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-git"],
  },
  fetch: {
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-fetch"],
  },
  memory: {
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-memory"],
  },
  "sequential-thinking": {
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-sequential-thinking"],
  },
  time: {
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-time"],
  },
  everything: {
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-everything"],
  },
} as const;

// ============================================================================
// 测试辅助函数
// ============================================================================

async function setupTestDir(): Promise<void> {
  await mkdir(TEST_DIR, { recursive: true });
}

async function cleanupTestDir(): Promise<void> {
  try {
    await rm(TEST_DIR, { recursive: true, force: true });
  } catch {
    // 忽略清理失败
  }
}

// ============================================================================
// 测试数据
// ============================================================================

const mockToolDefinition: MCPToolDefinition = {
  name: "test_tool",
  description: "测试工具描述",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "查询参数",
      },
      limit: {
        type: "number",
        description: "结果数量限制",
      },
    },
    required: ["query"],
  },
};

// ============================================================================
// 测试套件
// ============================================================================

describe("MCP 工具模块测试", () => {
  describe("MCPToolWrapper", () => {
    describe("实例创建", () => {
      test("应正确创建工具包装器", async () => {
        const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
        const mockClient = {
          callTool: async () => ({ content: [] }),
        } as unknown as InstanceType<typeof Client>;

        const wrapper = new MCPToolWrapper(
          "test-server",
          mockToolDefinition,
          mockClient,
          30000
        );

        expect(wrapper).toBeDefined();
        expect(wrapper.name).toBe("mcp_test-server_test_tool");
        expect(wrapper.description).toBe("测试工具描述");
      });

      test("应正确处理无描述的工具定义", async () => {
        const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
        const mockClient = {} as unknown as InstanceType<typeof Client>;

        const noDescTool: MCPToolDefinition = {
          name: "no_desc_tool",
          inputSchema: { type: "object", properties: {} },
        };

        const wrapper = new MCPToolWrapper(
          "server",
          noDescTool,
          mockClient
        );

        expect(wrapper.description).toBe("no_desc_tool");
      });
    });

    describe("getDefinition 方法", () => {
      test("应返回正确的工具定义格式", async () => {
        const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
        const mockClient = {} as unknown as InstanceType<typeof Client>;

        const wrapper = new MCPToolWrapper(
          "github",
          mockToolDefinition,
          mockClient
        );

        const definition = wrapper.getDefinition();

        expect(definition.name).toBe("mcp_github_test_tool");
        expect(definition.description).toBe("测试工具描述");
        expect(definition.parameters.type).toBe("object");
      });
    });

    describe("工具命名规则", () => {
      test("应使用正确的命名格式", async () => {
        const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
        const mockClient = {} as unknown as InstanceType<typeof Client>;

        const wrapper = new MCPToolWrapper(
          "my-server",
          { name: "myTool", inputSchema: { type: "object", properties: {} } },
          mockClient
        );

        expect(wrapper.name).toBe("mcp_my-server_myTool");
      });

      test("应正确处理含下划线的服务器名", async () => {
        const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
        const mockClient = {} as unknown as InstanceType<typeof Client>;

        const wrapper = new MCPToolWrapper(
          "github_server",
          { name: "create_issue", inputSchema: { type: "object", properties: {} } },
          mockClient
        );

        expect(wrapper.name).toBe("mcp_github_server_create_issue");
      });
    });
  });

  describe("MCPManager", () => {
    beforeEach(async () => {
      await setupTestDir();
    });

    afterEach(async () => {
      await cleanupTestDir();
    });

    describe("loadConfig 方法", () => {
      test("应正确加载配置文件", async () => {
        const configPath = join(TEST_DIR, "mcp.json");
        const config: MCPConfig = {
          mcpServers: {
            "filesystem": {
              disabled: false,
              ...OFFICIAL_SERVERS.filesystem,
            },
          },
        };

        await writeFile(configPath, JSON.stringify(config));

        const manager = new MCPManager();
        const loaded = await manager.loadConfig(configPath);

        expect(loaded.mcpServers).toHaveProperty("filesystem");
        expect(loaded.mcpServers["filesystem"].disabled).toBe(false);
      });

      test("文件不存在时返回空配置", async () => {
        const manager = new MCPManager();
        const config = await manager.loadConfig(join(TEST_DIR, "non-existent.json"));

        expect(config.mcpServers).toEqual({});
      });

      test("配置加载应正确识别禁用的服务器", async () => {
        const configPath = join(TEST_DIR, "mcp.json");
        const config: MCPConfig = {
          mcpServers: {
            "git": {
              disabled: true,
              ...OFFICIAL_SERVERS.git,
            },
          },
        };

        await writeFile(configPath, JSON.stringify(config));

        const manager = new MCPManager();
        const loaded = await manager.loadConfig(configPath);

        expect(loaded.mcpServers["git"].disabled).toBe(true);
      });

      test("应正确加载官方服务器配置", async () => {
        const configPath = join(TEST_DIR, "mcp.json");
        const config: MCPConfig = {
          mcpServers: {
            "everything": {
              disabled: false,
              ...OFFICIAL_SERVERS.everything,
            },
          },
        };

        await writeFile(configPath, JSON.stringify(config));

        const manager = new MCPManager();
        const loaded = await manager.loadConfig(configPath);

        expect(loaded.mcpServers["everything"].command).toBe("npx");
        expect(loaded.mcpServers["everything"].args).toContain("-y");
        expect(loaded.mcpServers["everything"].args).toContain("@modelcontextprotocol/server-everything");
      });
    });

    describe("getServerInfo 方法", () => {
      test("应返回服务器状态列表", async () => {
        const manager = new MCPManager();
        await manager.loadConfig();

        const info = manager.getServerInfo();
        expect(Array.isArray(info)).toBe(true);
      });
    });

    describe("getTools 方法", () => {
      test("应返回已注册的工具列表", async () => {
        const manager = new MCPManager();
        const tools = manager.getTools();

        expect(Array.isArray(tools)).toBe(true);
      });
    });

    describe("closeAll 方法", () => {
      test("应清理所有资源", async () => {
        const manager = new MCPManager();
        await manager.loadConfig();

        await manager.closeAll();

        expect(manager.getTools().length).toBe(0);
        expect(manager.getServerInfo().length).toBe(0);
      });
    });
  });

  describe("MCPServerConfig 类型", () => {
    test("应支持 stdio 配置", () => {
      const config: MCPServerConfig = {
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-filesystem", "/workspace"],
        env: { NODE_ENV: "production" },
        toolTimeout: 60000,
      };

      expect(config.command).toBe("npx");
      expect(config.args?.length).toBe(3);
      expect(config.env?.NODE_ENV).toBe("production");
      expect(config.toolTimeout).toBe(60000);
    });

    test("应支持 sse 配置", () => {
      const config: MCPServerConfig = {
        url: "https://example.com/mcp/sse",
        headers: {
          Authorization: "Bearer token",
        },
      };

      expect(config.url).toBe("https://example.com/mcp/sse");
      expect(config.headers?.Authorization).toBe("Bearer token");
    });

    test("应支持 streamableHttp 配置", () => {
      const config: MCPServerConfig = {
        type: "streamableHttp",
        url: "https://example.com/mcp",
        headers: {
          Authorization: "Bearer token",
        },
      };

      expect(config.type).toBe("streamableHttp");
      expect(config.url).toBe("https://example.com/mcp");
    });

    test("应支持 disabled 标志", () => {
      const config: MCPServerConfig = {
        disabled: true,
        command: "node",
        args: [],
      };

      expect(config.disabled).toBe(true);
    });
  });

  describe("MCPConfig 类型", () => {
    test("应支持完整配置结构", () => {
      const config: MCPConfig = {
        mcpServers: {
          fetch: {
            ...OFFICIAL_SERVERS.fetch,
          },
        },
        globalSettings: {
          timeout: 30000,
          retryCount: 3,
          logLevel: "info",
        },
      };

      expect(config.mcpServers).toHaveProperty("fetch");
      expect(config.globalSettings?.timeout).toBe(30000);
      expect(config.globalSettings?.logLevel).toBe("info");
    });
  });

  describe("MCPToolDefinition 类型", () => {
    test("应正确描述工具定义", () => {
      const toolDef: MCPToolDefinition = {
        name: "search",
        description: "搜索工具",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string" },
          },
          required: ["query"],
        },
      };

      expect(toolDef.name).toBe("search");
      expect(toolDef.description).toBe("搜索工具");
      expect(toolDef.inputSchema.type).toBe("object");
    });
  });

  describe("官方 MCP 服务器配置验证", () => {
    test("filesystem 服务器配置格式正确", () => {
      const config: MCPServerConfig = {
        disabled: true,
        ...OFFICIAL_SERVERS.filesystem,
      };

      expect(config.command).toBe("npx");
      expect(config.args?.[0]).toBe("-y");
      expect(config.args?.[1]).toBe("@modelcontextprotocol/server-filesystem");
    });

    test("git 服务器配置格式正确", () => {
      const config: MCPServerConfig = {
        disabled: true,
        ...OFFICIAL_SERVERS.git,
      };

      expect(config.command).toBe("npx");
      expect(config.args).toContain("@modelcontextprotocol/server-git");
    });

    test("fetch 服务器配置格式正确", () => {
      const config: MCPServerConfig = {
        disabled: true,
        ...OFFICIAL_SERVERS.fetch,
      };

      expect(config.command).toBe("npx");
      expect(config.args).toContain("@modelcontextprotocol/server-fetch");
    });

    test("memory 服务器配置格式正确", () => {
      const config: MCPServerConfig = {
        disabled: true,
        ...OFFICIAL_SERVERS.memory,
      };

      expect(config.command).toBe("npx");
      expect(config.args).toContain("@modelcontextprotocol/server-memory");
    });

    test("sequential-thinking 服务器配置格式正确", () => {
      const config: MCPServerConfig = {
        disabled: true,
        ...OFFICIAL_SERVERS["sequential-thinking"],
      };

      expect(config.command).toBe("npx");
      expect(config.args).toContain("@modelcontextprotocol/server-sequential-thinking");
    });

    test("time 服务器配置格式正确", () => {
      const config: MCPServerConfig = {
        disabled: true,
        ...OFFICIAL_SERVERS.time,
      };

      expect(config.command).toBe("npx");
      expect(config.args).toContain("@modelcontextprotocol/server-time");
    });

    test("everything 服务器配置格式正确", () => {
      const config: MCPServerConfig = {
        disabled: true,
        ...OFFICIAL_SERVERS.everything,
      };

      expect(config.command).toBe("npx");
      expect(config.args).toContain("@modelcontextprotocol/server-everything");
    });
  });
});
