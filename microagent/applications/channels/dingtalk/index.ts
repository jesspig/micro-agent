/**
 * 钉钉机器人 Channel 实现
 * 
 * 使用钉钉官方 Stream SDK 实现 Stream 模式
 * 参考: https://github.com/open-dingtalk/dingtalk-stream-sdk-nodejs
 */

import { DWClient, type DWClientDownStream } from "dingtalk-stream-sdk-nodejs";
import type { ChannelConfig, InboundMessage, OutboundMessage, SendResult } from "../../../runtime/channel/types.js";
import { BaseChannel } from "../../../runtime/channel/base.js";
import type { ChannelCapabilities } from "../../../runtime/types.js";
import { convertMarkdown } from "./markdown.js";
import {
  isSafeWebhookUrlForPlatform,
  truncateMessage,
  truncateForLog,
} from "../../shared/security.js";
import { channelsLogger, createTimer, sanitize, logMethodCall, logMethodReturn, logMethodError } from "../../shared/logger.js";

const logger = channelsLogger();

// ============================================================================
// 常量定义
// ============================================================================

/** 已处理消息 ID 最大缓存数量 */
const MAX_PROCESSED_IDS = 10000;

/** 已处理消息 ID 过期时间（毫秒），默认 1 小时 */
const PROCESSED_IDS_MAX_AGE = 60 * 60 * 1000;

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 钉钉机器人配置
 */
export interface DingTalkBotConfig extends ChannelConfig {
  /** Client ID（AppKey） */
  clientId: string;
  /** Client Secret（AppSecret） */
  clientSecret: string;
  /** 允许发送消息的用户列表 */
  allowFrom?: string[] | undefined;
}

/**
 * 钉钉 API 响应结构
 */
interface DingTalkApiResponse {
  errcode?: number;
  errmsg?: string;
  processQueryKey?: string;
}

/**
 * 钉钉 Token 响应结构
 */
interface DingTalkTokenResponse {
  accessToken?: string;
  expireIn?: number;
  errcode?: number;
  errmsg?: string;
}

/**
 * 钉钉消息数据结构
 */
interface DingTalkMessageData {
  text?: { content: string } | string;
  senderStaffId?: string;
  senderNick?: string;
  senderId?: string;
  conversationType?: string;
  conversationId?: string;
  openConversationId?: string;
  sessionWebhook?: string;
  sessionWebhookExpiredTime?: number;
  chatbotUserId?: string;
  isAdmin?: boolean;
  isInAtList?: boolean;
  msgId?: string;
  conversationTitle?: string;
  atUsers?: Array<{ dingtalkId: string }>;
}

// ============================================================================
// 钉钉 Channel 实现
// ============================================================================

/**
 * 钉钉机器人 Channel
 * 
 * 使用钉钉官方 Stream SDK
 * - 无需手动处理 WebSocket
 * - 自动重连和心跳
 * - 支持单聊和群聊
 */
export class DingTalkChannel extends BaseChannel {
  /** Channel 名称常量 */
  private static readonly CHANNEL_NAME = "DingTalkChannel";

  readonly id: string;
  readonly type = "dingtalk" as const;
  readonly capabilities: ChannelCapabilities = {
    text: true,
    markdown: true,
    media: false,
    reply: true,
    edit: true,
    delete: false,
    streaming: true,
  };

  /** 钉钉特定配置 */
  declare config: DingTalkBotConfig;

  /** 钉钉 Stream 客户端 */
  private client: DWClient | null = null;

  /** Access Token（用于 API 调用） */
  private accessToken: string | null = null;
  private tokenExpiry = 0;

  /** 已处理消息 ID 集合（防重） */
  private processedIds = new Map<string, number>();

