/**
 * Token 估算工具
 *
 * 提供基于字符的简单 token 估算功能
 * - 中文字符约 1.5 字符/token
 * - 英文字符约 4 字符/token
 */

import type { Message } from "../../runtime/types.js";
import { sharedLogger, createTimer, logMethodCall, logMethodReturn, logMethodError } from "./logger.js";

const logger = sharedLogger();

// ============================================================================
// Token 估算函数
// ============================================================================

/**
 * 估算字符串的 token 数量
 *
 * 使用简单的字符估算方法：
 * - 中文字符约 1.5 字符/token
 * - 英文字符约 4 字符/token
 *
 * @param text 待估算的文本
 * @returns 估算的 token 数量
 */
export function estimateStringTokens(text: string): number {
  const timer = createTimer();
  logMethodCall(logger, { method: "estimateStringTokens", module: "token-estimator", params: { textLength: text?.length } });

  try {
    let result: number;

    if (!text || text.length === 0) {
      result = 0;
    } else {
      // 统计中文字符
      const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
      const otherChars = text.length - chineseChars;

      // 估算 token 数量
      const chineseTokens = Math.ceil(chineseChars / 1.5);
      const otherTokens = Math.ceil(otherChars / 4);

      result = chineseTokens + otherTokens;
    }

    logMethodReturn(logger, { method: "estimateStringTokens", module: "token-estimator", result, duration: timer() });
    return result;
  } catch (err) {
    const error = err as Error;
    logMethodError(logger, { method: "estimateStringTokens", module: "token-estimator", error: { name: error.name, message: error.message, ...(error.stack ? { stack: error.stack } : {}) }, params: { textLength: text?.length }, duration: timer() });
    throw error;
  }
}

/**
 * 估算消息的 token 数量
 *
 * @param message 消息对象
 * @returns 估算的 token 数量
 */
export function estimateMessageTokens(message: Message): number {
  const timer = createTimer();
  logMethodCall(logger, { method: "estimateMessageTokens", module: "token-estimator", params: { role: message.role, hasContent: !!message.content } });

  try {
    let totalTokens = 0;

    // 估算 content 的 token 数量
    if (typeof message.content === "string") {
      totalTokens += estimateStringTokens(message.content);
    }

    // 估算其他字段的 token 数量
    if (message.name && typeof message.name === "string") {
      totalTokens += estimateStringTokens(message.name);
    }

    if (message.toolCalls) {
      // 工具调用固定估算 15 tokens/tool
      totalTokens += message.toolCalls.length * 15;
    }

    if (message.toolCallId && typeof message.toolCallId === "string") {
      totalTokens += estimateStringTokens(message.toolCallId);
    }

    const result = Math.max(1, totalTokens);
    logMethodReturn(logger, { method: "estimateMessageTokens", module: "token-estimator", result, duration: timer() });
    return result;
  } catch (err) {
    const error = err as Error;
    logMethodError(logger, { method: "estimateMessageTokens", module: "token-estimator", error: { name: error.name, message: error.message, ...(error.stack ? { stack: error.stack } : {}) }, params: { role: message.role }, duration: timer() });
    throw error;
  }
}

/**
 * 估算消息列表的总 token 数量
 *
 * @param messages 消息列表
 * @returns 估算的总 token 数量
 */
export function estimateMessagesTokens(messages: Message[]): number {
  const timer = createTimer();
  logMethodCall(logger, { method: "estimateMessagesTokens", module: "token-estimator", params: { messageCount: messages.length } });

  try {
    const result = messages.reduce((total, message) => {
      return total + estimateMessageTokens(message);
    }, 0);

    logMethodReturn(logger, { method: "estimateMessagesTokens", module: "token-estimator", result, duration: timer() });
    return result;
  } catch (err) {
    const error = err as Error;
    logMethodError(logger, { method: "estimateMessagesTokens", module: "token-estimator", error: { name: error.name, message: error.message, ...(error.stack ? { stack: error.stack } : {}) }, params: { messageCount: messages.length }, duration: timer() });
    throw error;
  }
}

/**
 * 根据上下文窗口选择消息
 *
 * 从消息列表末尾开始，选择不超过指定 token 数量的消息
 * 确保从用户消息开始（避免孤立的 tool_result）
 *
 * @param messages 消息列表
 * @param maxTokens 最大 token 数量
 * @returns 选择后的消息列表
 */
