/**
 * Token 估算工具
 *
 * 提供基于字符的简单 token 估算功能
 * - 中文字符约 1.5 字符/token
 * - 英文字符约 4 字符/token
 */

import type { Message } from "../../runtime/types.js";

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
  if (!text || text.length === 0) {
    return 0;
  }

  // 统计中文字符
  const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  const otherChars = text.length - chineseChars;

  // 估算 token 数量
  const chineseTokens = Math.ceil(chineseChars / 1.5);
  const otherTokens = Math.ceil(otherChars / 4);

  return chineseTokens + otherTokens;
}

/**
 * 估算消息的 token 数量
 *
 * @param message 消息对象
 * @returns 估算的 token 数量
 */
export function estimateMessageTokens(message: Message): number {
  let totalTokens = 0;

  // 估算 content 的 token 数量
  const content = message.content;
  if (typeof content === "string") {
    totalTokens += estimateStringTokens(content);
  } else if (Array.isArray(content)) {
    // 处理多模态内容（文本 + 图片等）
    for (const part of content) {
      if (typeof part === "string") {
        totalTokens += estimateStringTokens(part);
      } else if (part.type === "text" && typeof part.text === "string") {
        totalTokens += estimateStringTokens(part.text);
      } else if (part.type === "image_url") {
        // 图片内容固定估算 85 tokens（根据 GPT-4 Vision 的经验值）
        totalTokens += 85;
      }
    }
  }

  // 估算其他字段的 token 数量
  if (message.name && typeof message.name === "string") {
    totalTokens += estimateStringTokens(message.name);
  }

  if (message.tool_calls) {
    // 工具调用固定估算 15 tokens/tool
    totalTokens += message.tool_calls.length * 15;
  }

  if (message.tool_call_id && typeof message.tool_call_id === "string") {
    totalTokens += estimateStringTokens(message.tool_call_id);
  }

  return Math.max(1, totalTokens);
}

/**
 * 估算消息列表的总 token 数量
 *
 * @param messages 消息列表
 * @returns 估算的总 token 数量
 */
export function estimateMessagesTokens(messages: Message[]): number {
  return messages.reduce((total, message) => {
    return total + estimateMessageTokens(message);
  }, 0);
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
  if (messages.length === 0) {
    return [];
  }

  // 从末尾开始选择消息
  const selected: Message[] = [];
  let currentTokens = 0;

  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
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
    if (selected[i].role === "user") {
      return selected.slice(i);
    }
  }

  // 如果没有用户消息，返回空列表
  return [];
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
  const totalTokens = estimateMessagesTokens(messages);
  const threshold = contextWindowTokens * compressionThreshold;

  return totalTokens >= threshold;
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
  const totalTokens = estimateMessagesTokens(messages);
  const targetTokens = contextWindowTokens * compressionThreshold;

  if (totalTokens <= targetTokens) {
    return 0;
  }

  return totalTokens - targetTokens;
}