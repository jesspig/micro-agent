/**
 * 记忆整合提示词
 *
 * 用于 LLM 提取摘要和更新长期记忆
 */

import { promptsLogger, createTimer, logMethodCall, logMethodReturn, logMethodError } from "../shared/logger.js";

const logger = promptsLogger();

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 记忆提取参数
 */
export interface MemoryExtractionParams {
  /** 对话历史 */
  conversationHistory: string;
  /** 现有长期记忆 */
  existingMemory?: string;
  /** 时间范围（可选） */
  timeRange?: string;
}

/**
 * 记忆更新参数
 */
export interface MemoryUpdateParams {
  /** 现有长期记忆 */
  existingMemory: string;
  /** 新提取的信息 */
  newInformation: string;
  /** 更新原因 */
  reason?: string;
}

/**
 * 记忆搜索参数
 */
export interface MemorySearchParams {
  /** 搜索查询 */
  query: string;
  /** 长期记忆内容 */
  memoryContent: string;
}

// ============================================================================
// 记忆提取提示词
// ============================================================================

/**
 * 记忆提取系统提示词
 */
export const MEMORY_EXTRACTION_SYSTEM_PROMPT = `你是一个记忆分析专家。你的任务是从对话历史中提取重要信息，用于更新用户的长期记忆。

## 提取原则

1. **重要性**：只提取对用户有长期价值的信息
2. **准确性**：准确记录事实，不添加推测
3. **简洁性**：用简洁的语言概括信息
4. **分类性**：按照类别组织信息

## 信息类型

重点关注以下类型的信息：
- 用户个人偏好（喜好、习惯、工作方式）
- 重要事件和日期（生日、纪念日、重要会议）
- 项目相关信息（正在进行的项目、任务状态）
- 关键决策和结论
- 用户明确表示要记住的信息

## 输出格式

请使用以下 JSON 格式输出提取的信息：

\`\`\`json
{
  "extracted": [
    {
      "category": "偏好|事件|项目|决策|其他",
      "content": "具体内容",
      "importance": "高|中|低",
      "source": "来源说明"
    }
  ],
  "summary": "本次对话的简要总结"
}
\`\`\``;

/**
 * 记忆提取用户提示词模板
 */
export const MEMORY_EXTRACTION_USER_TEMPLATE = `请分析以下对话历史，提取需要保存到长期记忆的重要信息。

{{conversationHistory}}

{{existingMemorySection}}

请提取重要信息并输出 JSON 格式结果。`;

// ============================================================================
// 记忆更新提示词
// ============================================================================

/**
 * 记忆更新系统提示词
 */
export const MEMORY_UPDATE_SYSTEM_PROMPT = `你是一个记忆管理专家。你的任务是将新提取的信息整合到现有的长期记忆中。

## 整合原则

1. **去重**：避免重复记录相同或相似的信息
2. **更新**：用新信息更新过时的内容
3. **合并**：将相关信息合并为更完整的记录
4. **排序**：按重要性和时间排序信息
5. **保留**：保留所有仍有价值的历史信息

## 输出格式

请直接输出更新后的完整记忆内容，使用 Markdown 格式：

# 用户长期记忆

## 个人偏好
- ...

## 重要事件
- ...

## 项目信息
- ...

## 其他信息
- ...`;

/**
 * 记忆更新用户提示词模板
 */
export const MEMORY_UPDATE_USER_TEMPLATE = `请将以下新信息整合到现有长期记忆中。

## 现有长期记忆

{{existingMemory}}

## 新提取的信息

{{newInformation}}

{{reasonSection}}

请输出更新后的完整记忆内容。`;

// ============================================================================
// 记忆搜索提示词
// ============================================================================

/**
 * 记忆搜索系统提示词
 */
export const MEMORY_SEARCH_SYSTEM_PROMPT = `你是一个记忆检索专家。你的任务是从长期记忆中找出与查询相关的信息。

## 检索原则

1. **相关性**：优先返回与查询直接相关的内容
2. **完整性**：提供完整的上下文，而非碎片信息
3. **准确性**：准确引用原始记忆内容
4. **时效性**：考虑信息的时间有效性

## 输出格式

\`\`\`json
{
  "found": true,
  "results": [
    {
      "content": "匹配的记忆内容",
      "relevance": "高|中|低",
      "context": "相关上下文"
    }
  ],
  "summary": "检索结果摘要"
}
\`\`\``;

/**
 * 记忆搜索用户提示词模板
 */
export const MEMORY_SEARCH_USER_TEMPLATE = `请从以下长期记忆中检索与查询相关的信息。

## 查询

{{query}}

## 长期记忆内容

{{memoryContent}}

请输出检索结果。`;

// ============================================================================
// 提示词构建函数
// ============================================================================

/**
 * 构建记忆提取提示词
 *
 * @param params 提取参数
 * @returns 完整的提取提示词
 */
