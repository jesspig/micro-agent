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
} from "../../shared/security.js";

// ============================================================================
// 常量定义
// ============================================================================

/** 已处理消息 ID 最大容量 */
const MAX_PROCESSED_IDS = 1000;

/** 已处理消息 ID 过期时间（毫秒）- 24小时 */
const PROCESSED_IDS_MAX_AGE = 24 * 60 * 60 * 1000;

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
  }

  async start(_config: ChannelConfig): Promise<void> {
    const { clientId, clientSecret } = this.config;

    if (!clientId || !clientSecret) {
      throw new Error("钉钉 Channel 需要 clientId 和 clientSecret 配置");
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

      // 启动定时清理（每小时清理一次过期消息 ID）
      this.cleanupTimer = setInterval(() => this.cleanupProcessedIds(), 60 * 60 * 1000);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.setConnected(false, errMsg);
      // 不抛出异常，允许其他 Channel 正常启动
    }
  }

  async stop(): Promise<void> {
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
  }

  async send(message: OutboundMessage): Promise<SendResult> {
    const format = message.format || "text";
    const isMarkdown = format === "markdown";

    // 应用消息长度限制
    const text = truncateMessage(
      isMarkdown ? convertMarkdown(message.text) : message.text
    );

    // 优先使用 sessionWebhook 回复（群聊会 @ 发送者）
    const sessionWebhook = message.metadata?.sessionWebhook as string | undefined;
    if (sessionWebhook) {
      return this.sendViaSessionWebhook(sessionWebhook, text, isMarkdown);
    }

    // 回退到 API 方式
    const token = await this.getAccessToken();
    if (!token) {
      return { success: false, error: "无法获取 Access Token" };
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
        return { success: false, error: result.errmsg || "发送失败" };
      }

      return { success: true };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      return { success: false, error: errMsg };
    }
  }

  /**
   * 更新已有消息（用于流式输出）
   * 钉钉 API: PUT /v1.0/robot/oToMessages/{messageId}
   */
  async updateMessage(messageId: string, text: string, format?: "text" | "markdown"): Promise<SendResult> {
    const token = await this.getAccessToken();
    if (!token) {
      return { success: false, error: "无法获取 Access Token" };
    }

    try {
      const url = `https://api.dingtalk.com/v1.0/robot/oToMessages/${messageId}`;
      const isMarkdown = format === "markdown";

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
        return { success: false, error: result.errmsg || "更新失败" };
      }

      return { success: true, messageId };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      return { success: false, error: errMsg };
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
    // URL 安全验证
    if (!isSafeWebhookUrlForPlatform(webhookUrl, "dingtalk")) {
      return { success: false, error: "不安全的 Webhook URL" };
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
        return { success: false, error: result.errmsg || "发送失败" };
      }

      return { success: true };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      return { success: false, error: errMsg };
    }
  }

  /**
   * 获取 Access Token
   */
  private async getAccessToken(): Promise<string | null> {
    if (this.accessToken && Date.now() < this.tokenExpiry) {
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
        return this.accessToken;
      }

      return null;
    } catch {
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
    const now = Date.now();
    let cleaned = 0;

    for (const [id, timestamp] of this.processedIds) {
      if (now - timestamp > PROCESSED_IDS_MAX_AGE) {
        this.processedIds.delete(id);
        cleaned++;
      }
    }

    // 如果仍然超过容量，删除最旧的条目
    if (this.processedIds.size > MAX_PROCESSED_IDS) {
      const entries = Array.from(this.processedIds.entries());
      const toDelete = entries
        .sort((a, b) => a[1] - b[1])
        .slice(0, this.processedIds.size - MAX_PROCESSED_IDS);

      for (const [id] of toDelete) {
        this.processedIds.delete(id);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      // 记录清理但不做输出
    }
  }

  /**
   * 处理机器人消息
   */
  private async handleBotMessage(res: DWClientDownStream): Promise<void> {
    try {
      const data: DingTalkMessageData = JSON.parse(res.data);

      // 消息去重检查
      const msgId = data.msgId;
      if (msgId && this.isProcessed(msgId)) {
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
        return;
      }

      const senderId = data.senderStaffId || data.senderId || "unknown";
      const conversationType = data.conversationType;
      const conversationId = data.conversationId || data.openConversationId;
      const sessionWebhook = data.sessionWebhook;

      // 权限检查
      const allowList = this.config.allowFrom || [];
      if (allowList.length > 0 && !allowList.includes("*") && !allowList.includes(senderId)) {
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

      this.emitMessage(inboundMsg);
    } catch {
      // 处理消息错误，静默处理
    }
  }
}

/**
 * 创建钉钉 Channel 实例
 */
export function createDingTalkChannel(config: DingTalkBotConfig): DingTalkChannel {
  return new DingTalkChannel(config);
}