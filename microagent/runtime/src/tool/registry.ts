/**
 * Tool 注册表
 *
 * 管理工具的注册、查找和执行
 */

import type { ToolDefinition } from "../types.js";
import type { ITool } from "../contracts.js";
import type { ToolPolicy } from "./types.js";
import type { ToolFactory } from "./contract.js";
import { RegistryError, ToolInputError } from "../errors.js";

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

  /**
   * 注册工具
   * @param tool - 工具实例
   * @throws RegistryError - 工具已存在时抛出
   */
  register(tool: ITool): void {
    if (this.tools.has(tool.name)) {
      throw new RegistryError(`工具 "${tool.name}" 已存在`, "Tool", tool.name);
    }
    this.tools.set(tool.name, tool);
  }

  /**
   * 注册工厂函数（延迟创建）
   * @param name - 工具名称
   * @param factory - 工厂函数
   */
  registerFactory(name: string, factory: ToolFactory): void {
    this.factories.set(name, factory);
  }

  /**
   * 获取工具
   * @param name - 工具名称
   * @returns 工具实例，若不存在则返回 undefined
   */
  get(name: string): ITool | undefined {
    // 先查已创建的工具
    if (this.tools.has(name)) {
      return this.tools.get(name);
    }

    // 尝试使用工厂创建
    const factory = this.factories.get(name);
    if (factory) {
      const tool = factory();
      if (tool) {
        this.tools.set(name, tool);
        return tool;
      }
    }
    return undefined;
  }

  /**
   * 列出所有工具（支持策略过滤）
   * @param policy - 工具策略
   * @returns 工具列表
   */
  list(policy?: ToolPolicy): ITool[] {
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

    return tools;
  }

  /**
   * 检查工具是否存在
   * @param name - 工具名称
   * @returns 是否存在
   */
  has(name: string): boolean {
    return this.tools.has(name) || this.factories.has(name);
  }

  /**
   * 获取工具定义列表
   * @param policy - 工具策略
   * @returns 工具定义列表
   */
  getDefinitions(policy?: ToolPolicy): ToolDefinition[] {
    return this.list(policy).map((t) => t.getDefinition());
  }

  /**
   * 执行工具
   * @param name - 工具名称
   * @param params - 工具参数
   * @returns 执行结果
   * @throws RegistryError - 工具不存在时抛出
   * @throws ToolInputError - 执行失败时抛出
   */
  async execute(
    name: string,
    params: Record<string, unknown>
  ): Promise<string> {
    const tool = this.get(name);
    if (!tool) {
      throw new RegistryError(`工具 "${name}" 不存在`, "Tool", name);
    }

    try {
      const result = await tool.execute(params);
      // 处理不同类型的返回值
      if (typeof result === "string") {
        return result;
      }
      // ToolResult 类型
      if (typeof result === "object" && result !== null && "content" in result) {
        const toolResult = result as { content: string; isError?: boolean };
        return toolResult.isError ? `错误: ${toolResult.content}` : toolResult.content;
      }
      // 其他对象类型，转为 JSON 字符串
      return JSON.stringify(result);
    } catch (error) {
      throw new ToolInputError(
        error instanceof Error ? error.message : String(error),
        name
      );
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
    return result;
  }
}