  /** 清理定时器 */
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: DingTalkBotConfig) {
    super(config);
    this.id = config.id;
    this.config = config;
    logger.debug("创建 DingTalkChannel 实例", { clientId: config.clientId });
  }

  async start(_config: ChannelConfig): Promise<void> {
    const timer = createTimer();
    const { clientId, clientSecret } = this.config;

    logMethodCall(logger, { method: "start", module: DingTalkChannel.CHANNEL_NAME, params: { clientId } });

    if (!clientId || !clientSecret) {
      const error = new Error("钉钉 Channel 需要 clientId 和 clientSecret 配置");
      logMethodError(logger, { method: "start", module: DingTalkChannel.CHANNEL_NAME, error: { name: error.name, message: error.message }, params: { clientId }, duration: timer() });
      throw error;
    }

    const self = this;

    try {
      // 创建钉钉 Stream 客户端并链式调用
      // 注意：connect() 不返回 Promise，需要通过事件监听确认连接成功
      this.client = new DWClient({
        clientId,
        clientSecret,
      });

      // 注册机器人消息回调（链式调用）
      this.client
        .registerCallbackListener(
          "/v1.0/im/bot/messages/get",
          async (res: DWClientDownStream) => {
            await self.handleBotMessage(res);
          }
        )
        .connect();

      this.setConnected(true);
      logger.info("钉钉 Stream 连接成功", { clientId });
      logger.info("钉钉 Channel 启动成功", { clientId });

      // 启动定时清理（每小时清理一次过期消息 ID）
      this.cleanupTimer = setInterval(() => this.cleanupProcessedIds(), 60 * 60 * 1000);
      logMethodReturn(logger, { method: "start", module: DingTalkChannel.CHANNEL_NAME, result: { success: true }, duration: timer() });
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.setConnected(false, errMsg);
      logMethodError(logger, { method: "start", module: DingTalkChannel.CHANNEL_NAME, error: { name: "Error", message: errMsg }, params: { clientId }, duration: timer() });
      // 不抛出异常，允许其他 Channel 正常启动
    }
  }

  async stop(): Promise<void> {
    const timer = createTimer();
    const { clientId } = this.config;
    logMethodCall(logger, { method: "stop", module: DingTalkChannel.CHANNEL_NAME, params: { clientId } });

    // 停止清理定时器
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    if (this.client) {
      this.client.disconnect();
      this.client = null;
    }

    // 清理已处理消息 ID
    this.processedIds.clear();

    this.setConnected(false);
    logger.info("钉钉 Channel 已停止", { clientId });
    logMethodReturn(logger, { method: "stop", module: DingTalkChannel.CHANNEL_NAME, result: { success: true }, duration: timer() });
  }

  async send(message: OutboundMessage): Promise<SendResult> {
    const timer = createTimer();
    logMethodCall(logger, { method: "send", module: DingTalkChannel.CHANNEL_NAME, params: { to: message.to, format: message.format } });

    const format = message.format || "text";
    const isMarkdown = format === "markdown";

    // 应用消息长度限制
    const text = truncateMessage(
      isMarkdown ? convertMarkdown(message.text) : message.text
    );

    // 优先使用 sessionWebhook 回复（群聊会 @ 发送者）
    const sessionWebhook = message.metadata?.sessionWebhook as string | undefined;
    if (sessionWebhook) {
      logger.info("通过 sessionWebhook 发送钉钉消息", { isMarkdown, content: truncateForLog(text) });
      const result = await this.sendViaSessionWebhook(sessionWebhook, text, isMarkdown);
      if (result.success) {
        logger.info("钉钉消息发送成功", { to: message.to });
      }
      logMethodReturn(logger, { method: "send", module: DingTalkChannel.CHANNEL_NAME, result: sanitize(result), duration: timer() });
      return result;
    }

    // 回退到 API 方式
    const token = await this.getAccessToken();
    if (!token) {
      const result = { success: false, error: "无法获取 Access Token" };
      logMethodReturn(logger, { method: "send", module: DingTalkChannel.CHANNEL_NAME, result, duration: timer() });
      return result;
    }

    try {
      const isGroup = message.to.startsWith("group:");
      const chatId = isGroup ? message.to.slice(6) : message.to;

      const url = isGroup
        ? "https://api.dingtalk.com/v1.0/robot/groupMessages/send"
        : "https://api.dingtalk.com/v1.0/robot/oToMessages/batchSend";

      const msgKey = isMarkdown ? "sampleMarkdown" : "sampleText";
      const msgParam = isMarkdown
        ? JSON.stringify({ title: "AI 响应", content: text })
        : JSON.stringify({ content: text });

      const payload = isGroup
        ? {
            robotCode: this.config.clientId,
            openConversationId: chatId,
            msgKey,
            msgParam,
          }
        : {
            robotCode: this.config.clientId,
            userIds: [chatId],
            msgKey,
            msgParam,
          };

      logger.info("通过 API 发送钉钉消息", { isGroup, isMarkdown, content: truncateForLog(text) });

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-acs-dingtalk-access-token": token,
        },
        body: JSON.stringify(payload),
      });

      const result = (await response.json()) as DingTalkApiResponse;

      if (result.errcode && result.errcode !== 0) {
        const sendResult = { success: false, error: result.errmsg || "发送失败" };
        logMethodReturn(logger, { method: "send", module: DingTalkChannel.CHANNEL_NAME, result: sendResult, duration: timer() });
        return sendResult;
      }

      logger.info("钉钉消息发送成功", { to: message.to });
      logMethodReturn(logger, { method: "send", module: DingTalkChannel.CHANNEL_NAME, result: { success: true }, duration: timer() });
      return { success: true };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logMethodError(logger, { method: "send", module: DingTalkChannel.CHANNEL_NAME, error: { name: err.name, message: err.message, stack: err.stack }, params: { to: message.to }, duration: timer() });
      return { success: false, error: err.message };
    }
  }

  /**
   * 更新已有消息（用于流式输出）
   * 钉钉 API: PUT /v1.0/robot/oToMessages/{messageId}
   */
  async updateMessage(messageId: string, text: string, format?: "text" | "markdown"): Promise<SendResult> {
    const timer = createTimer();
    logMethodCall(logger, { method: "updateMessage", module: DingTalkChannel.CHANNEL_NAME, params: { messageId, format } });

    const token = await this.getAccessToken();
    if (!token) {
      const result = { success: false, error: "无法获取 Access Token" };
      logMethodReturn(logger, { method: "updateMessage", module: DingTalkChannel.CHANNEL_NAME, result, duration: timer() });
      return result;
    }

    try {
      const url = `https://api.dingtalk.com/v1.0/robot/oToMessages/${messageId}`;
      const isMarkdown = format === "markdown";

      logger.info("更新钉钉消息", { messageId, isMarkdown });

      const response = await fetch(url, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-acs-dingtalk-access-token": token,
        },
        body: JSON.stringify({
          robotCode: this.config.clientId,
          msgKey: isMarkdown ? "sampleMarkdown" : "sampleText",
          msgParam: JSON.stringify(
            isMarkdown
              ? { title: "AI 响应", content: text }
              : { content: text }
          ),
        }),
      });

      const result = (await response.json()) as DingTalkApiResponse;

      if (result.errcode && result.errcode !== 0) {
        const sendResult = { success: false, error: result.errmsg || "更新失败" };
        logMethodReturn(logger, { method: "updateMessage", module: DingTalkChannel.CHANNEL_NAME, result: sendResult, duration: timer() });
        return sendResult;
      }

      logger.info("钉钉消息更新成功", { messageId });
      logMethodReturn(logger, { method: "updateMessage", module: DingTalkChannel.CHANNEL_NAME, result: { success: true, messageId }, duration: timer() });
      return { success: true, messageId };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logMethodError(logger, { method: "updateMessage", module: DingTalkChannel.CHANNEL_NAME, error: { name: err.name, message: err.message, stack: err.stack }, params: { messageId }, duration: timer() });
      return { success: false, error: err.message };
    }
  }

  /**
   * 通过 sessionWebhook 发送消息
   */
  private async sendViaSessionWebhook(
    webhookUrl: string,
    text: string,
    isMarkdown: boolean
  ): Promise<SendResult> {
    const timer = createTimer();
    logMethodCall(logger, { method: "sendViaSessionWebhook", module: DingTalkChannel.CHANNEL_NAME, params: { isMarkdown } });

    // URL 安全验证
    if (!isSafeWebhookUrlForPlatform(webhookUrl, "dingtalk")) {
      const result = { success: false, error: "不安全的 Webhook URL" };
      logMethodReturn(logger, { method: "sendViaSessionWebhook", module: DingTalkChannel.CHANNEL_NAME, result, duration: timer() });
      return result;
    }

    try {
      const body = isMarkdown
        ? {
            msgtype: "markdown",
            markdown: { title: "AI 响应", text },
          }
        : {
            msgtype: "text",
            text: { content: text },
          };

      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const result = (await response.json()) as DingTalkApiResponse;

      if (result.errcode && result.errcode !== 0) {
        const sendResult = { success: false, error: result.errmsg || "发送失败" };
        logMethodReturn(logger, { method: "sendViaSessionWebhook", module: DingTalkChannel.CHANNEL_NAME, result: sendResult, duration: timer() });
        return sendResult;
      }

      logger.info("钉钉 sessionWebhook 消息发送成功");
      logMethodReturn(logger, { method: "sendViaSessionWebhook", module: DingTalkChannel.CHANNEL_NAME, result: { success: true }, duration: timer() });
      return { success: true };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logMethodError(logger, { method: "sendViaSessionWebhook", module: DingTalkChannel.CHANNEL_NAME, error: { name: err.name, message: err.message, stack: err.stack }, params: {}, duration: timer() });
      return { success: false, error: err.message };
    }
  }

  /**
   * 获取 Access Token
   */
  private async getAccessToken(): Promise<string | null> {
    const timer = createTimer();
    logMethodCall(logger, { method: "getAccessToken", module: DingTalkChannel.CHANNEL_NAME, params: {} });

    if (this.accessToken && Date.now() < this.tokenExpiry) {
      logger.debug("使用缓存的 AccessToken");
      logMethodReturn(logger, { method: "getAccessToken", module: DingTalkChannel.CHANNEL_NAME, result: { cached: true }, duration: timer() });
      return this.accessToken;
    }

    try {
      const response = await fetch("https://api.dingtalk.com/v1.0/oauth2/accessToken", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appKey: this.config.clientId,
          appSecret: this.config.clientSecret,
        }),
      });

      const result = (await response.json()) as DingTalkTokenResponse;

      if (result.accessToken) {
        this.accessToken = result.accessToken;
        // 提前 60 秒过期
        this.tokenExpiry = Date.now() + (result.expireIn || 7200) * 1000 - 60000;
        logger.info("AccessToken 获取成功", { expiresIn: result.expireIn });
        logMethodReturn(logger, { method: "getAccessToken", module: DingTalkChannel.CHANNEL_NAME, result: { success: true }, duration: timer() });
        return this.accessToken;
      }

      logger.warn("AccessToken 获取失败");
      logMethodReturn(logger, { method: "getAccessToken", module: DingTalkChannel.CHANNEL_NAME, result: { success: false }, duration: timer() });
      return null;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logMethodError(logger, { method: "getAccessToken", module: DingTalkChannel.CHANNEL_NAME, error: { name: err.name, message: err.message }, params: {}, duration: timer() });
      return null;
    }
  }

  /**
   * 检查消息是否已处理（防重）
   */
  private isProcessed(msgId: string): boolean {
    if (this.processedIds.has(msgId)) {
      return true;
    }

    // 标记为已处理
    this.processedIds.set(msgId, Date.now());

    // 容量检查
    if (this.processedIds.size > MAX_PROCESSED_IDS) {
      this.cleanupProcessedIds();
    }

    return false;
  }

  /**
   * 清理过期的已处理消息 ID
   */
  private cleanupProcessedIds(): void {
    const timer = createTimer();
    logMethodCall(logger, { method: "cleanupProcessedIds", module: DingTalkChannel.CHANNEL_NAME, params: {} });

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
    logMethodReturn(logger, { method: "cleanupProcessedIds", module: DingTalkChannel.CHANNEL_NAME, result: { cleaned, remaining: this.processedIds.size }, duration: timer() });
  }

  /**
   * 处理机器人消息
   */
  private async handleBotMessage(res: DWClientDownStream): Promise<void> {
    const timer = createTimer();
    logMethodCall(logger, { method: "handleBotMessage", module: DingTalkChannel.CHANNEL_NAME, params: {} });

    try {
      const data: DingTalkMessageData = JSON.parse(res.data);

      // 消息去重检查
      const msgId = data.msgId;
      if (msgId && this.isProcessed(msgId)) {
        logMethodReturn(logger, { method: "handleBotMessage", module: DingTalkChannel.CHANNEL_NAME, result: { skipped: true, reason: "duplicate" }, duration: timer() });
        return;
      }

      // 解析消息内容
      let content = "";
      if (typeof data.text === "string") {
        content = data.text.trim();
      } else if (data.text?.content) {
        content = data.text.content.trim();
      }

      if (!content) {
        logMethodReturn(logger, { method: "handleBotMessage", module: DingTalkChannel.CHANNEL_NAME, result: { skipped: true, reason: "empty" }, duration: timer() });
        return;
      }

      const senderId = data.senderStaffId || data.senderId || "unknown";
      const conversationType = data.conversationType;
      const conversationId = data.conversationId || data.openConversationId;
      const sessionWebhook = data.sessionWebhook;

      // 权限检查
      const allowList = this.config.allowFrom || [];
      if (allowList.length > 0 && !allowList.includes("*") && !allowList.includes(senderId)) {
        logger.debug("钉钉消息权限检查失败", { senderId });
        logMethodReturn(logger, { method: "handleBotMessage", module: DingTalkChannel.CHANNEL_NAME, result: { skipped: true, reason: "permission" }, duration: timer() });
        return;
      }

      // 群聊添加前缀
      const chatId =
        conversationType === "2" && conversationId
          ? `group:${conversationId}`
          : senderId;

      const inboundMsg: InboundMessage = {
        from: senderId,
        to: chatId,
        text: content,
        timestamp: Date.now(),
        channelId: this.id,
        // 存储 sessionWebhook 用于回复
        metadata: sessionWebhook ? { sessionWebhook } : undefined,
      };

      logger.info("钉钉消息接收", { senderId, chatId, msgId, content: truncateForLog(content) });
      this.emitMessage(inboundMsg);
      logMethodReturn(logger, { method: "handleBotMessage", module: DingTalkChannel.CHANNEL_NAME, result: { success: true }, duration: timer() });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logMethodError(logger, { method: "handleBotMessage", module: DingTalkChannel.CHANNEL_NAME, error: { name: err.name, message: err.message }, params: {}, duration: timer() });
    }
  }
}

/**
 * 创建钉钉 Channel 实例
 */
export function createDingTalkChannel(config: DingTalkBotConfig): DingTalkChannel {
  logger.info("创建钉钉 Channel 实例", { clientId: config.clientId });
  return new DingTalkChannel(config);
}
