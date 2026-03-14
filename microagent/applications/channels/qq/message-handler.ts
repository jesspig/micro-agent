/**
 * QQ 频道机器人消息处理模块
 * 
 * 处理各类消息事件和权限检查
 */

import type { InboundMessage } from "../../../runtime/channel/types.js";
import type { QQBotConfig, ChannelMessageData, GroupMessageData, C2CMessageData } from "./types.js";
import { MAX_PROCESSED_IDS, PROCESSED_IDS_MAX_AGE } from "./types.js";

/**
 * 消息处理器
 */
export class QQMessageHandler {
  /** 已处理消息 ID 集合（防重） */
  private processedIds = new Map<string, number>();

  /** 清理定时器 */
  private cleanupTimer: Timer | null = null;

  constructor(
    private config: QQBotConfig,
    private channelId: string,
    private emitMessage: (msg: InboundMessage) => void
  ) {}

  /**
   * 启动定时清理
   */
  startCleanup(): void {
    this.cleanupTimer = setInterval(() => this.cleanupProcessedIds(), 60 * 60 * 1000);
  }

  /**
   * 停止定时清理
   */
  stopCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * 清理资源
   */
  clear(): void {
    this.stopCleanup();
    this.processedIds.clear();
  }

  /**
   * 处理频道消息
   */
  handleChannelMessage(msg: ChannelMessageData): void {
    if (this.shouldSkipMessage(msg.id, msg.author?.bot)) return;

    const senderId = msg.author?.id || "unknown";
    const channelId = msg.channel_id;
    const content = (msg.content || "").trim();

    if (!content) return;

    if (!this.checkChannelPermission(channelId, senderId)) return;

    this.emitInboundMessage(senderId, channelId, content);
    console.log(`[QQ] 收到频道消息[${msg.guild_id}/${channelId}]: ${senderId}: ${content}`);
  }

  /**
   * 处理私聊消息
   */
  handleDirectMessage(msg: ChannelMessageData): void {
    if (this.shouldSkipMessage(msg.id, msg.author?.bot)) return;

    const senderId = msg.author?.id || "unknown";
    const content = (msg.content || "").trim();

    if (!content) return;

    if (!this.checkUserPermission(senderId)) return;

    this.emitInboundMessage(senderId, senderId, content);
    console.log(`[QQ] 收到私聊消息: ${senderId}: ${content}`);
  }

  /**
   * 处理群聊消息
   */
  handleGroupMessage(msg: GroupMessageData): void {
    if (this.shouldSkipMessage(msg.id, msg.author?.bot)) return;

    const senderId = msg.author?.id || "unknown";
    const groupId = msg.group_openid || msg.group_id || "unknown";
    const content = (msg.content || "").trim();

    if (!content) return;

    if (!this.checkUserPermission(senderId)) return;

    this.emitInboundMessage(senderId, groupId, content, {
      groupId,
      groupOpenid: msg.group_openid,
      memberOpenid: msg.author?.member_openid,
    });
    console.log(`[QQ] 收到群聊消息[${groupId}]: ${senderId}: ${content}`);
  }

  /**
   * 处理单聊消息
   */
  handleC2CMessage(msg: C2CMessageData): void {
    if (this.shouldSkipMessage(msg.id, msg.author?.bot)) return;

    const senderId = msg.author?.id || "unknown";
    const userOpenid = msg.author?.user_openid || senderId;
    const content = (msg.content || "").trim();

    if (!content) return;

    if (!this.checkUserPermission(senderId)) return;

    this.emitInboundMessage(senderId, userOpenid, content, { userOpenid });
    console.log(`[QQ] 收到单聊消息: ${senderId}: ${content}`);
  }

  // ============================================================================
  // 私有方法
  // ============================================================================

  /**
   * 检查是否应跳过消息
   */
  private shouldSkipMessage(msgId: string, isBot?: boolean): boolean {
    if (this.isProcessed(msgId)) return true;
    if (isBot) {
      console.log(`[QQ] 跳过机器人消息: ${msgId}`);
      return true;
    }
    return false;
  }

  /**
   * 检查频道权限
   */
  private checkChannelPermission(channelId: string, senderId: string): boolean {
    const allowChannels = this.config.allowChannels || [];
    if (allowChannels.length > 0 && !allowChannels.includes("*") && !allowChannels.includes(channelId)) {
      console.log(`[QQ] 拒绝来自频道 ${channelId} 的消息`);
      return false;
    }
    return this.checkUserPermission(senderId);
  }

  /**
   * 检查用户权限
   */
  private checkUserPermission(senderId: string): boolean {
    const allowFrom = this.config.allowFrom || [];
    if (allowFrom.length > 0 && !allowFrom.includes("*") && !allowFrom.includes(senderId)) {
      console.log(`[QQ] 拒绝来自用户 ${senderId} 的消息`);
      return false;
    }
    return true;
  }

  /**
   * 发送入站消息
   */
  private emitInboundMessage(
    from: string,
    to: string,
    text: string,
    metadata?: Record<string, unknown>
  ): void {
    const inboundMsg: InboundMessage = {
      from,
      to,
      text,
      timestamp: Date.now(),
      channelId: this.channelId,
      ...(metadata && { metadata }),
    };
    this.emitMessage(inboundMsg);
  }

  /**
   * 检查消息是否已处理（防重）
   */
  private isProcessed(msgId: string): boolean {
    if (this.processedIds.has(msgId)) return true;

    this.processedIds.set(msgId, Date.now());

    if (this.processedIds.size > MAX_PROCESSED_IDS) {
      this.cleanupProcessedIds();
    }

    return false;
  }

  /**
   * 清理过期的消息 ID
   */
  private cleanupProcessedIds(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [id, timestamp] of this.processedIds) {
      if (now - timestamp > PROCESSED_IDS_MAX_AGE) {
        this.processedIds.delete(id);
        cleaned++;
      }
    }

    if (this.processedIds.size > MAX_PROCESSED_IDS) {
      const entries = Array.from(this.processedIds.entries());
      const toKeep = entries.sort((a, b) => b[1] - a[1]).slice(0, MAX_PROCESSED_IDS);

      this.processedIds.clear();
      for (const [id, timestamp] of toKeep) {
        this.processedIds.set(id, timestamp);
      }
      cleaned += entries.length - toKeep.length;
    }

    if (cleaned > 0) {
      console.log(`[QQ] 清理了 ${cleaned} 个过期消息 ID，当前数量: ${this.processedIds.size}`);
    }
  }
}
