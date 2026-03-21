/**
 * Tool 注册表
 *
 * 管理工具的注册、查找和执行
 */

import type { ToolDefinition } from "../types.js";
import type { ITool } from "../contracts.js";
import type { ToolPolicy } from "./types.js";
import type { ToolFactory } from "./contract.js";
import { RegistryError, ToolExecutionError } from "../errors.js";
import { createTimer, sanitize, logMethodCall, logMethodReturn, logMethodError, createDefaultLogger } from "../logger/index.js";

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 截断文本用于日志
 * @param text - 待截断文本
 * @param maxLen - 最大长度
 * @returns 截断后的文本
 */
function truncateForLog(text: string, maxLen = 2000): string {
  if (!text) return "";
  return text.length > maxLen ? text.substring(0, maxLen) + "...(truncated)" : text;
}

// ============================================================================
// 内置工具组
// ============================================================================

/**
 * 内置工具组定义
 */
export const TOOL_GROUPS: Record<string, string[]> = {
  "group:fs": ["read", "write", "edit"],
  "group:shell": ["exec", "process"],
  "group:web": ["web_search", "web_fetch"],
  "group:memory": ["memory_search", "memory_get"],
};

// ============================================================================
// Tool 注册表
// ============================================================================

/**
 * Tool 注册表
 *
 * 提供工具的注册、查找、策略过滤和执行能力
 */
export class ToolRegistry {
  private tools = new Map<string, ITool>();
  private factories = new Map<string, ToolFactory>();
  private logger = createDefaultLogger("debug", ["runtime", "tool", "registry"]);

  /**
   * 注册工具
   * @param tool - 工具实例
   * @throws RegistryError - 工具已存在时抛出
   */
  register(tool: ITool): void {
    const timer = createTimer();
    const toolName = tool.name;
    logMethodCall(this.logger, { method: "register", module: "ToolRegistry", params: { toolName } });

    try {
      if (this.tools.has(tool.name)) {
        throw new RegistryError(`工具 "${tool.name}" 已存在`, "Tool", tool.name);
      }
      this.tools.set(tool.name, tool);

      logMethodReturn(this.logger, {
        method: "register",
        module: "ToolRegistry",
        result: { registered: true, toolName },
        duration: timer(),
      });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logMethodError(this.logger, {
        method: "register",
        module: "ToolRegistry",
        error: { name: err.name, message: err.message, stack: err.stack },
        params: { toolName },
        duration: timer(),
      });
      throw error;
    }
  }

  /**
   * 注册工厂函数（延迟创建）
   * @param name - 工具名称
   * @param factory - 工厂函数
   */
  registerFactory(name: string, factory: ToolFactory): void {
    const timer = createTimer();
    logMethodCall(this.logger, { method: "registerFactory", module: "ToolRegistry", params: { name } });

    this.factories.set(name, factory);

    logMethodReturn(this.logger, {
      method: "registerFactory",
      module: "ToolRegistry",
      result: { registered: true, name },
      duration: timer(),
    });
  }

  /**
   * 获取工具
   * @param name - 工具名称
   * @returns 工具实例，若不存在则返回 undefined
   */
  get(name: string): ITool | undefined {
    const timer = createTimer();
    logMethodCall(this.logger, { method: "get", module: "ToolRegistry", params: { name } });

    try {
      // 先查已创建的工具
      if (this.tools.has(name)) {
        const tool = this.tools.get(name);
        logMethodReturn(this.logger, {
          method: "get",
          module: "ToolRegistry",
          result: { found: true, name, source: "cache" },
          duration: timer(),
        });
        return tool;
      }

      // 尝试使用工厂创建
      const factory = this.factories.get(name);
      if (factory) {
        const tool = factory();
        if (tool) {
          this.tools.set(name, tool);
          logMethodReturn(this.logger, {
            method: "get",
            module: "ToolRegistry",
            result: { found: true, name, source: "factory" },
            duration: timer(),
          });
          return tool;
        }
      }

      logMethodReturn(this.logger, {
        method: "get",
        module: "ToolRegistry",
        result: { found: false, name },
        duration: timer(),
      });
      return undefined;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logMethodError(this.logger, {
        method: "get",
        module: "ToolRegistry",
        error: { name: err.name, message: err.message, stack: err.stack },
        params: { name },
        duration: timer(),
      });
      throw error;
    }
  }

  /**
   * 列出所有工具（支持策略过滤）
   * @param policy - 工具策略
   * @returns 工具列表
   */
  list(policy?: ToolPolicy): ITool[] {
    const timer = createTimer();
    logMethodCall(this.logger, { method: "list", module: "ToolRegistry", params: { hasPolicy: !!policy } });

    try {
      let tools = Array.from(this.tools.values());

      if (policy) {
        const allowed = this.expandGroups(policy.allow ?? []);
        const denied = this.expandGroups(policy.deny ?? []);

        if (allowed.length > 0) {
          tools = tools.filter((t) => allowed.includes(t.name));
        }
        if (denied.length > 0) {
          tools = tools.filter((t) => !denied.includes(t.name));
        }
      }

      logMethodReturn(this.logger, {
        method: "list",
        module: "ToolRegistry",
        result: { count: tools.length, names: tools.map(t => t.name) },
        duration: timer(),
      });

      return tools;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logMethodError(this.logger, {
        method: "list",
        module: "ToolRegistry",
        error: { name: err.name, message: err.message, stack: err.stack },
        params: { hasPolicy: !!policy },
        duration: timer(),
      });
      throw error;
    }
  }

