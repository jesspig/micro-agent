/**
 * Tool 抽象基类
 *
 * 提供工具实现的通用基础设施
 */

import type { ToolDefinition } from "../types.js";
import type { ToolParameterSchema, ToolResult } from "./types.js";
import type { IToolExtended } from "./contract.js";
import { toolLogger, createTimer, sanitize, logMethodCall, logMethodReturn } from "../../applications/shared/logger.js";

// ============================================================================
// 抽象基类
// ============================================================================

/**
 * Tool 抽象基类
 *
 * 提供工具实现的通用基础设施，包括：
 * - 参数读取辅助方法
 * - 定义生成
 * - 类型安全
 */
export abstract class BaseTool<TParams extends Record<string, unknown> = Record<string, unknown>>
  implements IToolExtended
{
  /** 日志器 */
  protected logger = toolLogger();

  /** 工具名称 */
  abstract readonly name: string;
  /** 工具描述 */
  abstract readonly description: string;
  /** 工具参数 Schema */
  abstract readonly parameters: ToolParameterSchema;

  /**
   * 执行工具
   * @param params - 工具参数
   * @returns 执行结果
   */
  abstract execute(params: TParams): Promise<ToolResult>;

  /**
   * 获取工具定义
   * @returns 工具定义（包含参数 schema）
   */
  getDefinition(): ToolDefinition {
    const timer = createTimer();
    logMethodCall(this.logger, { method: "getDefinition", module: "BaseTool" });

    const result: ToolDefinition = {
      name: this.name,
      description: this.description,
      parameters: this.parameters,
    };

    logMethodReturn(this.logger, {
      method: "getDefinition",
      module: "BaseTool",
      result: sanitize({ name: result.name }),
      duration: timer(),
    });

    return result;
  }

  // ============================================================================
  // 参数读取辅助方法
  // ============================================================================

  /**
   * 读取字符串参数
   * @param params - 参数对象
   * @param key - 参数键名
   * @param options - 读取选项
   * @returns 字符串值或 undefined
   */
  protected readStringParam(
    params: Record<string, unknown>,
    key: string,
    options?: { required?: boolean; defaultValue?: string }
  ): string | undefined {
    const value = params[key];
    if (typeof value === "string") return value;
    if (value === undefined && options?.defaultValue !== undefined) {
      return options.defaultValue;
    }
    if (options?.required && value === undefined) {
      throw new Error(`参数 "${key}" 是必需的`);
    }
    return undefined;
  }

  /**
   * 读取数字参数
   * @param params - 参数对象
   * @param key - 参数键名
   * @param options - 读取选项
   * @returns 数字值或 undefined
   */
  protected readNumberParam(
    params: Record<string, unknown>,
    key: string,
    options?: { required?: boolean; defaultValue?: number }
  ): number | undefined {
    const value = params[key];
    if (typeof value === "number") return value;
    if (value === undefined && options?.defaultValue !== undefined) {
      return options.defaultValue;
    }
    if (options?.required && value === undefined) {
      throw new Error(`参数 "${key}" 是必需的`);
    }
    return undefined;
  }

  /**
   * 读取布尔参数
   * @param params - 参数对象
   * @param key - 参数键名
   * @param options - 读取选项
   * @returns 布尔值
   */
  protected readBooleanParam(
    params: Record<string, unknown>,
    key: string,
    options?: { defaultValue?: boolean }
  ): boolean {
    const value = params[key];
    if (typeof value === "boolean") return value;
    return options?.defaultValue ?? false;
  }

  /**
   * 读取数组参数
   * @param params - 参数对象
   * @param key - 参数键名
   * @param options - 读取选项
   * @returns 数组值或 undefined
   */
  protected readArrayParam<T = unknown>(
    params: Record<string, unknown>,
    key: string,
    options?: { required?: boolean; defaultValue?: T[] }
  ): T[] | undefined {
    const value = params[key];
    if (Array.isArray(value)) return value as T[];
    if (value === undefined && options?.defaultValue !== undefined) {
      return options.defaultValue;
    }
    if (options?.required && value === undefined) {
      throw new Error(`参数 "${key}" 是必需的`);
    }
    return undefined;
  }

  /**
   * 读取对象参数
   * @param params - 参数对象
   * @param key - 参数键名
   * @param options - 读取选项
   * @returns 对象值或 undefined
   */
  protected readObjectParam<T = Record<string, unknown>>(
    params: Record<string, unknown>,
    key: string,
    options?: { required?: boolean; defaultValue?: T }
  ): T | undefined {
    const value = params[key];
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      return value as T;
    }
    if (value === undefined && options?.defaultValue !== undefined) {
      return options.defaultValue;
    }
    if (options?.required && value === undefined) {
      throw new Error(`参数 "${key}" 是必需的`);
    }
    return undefined;
  }
}