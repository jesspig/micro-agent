/**
 * 系统提示词构建
 *
 * 构建 Agent 系统提示词，整合各类配置文件内容
 */

import { promptsLogger, createTimer, logMethodCall, logMethodReturn, logMethodError } from "../shared/logger.js";

const logger = promptsLogger();

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 系统提示词参数
 */
export interface SystemPromptParams {
  /** Agent 角色定义内容（AGENTS.md） */
  agentsContent: string;
  /** 个性/价值观内容（SOUL.md） */
  soulContent?: string;
  /** 用户偏好内容（USER.md） */
  userContent?: string;
  /** 工具使用指南内容（TOOLS.md） */
  toolsContent?: string;
  /** 可用工具列表 */
  availableTools?: string[];
  /** 当前日期时间 */
  currentDate?: string;
}

/**
 * 构建后的系统提示词
 */
export interface BuiltSystemPrompt {
  /** 完整的系统提示词 */
  prompt: string;
  /** 提示词总字符数 */
  length: number;
  /** 包含的各个部分 */
  sections: string[];
}

// ============================================================================
// 系统提示词模板
// ============================================================================

/**
 * 工具使用提示词模板
 */
const TOOLS_PROMPT_TEMPLATE = `

## 可用工具

你现在可以使用以下工具：
{{toolList}}

使用工具时请遵循以下规则：
1. 仔细阅读工具描述，确保理解其功能和限制
2. 根据用户需求选择合适的工具
3. 提供正确的参数，参数格式必须符合工具要求
4. 如果工具执行失败，分析原因后可重试或换用其他方法`;

/**
 * 日期时间提示词模板
 */
const DATE_PROMPT_TEMPLATE = `

## 当前环境

当前日期时间：{{currentDate}}`;

// ============================================================================
// 提示词构建函数
// ============================================================================

/**
 * 构建系统提示词
 *
 * 整合 AGENTS.md、SOUL.md、USER.md、TOOLS.md 等内容，
 * 生成完整的系统提示词。
 *
 * @param params 系统提示词参数
 * @returns 构建后的系统提示词
 */
export function buildSystemPrompt(params: SystemPromptParams): BuiltSystemPrompt {
  const timer = createTimer();
  logMethodCall(logger, { method: "buildSystemPrompt", module: "system-prompt", params: { 
    hasAgentsContent: !!params.agentsContent,
    hasSoulContent: !!params.soulContent,
    hasUserContent: !!params.userContent,
    hasToolsContent: !!params.toolsContent,
    toolCount: params.availableTools?.length ?? 0,
    hasCurrentDate: !!params.currentDate
  } });

  try {
    const sections: string[] = [];

    // 1. 添加 Agent 角色定义（核心）
    sections.push(params.agentsContent);

    // 2. 添加个性/价值观（可选）
    if (params.soulContent?.trim()) {
      sections.push(formatSection("个性与价值观", params.soulContent));
    }

    // 3. 添加用户偏好（可选）
    if (params.userContent?.trim()) {
      sections.push(formatSection("用户偏好", params.userContent));
    }

    // 4. 添加工具使用指南（可选）
    if (params.toolsContent?.trim()) {
      sections.push(formatSection("工具使用指南", params.toolsContent));
    }

    // 5. 添加可用工具列表（可选）
    if (params.availableTools && params.availableTools.length > 0) {
      sections.push(buildToolsPrompt(params.availableTools));
    }

    // 6. 添加当前日期时间（可选）
    if (params.currentDate) {
      sections.push(buildDatePrompt(params.currentDate));
    }

    const prompt = sections.join("\n\n");

    const result = {
      prompt,
      length: prompt.length,
      sections: sections.map((_, i) => `Section ${i + 1}`),
    };

    logMethodReturn(logger, { method: "buildSystemPrompt", module: "system-prompt", result: { length: result.length, sectionCount: result.sections.length }, duration: timer() });
    return result;
  } catch (err) {
    const error = err as Error;
    logMethodError(logger, { method: "buildSystemPrompt", module: "system-prompt", error: { name: error.name, message: error.message, ...(error.stack ? { stack: error.stack } : {}) }, params: {}, duration: timer() });
    throw error;
  }
}

/**
 * 构建简化版系统提示词
 *
 * 仅包含核心角色定义，不包含工具和日期信息
 *
 * @param agentsContent Agent 角色定义
 * @returns 系统提示词
 */
