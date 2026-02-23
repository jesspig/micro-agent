/**
 * 消息历史管理器
 * 管理 LLM 对话历史，防止 Token 超限
 */

import type { LLMMessage, MessageManagerConfig } from './types';

/** 默认配置 */
const DEFAULT_CONFIG: MessageManagerConfig = {
  maxMessages: 50,
  truncationStrategy: 'sliding',
  preserveSystemMessages: true,
  preserveRecentCount: 10,
};

/**
 * 消息历史管理器
 * 
 * 功能：
 * 1. 消息数量裁剪（滑动窗口）
 * 2. 工具结果压缩
 * 3. Token 数量估算
 */
export class MessageHistoryManager {
  /** 管理配置 */
  private config: MessageManagerConfig;

  /**
   * 创建消息管理器实例
   * @param config 管理配置
   */
  constructor(config: Partial<MessageManagerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 裁剪消息历史
   * @param messages 原始消息列表
   * @returns 裁剪后的消息列表
   */
  truncate(messages: LLMMessage[]): LLMMessage[] {
    if (messages.length <= this.config.maxMessages) {
      return messages;
    }

    switch (this.config.truncationStrategy) {
      case 'sliding':
        return this.truncateSliding(messages);
      case 'priority':
        return this.truncatePriority(messages);
      case 'summarize':
        // 摘要策略需要外部摘要器支持
        return this.truncateSliding(messages);
      default:
        return this.truncateSliding(messages);
    }
  }

  /**
   * 压缩工具结果
   * 过长的工具结果会被截断
   * @param messages 原始消息列表
   * @returns 压缩后的消息列表
   */
  compressToolResults(messages: LLMMessage[]): LLMMessage[] {
    const MAX_TOOL_RESULT_LENGTH = 2000;

    return messages.map(msg => {
      if (msg.role === 'tool' && typeof msg.content === 'string') {
        if (msg.content.length > MAX_TOOL_RESULT_LENGTH) {
          return {
            ...msg,
            content: msg.content.slice(0, MAX_TOOL_RESULT_LENGTH) + '\n...[结果已截断]',
          };
        }
      }
      return msg;
    });
  }

  /**
   * 估算 Token 数量
   * 使用简单启发式方法：字符数 / 4
   * @param messages 消息列表
   * @returns 估算的 Token 数量
   */
  estimateTokens(messages: LLMMessage[]): number {
    let total = 0;

    for (const msg of messages) {
      // 基础开销
      total += 4; // 角色标记开销

      if (typeof msg.content === 'string') {
        total += Math.ceil(msg.content.length / 4);
      } else if (Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (part.type === 'text' && part.text) {
            total += Math.ceil(part.text.length / 4);
          } else if (part.type === 'image_url') {
            // 图片估算为 85 tokens（低分辨率）或 170-1105（高分辨率）
            total += 85;
          }
        }
      }

      // 工具调用开销
      if (msg.role === 'assistant' && msg.toolCalls) {
        for (const tc of msg.toolCalls) {
          total += Math.ceil(tc.name.length / 4);
          total += Math.ceil(JSON.stringify(tc.arguments).length / 4);
        }
      }
    }

    return total;
  }

  /**
   * 检查是否需要裁剪
   * @param messages 消息列表
   * @returns 是否需要裁剪
   */
  needsTruncation(messages: LLMMessage[]): boolean {
    return messages.length > this.config.maxMessages;
  }

  /**
   * 获取当前配置
   */
  getConfig(): Readonly<MessageManagerConfig> {
    return { ...this.config };
  }

  // ========== 私有方法 ==========

  /**
   * 滑动窗口裁剪
   */
  private truncateSliding(messages: LLMMessage[]): LLMMessage[] {
    const result: LLMMessage[] = [];

    // 保留系统消息
    if (this.config.preserveSystemMessages) {
      const systemMessages = messages.filter(m => m.role === 'system');
      result.push(...systemMessages);
    }

    // 保留最近消息
    const nonSystemMessages = messages.filter(m => m.role !== 'system');
    const recentMessages = nonSystemMessages.slice(-this.config.preserveRecentCount);
    result.push(...recentMessages);

    return result;
  }

  /**
   * 优先级裁剪
   * 优先保留系统消息和用户消息
   */
  private truncatePriority(messages: LLMMessage[]): LLMMessage[] {
    const result: LLMMessage[] = [];
    const systemMessages: LLMMessage[] = [];
    const userMessages: LLMMessage[] = [];
    const otherMessages: LLMMessage[] = [];

    // 分类消息
    for (const msg of messages) {
      if (msg.role === 'system') {
        systemMessages.push(msg);
      } else if (msg.role === 'user') {
        userMessages.push(msg);
      } else {
        otherMessages.push(msg);
      }
    }

    // 按优先级添加
    result.push(...systemMessages);

    const remainingSlots = this.config.maxMessages - result.length;

    // 用户消息保留一半
    const userSlots = Math.floor(remainingSlots / 2);
    const recentUserMessages = userMessages.slice(-userSlots);
    result.push(...recentUserMessages);

    // 其他消息填充剩余
    const otherSlots = this.config.maxMessages - result.length;
    const recentOtherMessages = otherMessages.slice(-otherSlots);
    result.push(...recentOtherMessages);

    return result;
  }
}
