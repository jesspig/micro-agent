/**
 * 环境变量解析器
 * 
 * 解析配置中的环境变量引用，支持 ${VAR_NAME} 和 ${VAR_NAME:-default} 语法
 */

import { ENV_VAR_PATTERN } from "../shared/constants.js";

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 环境变量引用解析结果
 */
interface EnvVarMatch {
  /** 完整匹配文本 */
  full: string;
  /** 变量名 */
  name: string;
  /** 默认值（如果有） */
  defaultValue: string | undefined;
}

// ============================================================================
// 解析函数
// ============================================================================

/**
 * 解析环境变量引用
 * 
 * 支持格式：
 * - ${VAR_NAME} - 直接引用
 * - ${VAR_NAME:-default} - 带默认值
 * - ${VAR_NAME-default} - 带默认值（仅当变量未设置时）
 * 
 * @param text - 包含环境变量引用的文本
 * @returns 解析后的文本
 */
export function resolveEnvVars(text: string): string {
  return text.replace(ENV_VAR_PATTERN, (match: string): string => {
    const parsed = parseEnvVarMatch(match);
    if (!parsed) {
      return match;
    }

    const envValue = process.env[parsed.name];

    // 变量存在且非空
    if (envValue !== undefined && envValue !== "") {
      return envValue;
    }

    // 变量不存在，使用默认值
    if (parsed.defaultValue !== undefined) {
      return parsed.defaultValue;
    }

    // 无默认值，返回空字符串
    return "";
  });
}

/**
 * 解析单个环境变量引用
 * 
 * @param match - 匹配到的环境变量引用字符串
 * @returns 解析结果或 null
 */
function parseEnvVarMatch(match: string): EnvVarMatch | null {
  // 移除 ${ 和 }
  const inner = match.slice(2, -1);
  if (!inner) {
    return null;
  }

  // 检查是否有默认值语法
  // 优先匹配 :- 语法（变量为空时也使用默认值）
  const colonDashIndex = inner.indexOf(":-");
  if (colonDashIndex !== -1) {
    return {
      full: match,
      name: inner.slice(0, colonDashIndex),
      defaultValue: inner.slice(colonDashIndex + 2),
    };
  }

  // 匹配 - 语法（仅当变量未设置时使用默认值）
  const dashIndex = inner.indexOf("-");
  if (dashIndex !== -1) {
    const name = inner.slice(0, dashIndex);
    const defaultValue = inner.slice(dashIndex + 1);
    // 检查环境变量是否设置（包括空字符串）
    const isSet = name in process.env;
    return {
      full: match,
      name,
      defaultValue: isSet ? process.env[name] : defaultValue,
    };
  }

  // 无默认值
  return {
    full: match,
    name: inner,
    defaultValue: undefined,
  };
}

/**
 * 递归解析对象中的所有环境变量引用
 * 
 * @param obj - 要解析的对象
 * @returns 解析后的对象
 */
export function resolveEnvVarsDeep<T>(obj: T): T {
  if (typeof obj === "string") {
    return resolveEnvVars(obj) as T;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => resolveEnvVarsDeep(item)) as T;
  }

  if (obj !== null && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      // 同时解析对象的键和值
      const resolvedKey = resolveEnvVars(key);
      result[resolvedKey] = resolveEnvVarsDeep(value);
    }
    return result as T;
  }

  return obj;
}

/**
 * 检查字符串是否包含环境变量引用
 * 
 * @param text - 要检查的文本
 * @returns 是否包含环境变量引用
 */
export function hasEnvVarRef(text: string): boolean {
  // 重置正则表达式的 lastIndex，因为使用了 g 标志
  ENV_VAR_PATTERN.lastIndex = 0;
  const match = ENV_VAR_PATTERN.exec(text);
  if (!match) return false;

  // 检查匹配到的内容是否是有效的环境变量引用
  // 有效格式：${VAR_NAME} 或 ${VAR_NAME:-default} 或 ${VAR_NAME-default}
  // 环境变量名不应该包含空格
  const inner = match[0]!.slice(2, -1);
  const colonIndex = inner.indexOf(":-");
  const dashIndex = inner.indexOf("-");

  // 找到环境变量名的结束位置
  let varNameEnd = inner.length;
  if (colonIndex !== -1) varNameEnd = Math.min(varNameEnd, colonIndex);
  if (dashIndex !== -1 && dashIndex > 0) varNameEnd = Math.min(varNameEnd, dashIndex);

  const varName = inner.slice(0, varNameEnd);

  // 环境变量名不应该包含空格
  return !/\s/.test(varName);
}