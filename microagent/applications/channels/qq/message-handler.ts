/**
 * QQ 频道机器人消息处理模块
 * 
 * 处理各类消息事件和权限检查
 */

import type { InboundMessage } from "../../../runtime/channel/types.js";
import type { QQBotConfig, ChannelMessageData, GroupMessageData, C2CMessageData } from "./types.js";
import { MAX_PROCESSED_IDS, PROCESSED_IDS_MAX_AGE } from "./types.js";
import { channelsLogger, createTimer, logMethodCall, logMethodReturn } from "../../shared/logger.js";
import { truncateForLog } from "../../shared/security.js";

const logger = channelsLogger();

/** 模块名称常量 */
const MODULE_NAME = "QQMessageHandler";

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
  ) {
    logger.debug("创建 QQMessageHandler 实例", { channelId });
  }

  /**
   * 启动定时清理
   */
  startCleanup(): void {
    logMethodCall(logger, { method: "startCleanup", module: MODULE_NAME, params: {} });
    this.cleanupTimer = setInterval(() => this.cleanupProcessedIds(), 60 * 60 * 1000);
    logger.info("消息 ID 清理定时器已启动");
    logMethodReturn(logger, { method: "startCleanup", module: MODULE_NAME, result: { success: true }, duration: 0 });
  }

  /**
   * 停止定时清理
   */
  stopCleanup(): void {
    logMethodCall(logger, { method: "stopCleanup", module: MODULE_NAME, params: {} });
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
      logger.info("消息 ID 清理定时器已停止");
    }
    logMethodReturn(logger, { method: "stopCleanup", module: MODULE_NAME, result: { success: true }, duration: 0 });
  }

  /**
   * 清理资源
   */
  clear(): void {
    logMethodCall(logger, { method: "clear", module: MODULE_NAME, params: {} });
    this.stopCleanup();
    this.processedIds.clear();
    logger.info("消息处理器资源已清理");
    logMethodReturn(logger, { method: "clear", module: MODULE_NAME, result: { success: true }, duration: 0 });
  }

  /**
   * 处理频道消息
   */
  handleChannelMessage(msg: ChannelMessageData): void {
    const timer = createTimer();
    logMethodCall(logger, { method: "handleChannelMessage", module: MODULE_NAME, params: { msgId: msg.id } });

    if (this.shouldSkipMessage(msg.id, msg.author?.bot)) {
      logMethodReturn(logger, { method: "handleChannelMessage", module: MODULE_NAME, result: { skipped: true }, duration: timer() });
      return;
    }

    const senderId = msg.author?.id || "unknown";
    const channelId = msg.channel_id;
    const content = (msg.content || "").trim();

    if (!content) {
      logMethodReturn(logger, { method: "handleChannelMessage", module: MODULE_NAME, result: { skipped: true, reason: "empty" }, duration: timer() });
      return;
    }

    if (!this.checkChannelPermission(channelId, senderId)) {
      logger.debug("频道消息权限检查失败", { channelId, senderId });
      logMethodReturn(logger, { method: "handleChannelMessage", module: MODULE_NAME, result: { skipped: true, reason: "permission" }, duration: timer() });
      return;
    }

    logger.info("处理频道消息", { msgId: msg.id, senderId, channelId, content: truncateForLog(content) });
    this.emitInboundMessage(senderId, channelId, content);
    logMethodReturn(logger, { method: "handleChannelMessage", module: MODULE_NAME, result: { success: true }, duration: timer() });
  }

  /**
   * 处理私聊消息
   */
  handleDirectMessage(msg: ChannelMessageData): void {
    const timer = createTimer();
    logMethodCall(logger, { method: "handleDirectMessage", module: MODULE_NAME, params: { msgId: msg.id } });

    if (this.shouldSkipMessage(msg.id, msg.author?.bot)) {
      logMethodReturn(logger, { method: "handleDirectMessage", module: MODULE_NAME, result: { skipped: true }, duration: timer() });
      return;
    }

    const senderId = msg.author?.id || "unknown";
    const content = (msg.content || "").trim();

    if (!content) {
      logMethodReturn(logger, { method: "handleDirectMessage", module: MODULE_NAME, result: { skipped: true, reason: "empty" }, duration: timer() });
      return;
    }

    if (!this.checkUserPermission(senderId)) {
      logger.debug("私聊消息权限检查失败", { senderId });
      logMethodReturn(logger, { method: "handleDirectMessage", module: MODULE_NAME, result: { skipped: true, reason: "permission" }, duration: timer() });
      return;
    }

    logger.info("处理私聊消息", { msgId: msg.id, senderId, content: truncateForLog(content) });
    this.emitInboundMessage(senderId, senderId, content);
    logMethodReturn(logger, { method: "handleDirectMessage", module: MODULE_NAME, result: { success: true }, duration: timer() });
  }

  /**
   * 处理群聊消息
   */
  handleGroupMessage(msg: GroupMessageData): void {
    const timer = createTimer();
    logMethodCall(logger, { method: "handleGroupMessage", module: MODULE_NAME, params: { msgId: msg.id } });

    if (this.shouldSkipMessage(msg.id, msg.author?.bot)) {
      logMethodReturn(logger, { method: "handleGroupMessage", module: MODULE_NAME, result: { skipped: true }, duration: timer() });
      return;
    }

    const senderId = msg.author?.id || "unknown";
    const groupId = msg.group_openid || msg.group_id || "unknown";
    const content = (msg.content || "").trim();

    if (!content) {
      logMethodReturn(logger, { method: "handleGroupMessage", module: MODULE_NAME, result: { skipped: true, reason: "empty" }, duration: timer() });
      return;
    }

    if (!this.checkUserPermission(senderId)) {
      logger.debug("群聊消息权限检查失败", { senderId });
      logMethodReturn(logger, { method: "handleGroupMessage", module: MODULE_NAME, result: { skipped: true, reason: "permission" }, duration: timer() });
      return;
    }

    logger.info("处理群聊消息", { msgId: msg.id, senderId, groupId, content: truncateForLog(content) });
    this.emitInboundMessage(senderId, groupId, content, {
      groupId,
      groupOpenid: msg.group_openid,
      memberOpenid: msg.author?.member_openid,
    });
    logMethodReturn(logger, { method: "handleGroupMessage", module: MODULE_NAME, result: { success: true }, duration: timer() });
  }

  /**
   * 处理单聊消息
   */
  handleC2CMessage(msg: C2CMessageData): void {
    const timer = createTimer();
    logMethodCall(logger, { method: "handleC2CMessage", module: MODULE_NAME, params: { msgId: msg.id } });

    if (this.shouldSkipMessage(msg.id, msg.author?.bot)) {
      logMethodReturn(logger, { method: "handleC2CMessage", module: MODULE_NAME, result: { skipped: true }, duration: timer() });
      return;
    }

    const senderId = msg.author?.id || "unknown";
    const userOpenid = msg.author?.user_openid || senderId;
    const content = (msg.content || "").trim();

    if (!content) {
      logMethodReturn(logger, { method: "handleC2CMessage", module: MODULE_NAME, result: { skipped: true, reason: "empty" }, duration: timer() });
      return;
    }

    if (!this.checkUserPermission(senderId)) {
      logger.debug("单聊消息权限检查失败", { senderId });
      logMethodReturn(logger, { method: "handleC2CMessage", module: MODULE_NAME, result: { skipped: true, reason: "permission" }, duration: timer() });
      return;
    }

    logger.info("处理单聊消息", { msgId: msg.id, senderId, userOpenid, content: truncateForLog(content) });
    this.emitInboundMessage(senderId, userOpenid, content, { userOpenid });
    logMethodReturn(logger, { method: "handleC2CMessage", module: MODULE_NAME, result: { success: true }, duration: timer() });
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
      logger.debug("跳过机器人消息", { msgId });
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
    logger.info("发送入站消息", { from, to, channelId: this.channelId });
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
    const timer = createTimer();
    logMethodCall(logger, { method: "cleanupProcessedIds", module: MODULE_NAME, params: {} });

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
      logger.info("清理过期消息 ID", { cleaned, remaining: this.processedIds.size });
    }
    logMethodReturn(logger, { method: "cleanupProcessedIds", module: MODULE_NAME, result: { cleaned, remaining: this.processedIds.size }, duration: timer() });
  }
}