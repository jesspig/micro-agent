/**
 * Tool 模块类型定义
 *
 * 定义工具相关的扩展类型
 */

import type { ToolParameterSchema as BaseParameterSchema } from "../types.js";

// ============================================================================
// 工具参数 Schema（扩展基础类型）
// ============================================================================

/**
 * 工具参数 Schema
 * 继承基础参数 schema，添加额外的 JSON Schema 特性
 */
export interface ToolParameterSchema extends BaseParameterSchema {
  /** JSON Schema 版本 */
  $schema?: string;
  /** Schema 标题 */
  title?: string;
}

// ============================================================================
// 工具执行结果
// ============================================================================

/**
 * 工具执行结果
 */
export interface ToolResult {
  /** 结果内容 */
  content: string;
  /** 是否为错误结果 */
  isError?: boolean;
  /** 额外元数据 */
  metadata?: Record<string, unknown>;
  /** 索引签名，满足 Record<string, unknown> 约束 */
  [key: string]: unknown;
}

// ============================================================================
// 工具策略
// ============================================================================

/**
 * 工具策略
 * 用于控制工具的访问权限
 */
export interface ToolPolicy {
  /** 允许的工具名列表，支持 glob: "group:fs" */
  allow?: string[];
  /** 禁止的工具名列表 */
  deny?: string[];
}

// ============================================================================
// 工具组定义
// ============================================================================

/**
 * 工具组定义
 * 用于按功能分类管理工具
 */
export interface ToolGroup {
  /** 工具组名称 */
  name: string;
  /** 工具名称列表 */
  tools: string[];
}

// ============================================================================
// JSON Schema 基础类型
// ============================================================================

/**
 * JSON Schema 基础类型
 * 用于工具参数定义
 */
export interface JSONSchema {
  /** Schema 类型 */
  type?: string | string[];
  /** 属性定义 */
  properties?: Record<string, JSONSchema>;
  /** 必需属性 */
  required?: string[];
  /** 描述 */
  description?: string;
  /** 枚举值 */
  enum?: unknown[];
  /** 默认值 */
  default?: unknown;
  /** 项定义（用于数组类型） */
  items?: JSONSchema;
  /** 最小值 */
  minimum?: number;
  /** 最大值 */
  maximum?: number;
  /** 最小长度 */
  minLength?: number;
  /** 最大长度 */
  maxLength?: number;
  /** 正则模式 */
  pattern?: string;
}