  /**
   * 检查工具是否存在
   * @param name - 工具名称
   * @returns 是否存在
   */
  has(name: string): boolean {
    const timer = createTimer();
    logMethodCall(this.logger, { method: "has", module: "ToolRegistry", params: { name } });

    const result = this.tools.has(name) || this.factories.has(name);

    logMethodReturn(this.logger, {
      method: "has",
      module: "ToolRegistry",
      result: { exists: result, name },
      duration: timer(),
    });

    return result;
  }

  /**
   * 获取工具定义列表
   * @param policy - 工具策略
   * @returns 工具定义列表
   */
  getDefinitions(policy?: ToolPolicy): ToolDefinition[] {
    const timer = createTimer();
    logMethodCall(this.logger, { method: "getDefinitions", module: "ToolRegistry", params: { hasPolicy: !!policy } });

    try {
      const tools = this.list(policy);
      const definitions = tools.map((t) => t.getDefinition());

      logMethodReturn(this.logger, {
        method: "getDefinitions",
        module: "ToolRegistry",
        result: { count: definitions.length, names: definitions.map(d => d.name) },
        duration: timer(),
      });

      return definitions;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logMethodError(this.logger, {
        method: "getDefinitions",
        module: "ToolRegistry",
        error: { name: err.name, message: err.message, stack: err.stack },
        params: { hasPolicy: !!policy },
        duration: timer(),
      });
      throw error;
    }
  }

  /**
   * 执行工具
   * @param name - 工具名称
   * @param params - 工具参数
   * @returns 执行结果
   * @throws RegistryError - 工具不存在时抛出
   * @throws ToolExecutionError - 工具执行失败时抛出
   */
  async execute(
    name: string,
    params: Record<string, unknown>
  ): Promise<string> {
    const timer = createTimer();
    logMethodCall(this.logger, { method: "execute", module: "ToolRegistry", params: { name, params: sanitize(params) } });

    try {
      const tool = this.get(name);
      if (!tool) {
        throw new RegistryError(`工具 "${name}" 不存在`, "Tool", name);
      }

      this.logger.info("工具执行开始", { toolName: name, params: sanitize(params) });

      const result = await tool.execute(params);

      // 处理不同类型的返回值
      let output: string;
      let isResultError = false;
      if (typeof result === "string") {
        output = result;
      } else if (typeof result === "object" && result !== null && "content" in result) {
        const toolResult = result as { content: string; isError?: boolean };
        isResultError = !!toolResult.isError;
        output = toolResult.isError ? `错误: ${toolResult.content}` : toolResult.content;
      } else {
        output = JSON.stringify(result);
      }

      this.logger.info("工具执行完成", {
        toolName: name,
        resultLength: output.length,
        isError: isResultError,
        output: truncateForLog(output),
        duration: timer(),
      });

      logMethodReturn(this.logger, {
        method: "execute",
        module: "ToolRegistry",
        result: { success: true, toolName: name, resultLength: output.length },
        duration: timer(),
      });

      return output;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));

      // 如果是 RegistryError 或 ToolExecutionError，直接重新抛出
      if (err instanceof RegistryError || err instanceof ToolExecutionError) {
        throw error;
      }

      this.logger.error("工具执行失败", {
        toolName: name,
        error: { name: err.name, message: err.message },
        params: sanitize(params),
        duration: timer(),
      });

      logMethodError(this.logger, {
        method: "execute",
        module: "ToolRegistry",
        error: { name: err.name, message: err.message, stack: err.stack },
        params: { name, params: sanitize(params) },
        duration: timer(),
      });

      // 抛出 ToolExecutionError 而非 ToolInputError
      throw new ToolExecutionError(name, err.message, err);
    }
  }

  // ============================================================================
  // 私有方法
  // ============================================================================

  /**
   * 展开工具组
   * @param names - 名称列表（可能包含 group: 前缀）
   * @returns 展开后的工具名列表
   */
  private expandGroups(names: string[]): string[] {
    const timer = createTimer();
    logMethodCall(this.logger, { method: "expandGroups", module: "ToolRegistry", params: { names } });

    const result: string[] = [];
    for (const name of names) {
      if (name.startsWith("group:")) {
        const groupTools = TOOL_GROUPS[name];
        if (groupTools) {
          result.push(...groupTools);
        }
      } else {
        result.push(name);
      }
    }

    logMethodReturn(this.logger, {
      method: "expandGroups",
      module: "ToolRegistry",
      result: { expandedNames: result },
      duration: timer(),
    });

    return result;
  }
}