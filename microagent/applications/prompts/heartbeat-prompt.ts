/**
 * 心跳决策提示词
 *
 * 用于判断是否执行定时任务
 */

import { promptsLogger, createTimer, sanitize, logMethodCall, logMethodReturn, logMethodError } from "../shared/logger.js";

const logger = promptsLogger();

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 心跳决策参数
 */
export interface HeartbeatDecisionParams {
  /** 心跳任务配置内容（HEARTBEAT.md） */
  heartbeatContent: string;
  /** 当前状态信息 */
  currentState?: {
    /** 上次执行时间 */
    lastExecutionTime?: string;
    /** 已执行的任务 */
    executedTasks?: string[];
    /** 环境变量 */
    environment?: Record<string, string>;
  };
  /** 当前时间 */
  currentTime?: string;
}

/**
 * 心跳决策结果
 */
export interface HeartbeatDecisionResult {
  /** 是否需要执行任务 */
  shouldExecute: boolean;
  /** 需要执行的任务列表 */
  tasks: string[];
  /** 决策原因 */
  reason: string;
}

// ============================================================================
// 心跳决策提示词
// ============================================================================

/**
 * 心跳决策系统提示词
 */
export const HEARTBEAT_SYSTEM_PROMPT = `你是一个任务调度决策专家。你的任务是根据心跳配置和当前状态，判断是否需要执行定时任务。

## 决策原则

1. **时间匹配**：检查任务是否在预定时间执行
2. **条件判断**：验证任务执行的前置条件
3. **去重执行**：避免重复执行已完成的任务
4. **优先级排序**：按优先级排列待执行任务

## 任务类型

常见的心跳任务类型：
- **定时提醒**：在特定时间提醒用户
- **状态检查**：检查系统或服务状态
- **数据同步**：定期同步数据
- **清理任务**：清理过期数据或缓存
- **报告生成**：生成定期报告

## 输出格式

请使用以下 JSON 格式输出决策结果：

\`\`\`json
{
  "shouldExecute": true,
  "tasks": [
    {
      "name": "任务名称",
      "priority": "高|中|低",
      "reason": "执行原因"
    }
  ],
  "reason": "整体决策原因"
}
\`\`\`

如果没有需要执行的任务，请返回：

\`\`\`json
{
  "shouldExecute": false,
  "tasks": [],
  "reason": "无需执行任务的原因"
}
\`\`\``;

/**
 * 心跳决策用户提示词模板
 */
export const HEARTBEAT_USER_TEMPLATE = `请根据以下心跳配置和当前状态，判断是否需要执行定时任务。

## 心跳任务配置

{{heartbeatContent}}

## 当前时间

{{currentTime}}

{{currentStateSection}}

请输出决策结果。`;

/**
 * 心跳执行结果提示词模板
 */
export const HEARTBEAT_RESULT_TEMPLATE = `心跳任务执行完成。

## 执行时间
{{executionTime}}

## 执行结果

{{results}}

请简要总结执行情况。`;

// ============================================================================
// 提示词构建函数
// ============================================================================

/**
 * 构建心跳决策提示词
 *
 * @param params 心跳决策参数
 * @returns 完整的决策提示词
 */
export function buildHeartbeatDecisionPrompt(
  params: HeartbeatDecisionParams,
): { system: string; user: string } {
  const timer = createTimer();
  logMethodCall(logger, { method: "buildHeartbeatDecisionPrompt", module: "heartbeat-prompt", params: { 
    heartbeatContentLength: params.heartbeatContent.length,
    hasCurrentState: !!params.currentState,
    currentTime: params.currentTime
  } });

  try {
    let userPrompt = HEARTBEAT_USER_TEMPLATE
      .replace("{{heartbeatContent}}", params.heartbeatContent)
      .replace("{{currentTime}}", params.currentTime || getCurrentTimeString());

    // 添加当前状态部分
    const stateSection = buildCurrentStateSection(params.currentState);
    userPrompt = userPrompt.replace("{{currentStateSection}}", stateSection);

    const result = {
      system: HEARTBEAT_SYSTEM_PROMPT,
      user: userPrompt,
    };

    logMethodReturn(logger, { method: "buildHeartbeatDecisionPrompt", module: "heartbeat-prompt", result: { systemLength: result.system.length, userLength: result.user.length }, duration: timer() });
    return result;
  } catch (err) {
    const error = err as Error;
    logMethodError(logger, { method: "buildHeartbeatDecisionPrompt", module: "heartbeat-prompt", error: { name: error.name, message: error.message, ...(error.stack ? { stack: error.stack } : {}) }, params: {}, duration: timer() });
    throw error;
  }
}

/**
 * 构建心跳执行结果提示词
 *
 * @param executionTime 执行时间
 * @param results 执行结果列表
 * @returns 结果提示词
 */
