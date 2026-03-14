/**
 * 钉钉机器人 Channel 实现
 * 
 * 使用钉钉官方 Stream SDK 实现 Stream 模式
 * 参考: https://github.com/open-dingtalk/dingtalk-stream-sdk-nodejs
 */

import { DWClient, type DWClientDownStream } from "dingtalk-stream-sdk-nodejs";
import type { ChannelConfig, InboundMessage, OutboundMessage, SendResult } from "../../runtime/channel/types.js";
import { BaseChannel } from "../../runtime/channel/base.js";
import type { ChannelCapabilities } from "../../runtime/types.js";

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
    media: false,
    reply: true,
    edit: false,
    delete: false,
  };

  /** 钉钉特定配置 */
  declare config: DingTalkBotConfig;

  /** 钉钉 Stream 客户端 */
  private client: DWClient | null = null;

  /** Access Token（用于 API 调用） */
  private accessToken: string | null = null;
  private tokenExpiry = 0;

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

    console.log("[钉钉] 正在初始化 Stream SDK...");

    // 创建钉钉 Stream 客户端
    this.client = new DWClient({
      clientId,
      clientSecret,
    });

    // 注册机器人消息回调
    this.client.registerCallbackListener(
      "/v1.0/im/bot/messages/get",
      async (res: DWClientDownStream) => {
        await this.handleBotMessage(res);
      }
    );

    // 建立 Stream 连接
    await this.client.connect();

    console.log("[钉钉] Stream SDK 已启动");
    this.setConnected(true);
  }

  async stop(): Promise<void> {
    if (this.client) {
      this.client.disconnect();
      this.client = null;
    }

    this.setConnected(false);
    console.log("[钉钉] Bot 已停止");
  }

  async send(message: OutboundMessage): Promise<SendResult> {
    // 优先使用 sessionWebhook 回复（群聊会 @ 发送者）
    const sessionWebhook = message.metadata?.sessionWebhook as string | undefined;
    if (sessionWebhook) {
      return this.sendViaSessionWebhook(sessionWebhook, message.text);
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

      const payload = isGroup
        ? {
            robotCode: this.config.clientId,
            openConversationId: chatId,
            msgKey: "sampleText",
            msgParam: JSON.stringify({ content: message.text }),
          }
        : {
            robotCode: this.config.clientId,
            userIds: [chatId],
            msgKey: "sampleText",
            msgParam: JSON.stringify({ content: message.text }),
          };

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-acs-dingtalk-access-token": token,
        },
        body: JSON.stringify(payload),
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = (await response.json()) as any;

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
   * 通过 sessionWebhook 发送消息
   */
  private async sendViaSessionWebhook(webhookUrl: string, text: string): Promise<SendResult> {
    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          msgtype: "text",
          text: { content: text },
        }),
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = (await response.json()) as any;

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

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = (await response.json()) as any;

      if (result.accessToken) {
        this.accessToken = result.accessToken;
        // 提前 60 秒过期
        this.tokenExpiry = Date.now() + (result.expireIn || 7200) * 1000 - 60000;
        return this.accessToken;
      }

      return null;
    } catch (error) {
      console.error("[钉钉] 获取 Access Token 失败:", error);
      return null;
    }
  }

  /**
   * 处理机器人消息
   */
  private async handleBotMessage(res: DWClientDownStream): Promise<void> {
    try {
      const data: DingTalkMessageData = JSON.parse(res.data);

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
      const senderName = data.senderNick || "Unknown";
      const conversationType = data.conversationType;
      const conversationId = data.conversationId || data.openConversationId;
      const sessionWebhook = data.sessionWebhook;

      // 权限检查
      const allowList = this.config.allowFrom || [];
      if (allowList.length > 0 && !allowList.includes("*") && !allowList.includes(senderId)) {
        console.log(`[钉钉] 拒绝来自 ${senderId} 的消息（未在 allowFrom 列表中）`);
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
      console.log(`[钉钉] 收到消息: ${senderName}(${senderId}): ${content}`);
    } catch (error) {
      console.error("[钉钉] 处理机器人消息错误:", error);
    }
  }
}

/**
 * 创建钉钉 Channel 实例
 */
export function createDingTalkChannel(config: DingTalkBotConfig): DingTalkChannel {
  return new DingTalkChannel(config);
}