export function buildMemoryExtractionPrompt(
  params: MemoryExtractionParams,
): { system: string; user: string } {
  const timer = createTimer();
  logMethodCall(logger, { method: "buildMemoryExtractionPrompt", module: "memory-prompt", params: { 
    historyLength: params.conversationHistory.length,
    hasExistingMemory: !!params.existingMemory,
    timeRange: params.timeRange
  } });

  try {
    let userPrompt = MEMORY_EXTRACTION_USER_TEMPLATE.replace(
      "{{conversationHistory}}",
      params.conversationHistory,
    );

    // 添加现有记忆部分
    const memorySection = params.existingMemory
      ? `## 现有长期记忆\n\n${params.existingMemory}\n\n请参考现有记忆，避免重复提取已记录的信息。`
      : "## 现有长期记忆\n\n（暂无现有记忆）";

    userPrompt = userPrompt.replace("{{existingMemorySection}}", memorySection);

    const result = {
      system: MEMORY_EXTRACTION_SYSTEM_PROMPT,
      user: userPrompt,
    };

    logMethodReturn(logger, { method: "buildMemoryExtractionPrompt", module: "memory-prompt", result: { systemLength: result.system.length, userLength: result.user.length }, duration: timer() });
    return result;
  } catch (err) {
    const error = err as Error;
    logMethodError(logger, { method: "buildMemoryExtractionPrompt", module: "memory-prompt", error: { name: error.name, message: error.message, ...(error.stack ? { stack: error.stack } : {}) }, params: {}, duration: timer() });
    throw error;
  }
}

/**
 * 构建记忆更新提示词
 *
 * @param params 更新参数
 * @returns 完整的更新提示词
 */
export function buildMemoryUpdatePrompt(
  params: MemoryUpdateParams,
): { system: string; user: string } {
  const timer = createTimer();
  logMethodCall(logger, { method: "buildMemoryUpdatePrompt", module: "memory-prompt", params: { 
    existingMemoryLength: params.existingMemory.length,
    newInfoLength: params.newInformation.length,
    hasReason: !!params.reason
  } });

  try {
    let userPrompt = MEMORY_UPDATE_USER_TEMPLATE
      .replace("{{existingMemory}}", params.existingMemory)
      .replace("{{newInformation}}", params.newInformation);

    // 添加更新原因
    const reasonSection = params.reason
      ? `## 更新原因\n\n${params.reason}`
      : "";

    userPrompt = userPrompt.replace("{{reasonSection}}", reasonSection);

    const result = {
      system: MEMORY_UPDATE_SYSTEM_PROMPT,
      user: userPrompt,
    };

    logMethodReturn(logger, { method: "buildMemoryUpdatePrompt", module: "memory-prompt", result: { systemLength: result.system.length, userLength: result.user.length }, duration: timer() });
    return result;
  } catch (err) {
    const error = err as Error;
    logMethodError(logger, { method: "buildMemoryUpdatePrompt", module: "memory-prompt", error: { name: error.name, message: error.message, ...(error.stack ? { stack: error.stack } : {}) }, params: {}, duration: timer() });
    throw error;
  }
}

/**
 * 构建记忆搜索提示词
 *
 * @param params 搜索参数
 * @returns 完整的搜索提示词
 */
export function buildMemorySearchPrompt(
  params: MemorySearchParams,
): { system: string; user: string } {
  const timer = createTimer();
  logMethodCall(logger, { method: "buildMemorySearchPrompt", module: "memory-prompt", params: { 
    queryLength: params.query.length,
    memoryContentLength: params.memoryContent.length
  } });

  try {
    const userPrompt = MEMORY_SEARCH_USER_TEMPLATE
      .replace("{{query}}", params.query)
      .replace("{{memoryContent}}", params.memoryContent);

    const result = {
      system: MEMORY_SEARCH_SYSTEM_PROMPT,
      user: userPrompt,
    };

    logMethodReturn(logger, { method: "buildMemorySearchPrompt", module: "memory-prompt", result: { systemLength: result.system.length, userLength: result.user.length }, duration: timer() });
    return result;
  } catch (err) {
    const error = err as Error;
    logMethodError(logger, { method: "buildMemorySearchPrompt", module: "memory-prompt", error: { name: error.name, message: error.message, ...(error.stack ? { stack: error.stack } : {}) }, params: {}, duration: timer() });
    throw error;
  }
}

/**
 * 格式化对话历史用于记忆提取
 *
 * @param messages 消息列表
 * @returns 格式化的对话历史
 */
export function formatConversationHistory(
  messages: Array<{ role: string; content: string }>,
): string {
  const timer = createTimer();
  logMethodCall(logger, { method: "formatConversationHistory", module: "memory-prompt", params: { messageCount: messages.length } });

  try {
    const result = messages
      .map((msg) => {
        const roleLabel = {
          user: "用户",
          assistant: "助手",
          system: "系统",
        }[msg.role] || msg.role;

        return `**${roleLabel}**：${msg.content}`;
      })
      .join("\n\n");

    logMethodReturn(logger, { method: "formatConversationHistory", module: "memory-prompt", result: { length: result.length }, duration: timer() });
    return result;
  } catch (err) {
    const error = err as Error;
    logMethodError(logger, { method: "formatConversationHistory", module: "memory-prompt", error: { name: error.name, message: error.message, ...(error.stack ? { stack: error.stack } : {}) }, params: { messageCount: messages.length }, duration: timer() });
    throw error;
  }
}