export function buildSimpleSystemPrompt(agentsContent: string): string {
  const timer = createTimer();
  logMethodCall(logger, { method: "buildSimpleSystemPrompt", module: "system-prompt", params: { contentLength: agentsContent.length } });

  try {
    const result = agentsContent;
    logMethodReturn(logger, { method: "buildSimpleSystemPrompt", module: "system-prompt", result: { length: result.length }, duration: timer() });
    return result;
  } catch (err) {
    const error = err as Error;
    logMethodError(logger, { method: "buildSimpleSystemPrompt", module: "system-prompt", error: { name: error.name, message: error.message, ...(error.stack ? { stack: error.stack } : {}) }, params: { contentLength: agentsContent.length }, duration: timer() });
    throw error;
  }
}

/**
 * 构建带工具列表的系统提示词
 *
 * @param agentsContent Agent 角色定义
 * @param tools 可用工具名称列表
 * @returns 系统提示词
 */
export function buildSystemPromptWithTools(
  agentsContent: string,
  tools: string[],
): string {
  const timer = createTimer();
  logMethodCall(logger, { method: "buildSystemPromptWithTools", module: "system-prompt", params: { contentLength: agentsContent.length, toolCount: tools.length } });

  try {
    const sections = [agentsContent];

    if (tools.length > 0) {
      sections.push(buildToolsPrompt(tools));
    }

    const result = sections.join("\n\n");
    logMethodReturn(logger, { method: "buildSystemPromptWithTools", module: "system-prompt", result: { length: result.length }, duration: timer() });
    return result;
  } catch (err) {
    const error = err as Error;
    logMethodError(logger, { method: "buildSystemPromptWithTools", module: "system-prompt", error: { name: error.name, message: error.message, ...(error.stack ? { stack: error.stack } : {}) }, params: { contentLength: agentsContent.length, toolCount: tools.length }, duration: timer() });
    throw error;
  }
}

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 格式化提示词区块
 *
 * @param title 区块标题
 * @param content 区块内容
 * @returns 格式化后的区块
 */
function formatSection(title: string, content: string): string {
  return `## ${title}\n\n${content.trim()}`;
}

/**
 * 构建工具列表提示词
 *
 * @param tools 工具名称列表
 * @returns 工具提示词
 */
function buildToolsPrompt(tools: string[]): string {
  const toolList = tools.map((tool) => `- ${tool}`).join("\n");
  return TOOLS_PROMPT_TEMPLATE.replace("{{toolList}}", toolList);
}

/**
 * 构建日期时间提示词
 *
 * @param currentDate 当前日期时间
 * @returns 日期提示词
 */
function buildDatePrompt(currentDate: string): string {
  return DATE_PROMPT_TEMPLATE.replace("{{currentDate}}", currentDate);
}

/**
 * 获取当前日期时间字符串
 *
 * @returns 格式化的日期时间字符串
 */
export function getCurrentDateString(): string {
  const timer = createTimer();
  logMethodCall(logger, { method: "getCurrentDateString", module: "system-prompt", params: {} });

  try {
    const now = new Date();
    const options: Intl.DateTimeFormatOptions = {
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "long",
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
    };
    const result = now.toLocaleDateString("zh-CN", options);
    logMethodReturn(logger, { method: "getCurrentDateString", module: "system-prompt", result, duration: timer() });
    return result;
  } catch (err) {
    const error = err as Error;
    logMethodError(logger, { method: "getCurrentDateString", module: "system-prompt", error: { name: error.name, message: error.message, ...(error.stack ? { stack: error.stack } : {}) }, params: {}, duration: timer() });
    throw error;
  }
}

/**
 * 估算提示词 token 数量
 *
 * 使用简单的字符估算方法，中文约 1.5 字符/token，英文约 4 字符/token
 *
 * @param text 文本内容
 * @returns 估算的 token 数量
 */
export function estimateTokenCount(text: string): number {
  const timer = createTimer();
  logMethodCall(logger, { method: "estimateTokenCount", module: "system-prompt", params: { textLength: text.length } });

  try {
    // 简单估算：中文字符约 1.5 字符/token，英文约 4 字符/token
    const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
    const otherChars = text.length - chineseChars;

    const result = Math.ceil(chineseChars / 1.5 + otherChars / 4);
    logMethodReturn(logger, { method: "estimateTokenCount", module: "system-prompt", result: { tokenCount: result, chineseChars, otherChars }, duration: timer() });
    return result;
  } catch (err) {
    const error = err as Error;
    logMethodError(logger, { method: "estimateTokenCount", module: "system-prompt", error: { name: error.name, message: error.message, ...(error.stack ? { stack: error.stack } : {}) }, params: { textLength: text.length }, duration: timer() });
    throw error;
  }
}