export function buildHeartbeatResultPrompt(
  executionTime: string,
  results: Array<{ task: string; status: string; message?: string }>,
): string {
  const timer = createTimer();
  logMethodCall(logger, { method: "buildHeartbeatResultPrompt", module: "heartbeat-prompt", params: { 
    executionTime,
    resultCount: results.length
  } });

  try {
    const resultsText = results
      .map((r) => {
        const statusIcon = r.status === "success" ? "✓" : "✗";
        const messageText = r.message ? `: ${r.message}` : "";
        return `- ${statusIcon} **${r.task}**${messageText}`;
      })
      .join("\n");

    const result = HEARTBEAT_RESULT_TEMPLATE
      .replace("{{executionTime}}", executionTime)
      .replace("{{results}}", resultsText);

    logMethodReturn(logger, { method: "buildHeartbeatResultPrompt", module: "heartbeat-prompt", result: { length: result.length }, duration: timer() });
    return result;
  } catch (err) {
    const error = err as Error;
    logMethodError(logger, { method: "buildHeartbeatResultPrompt", module: "heartbeat-prompt", error: { name: error.name, message: error.message, ...(error.stack ? { stack: error.stack } : {}) }, params: {}, duration: timer() });
    throw error;
  }
}

/**
 * 构建简化版心跳检查提示词
 *
 * @param heartbeatContent 心跳配置内容
 * @returns 检查提示词
 */
export function buildSimpleHeartbeatPrompt(
  heartbeatContent: string,
): { system: string; user: string } {
  const timer = createTimer();
  logMethodCall(logger, { method: "buildSimpleHeartbeatPrompt", module: "heartbeat-prompt", params: { 
    heartbeatContentLength: heartbeatContent.length
  } });

  try {
    const result = {
      system: HEARTBEAT_SYSTEM_PROMPT,
      user: `当前时间：${getCurrentTimeString()}\n\n心跳任务配置：\n${heartbeatContent}\n\n请判断是否需要执行任务。`,
    };

    logMethodReturn(logger, { method: "buildSimpleHeartbeatPrompt", module: "heartbeat-prompt", result: { systemLength: result.system.length, userLength: result.user.length }, duration: timer() });
    return result;
  } catch (err) {
    const error = err as Error;
    logMethodError(logger, { method: "buildSimpleHeartbeatPrompt", module: "heartbeat-prompt", error: { name: error.name, message: error.message, ...(error.stack ? { stack: error.stack } : {}) }, params: {}, duration: timer() });
    throw error;
  }
}

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 构建当前状态区块
 *
 * @param state 当前状态
 * @returns 格式化的状态区块
 */
function buildCurrentStateSection(
  state?: HeartbeatDecisionParams["currentState"],
): string {
  if (!state) {
    return "## 当前状态\n\n（无状态信息）";
  }

  const parts: string[] = ["## 当前状态"];

  if (state.lastExecutionTime) {
    parts.push(`- 上次执行时间：${state.lastExecutionTime}`);
  }

  if (state.executedTasks && state.executedTasks.length > 0) {
    parts.push(`- 已执行任务：${state.executedTasks.join("、")}`);
  }

  if (state.environment && Object.keys(state.environment).length > 0) {
    parts.push("- 环境信息：");
    for (const [key, value] of Object.entries(state.environment)) {
      parts.push(`  - ${key}: ${value}`);
    }
  }

  return parts.join("\n");
}

/**
 * 获取当前时间字符串
 *
 * @returns 格式化的时间字符串
 */
function getCurrentTimeString(): string {
  const now = new Date();
  const options: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  };
  return now.toLocaleDateString("zh-CN", options);
}

/**
 * 解析心跳决策结果
 *
 * @param response LLM 响应文本
 * @returns 解析后的决策结果
 */
export function parseHeartbeatDecision(
  response: string,
): HeartbeatDecisionResult | null {
  const timer = createTimer();
  logMethodCall(logger, { method: "parseHeartbeatDecision", module: "heartbeat-prompt", params: { responseLength: response.length } });

  try {
    // 尝试提取 JSON 块
    const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch && jsonMatch[1]) {
      const parsed = JSON.parse(jsonMatch[1]);
      const result = {
        shouldExecute: parsed.shouldExecute ?? false,
        tasks: extractTaskNames(parsed.tasks),
        reason: parsed.reason ?? "",
      };
      logMethodReturn(logger, { method: "parseHeartbeatDecision", module: "heartbeat-prompt", result: sanitize(result), duration: timer() });
      return result;
    }

    // 尝试直接解析
    const parsed = JSON.parse(response);
    const result = {
      shouldExecute: parsed.shouldExecute ?? false,
      tasks: extractTaskNames(parsed.tasks),
      reason: parsed.reason ?? "",
    };
    logMethodReturn(logger, { method: "parseHeartbeatDecision", module: "heartbeat-prompt", result: sanitize(result), duration: timer() });
    return result;
  } catch (err) {
    // 解析失败返回 null（这是正常情况，不需要记录错误日志）
    logMethodReturn(logger, { method: "parseHeartbeatDecision", module: "heartbeat-prompt", result: null, duration: timer() });
    return null;
  }
}

/**
 * 从任务列表中提取任务名称
 *
 * @param tasks 任务列表（可能是对象数组或字符串数组）
 * @returns 任务名称列表
 */
function extractTaskNames(tasks: unknown): string[] {
  if (!Array.isArray(tasks)) {
    return [];
  }

  return tasks
    .map((t) => {
      if (typeof t === "string") {
        return t;
      }
      if (typeof t === "object" && t !== null && "name" in t) {
        const name = (t as { name?: unknown }).name;
        return typeof name === "string" ? name : JSON.stringify(t);
      }
      return JSON.stringify(t);
    })
    .filter((name): name is string => typeof name === "string");
}