export function selectMessagesByTokens(
  messages: Message[],
  maxTokens: number,
): Message[] {
  const timer = createTimer();
  logMethodCall(logger, { method: "selectMessagesByTokens", module: "token-estimator", params: { messageCount: messages.length, maxTokens } });

  try {
    if (messages.length === 0) {
      logMethodReturn(logger, { method: "selectMessagesByTokens", module: "token-estimator", result: { selectedCount: 0 }, duration: timer() });
      return [];
    }

    // 从末尾开始选择消息
    const selected: Message[] = [];
    let currentTokens = 0;

    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i]!;
      const messageTokens = estimateMessageTokens(message);

      // 检查添加此消息是否会超过限制
      if (currentTokens + messageTokens > maxTokens) {
        // 如果超过限制，检查是否是用户消息
        if (message.role === "user" && selected.length > 0) {
          // 如果是用户消息且已选择了一些消息，则强制包含此用户消息
          // 然后丢弃之前选择的消息（它们会孤立）
          selected.length = 0;
          currentTokens = 0;
          selected.unshift(message);
          currentTokens += messageTokens;
        }
        break;
      }

      // 添加消息
      selected.unshift(message);
      currentTokens += messageTokens;
    }

    // 确保从用户消息开始
    for (let i = 0; i < selected.length; i++) {
      const msg = selected[i]!;
      if (msg.role === "user") {
        const result = selected.slice(i);
        logMethodReturn(logger, { method: "selectMessagesByTokens", module: "token-estimator", result: { selectedCount: result.length, totalTokens: currentTokens }, duration: timer() });
        return result;
      }
    }

    // 如果没有用户消息，返回空列表
    logMethodReturn(logger, { method: "selectMessagesByTokens", module: "token-estimator", result: { selectedCount: 0, reason: "no_user_message" }, duration: timer() });
    return [];
  } catch (err) {
    const error = err as Error;
    logMethodError(logger, { method: "selectMessagesByTokens", module: "token-estimator", error: { name: error.name, message: error.message, ...(error.stack ? { stack: error.stack } : {}) }, params: { messageCount: messages.length, maxTokens }, duration: timer() });
    throw error;
  }
}

/**
 * 检查是否需要压缩上下文
 *
 * @param messages 消息列表
 * @param contextWindowTokens 上下文窗口大小（tokens）
 * @param compressionThreshold 压缩阈值（0-1）
 * @returns 是否需要压缩
 */
export function shouldCompressContext(
  messages: Message[],
  contextWindowTokens: number,
  compressionThreshold: number,
): boolean {
  const timer = createTimer();
  logMethodCall(logger, { method: "shouldCompressContext", module: "token-estimator", params: { messageCount: messages.length, contextWindowTokens, compressionThreshold } });

  try {
    const totalTokens = estimateMessagesTokens(messages);
    const threshold = contextWindowTokens * compressionThreshold;

    const result = totalTokens >= threshold;
    logMethodReturn(logger, { method: "shouldCompressContext", module: "token-estimator", result: { shouldCompress: result, totalTokens, threshold }, duration: timer() });
    return result;
  } catch (err) {
    const error = err as Error;
    logMethodError(logger, { method: "shouldCompressContext", module: "token-estimator", error: { name: error.name, message: error.message, ...(error.stack ? { stack: error.stack } : {}) }, params: { messageCount: messages.length, contextWindowTokens, compressionThreshold }, duration: timer() });
    throw error;
  }
}

/**
 * 计算需要移除的 token 数量
 *
 * @param messages 消息列表
 * @param contextWindowTokens 上下文窗口大小（tokens）
 * @param compressionThreshold 压缩阈值（0-1）
 * @returns 需要移除的 token 数量
 */
export function calculateTokensToRemove(
  messages: Message[],
  contextWindowTokens: number,
  compressionThreshold: number,
): number {
  const timer = createTimer();
  logMethodCall(logger, { method: "calculateTokensToRemove", module: "token-estimator", params: { messageCount: messages.length, contextWindowTokens, compressionThreshold } });

  try {
    const totalTokens = estimateMessagesTokens(messages);
    const targetTokens = contextWindowTokens * compressionThreshold;

    let result: number;
    if (totalTokens <= targetTokens) {
      result = 0;
    } else {
      result = totalTokens - targetTokens;
    }

    logMethodReturn(logger, { method: "calculateTokensToRemove", module: "token-estimator", result, duration: timer() });
    return result;
  } catch (err) {
    const error = err as Error;
    logMethodError(logger, { method: "calculateTokensToRemove", module: "token-estimator", error: { name: error.name, message: error.message, ...(error.stack ? { stack: error.stack } : {}) }, params: { messageCount: messages.length, contextWindowTokens, compressionThreshold }, duration: timer() });
    throw error;
  }
}
