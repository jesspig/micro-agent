/**
 * 企业微信机器人 Channel 实现
 * 
 * 使用 @wecom/aibot-node-sdk 通过 WebSocket 长连接接收消息
 * 参考: https://developer.work.weixin.qq.com/document/path/101463
 * 
 * 安装依赖: bun add @wecom/aibot-node-sdk
 */

import type { ChannelConfig, InboundMessage, OutboundMessage, SendResult } from "../../runtime/channel/types.js";
import { BaseChannel } from "../../runtime/channel/base.js";
import type { ChannelCapabilities } from "../../runtime/types.js";

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 企业微信机器人配置
 */
export interface WechatWorkBotConfig extends ChannelConfig {
  /** 机器人 ID（智能机器人） */
  botId?: string | undefined;
  /** 机器人密钥 */
  secret?: string | undefined;
  /** Webhook Key（群机器人） */
  webhookKey?: string | undefined;
  /** 企业 ID（企业应用） */
  corpId?: string | undefined;
  /** 应用 ID */
  agentId?: string | undefined;
  /** 允许发送消息的用户列表 */
  allowFrom?: string[] | undefined;
}

// ============================================================================
// 企业微信 Channel 实现
// ============================================================================

/**
 * 企业微信机器人 Channel
 * 
 * 支持三种模式：
 * 1. 智能机器人（推荐）- WebSocket 长连接，支持收发
 * 2. 群机器人 Webhook - 仅支持发送
 * 3. 企业应用 - 功能最全
 */
export class WechatWorkChannel extends BaseChannel {
  readonly id: string;
  readonly type = "wechat-work" as const;
  readonly capabilities: ChannelCapabilities = {
    text: true,
    media: false,
    reply: true,
    edit: false,
    delete: false,
  };

  /** 企业微信特定配置 */
  declare config: WechatWorkBotConfig;

  /** 智能机器人 SDK 实例 */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private wsClient: any = null;

  /** 运行标志 */
  private running = false;

  constructor(config: WechatWorkBotConfig) {
    super(config);
    this.id = config.id;
    this.config = config;
  }

  async start(_config: ChannelConfig): Promise<void> {
    const { botId, secret, webhookKey } = this.config;

    // 模式一：群机器人 Webhook（仅发送，不接收）
    if (webhookKey && !botId) {
      console.log("[企业微信] 使用群机器人 Webhook 模式（仅支持发送消息）");
      this.setConnected(true);
      return;
    }

    // 模式二：智能机器人（WebSocket 长连接）
    if (botId && secret) {
      await this.startSmartBot(botId, secret);
      return;
    }

    throw new Error("企业微信 Channel 需要配置 botId + secret（智能机器人）或 webhookKey（群机器人）");
  }

  /**
   * 启动智能机器人模式
   */
  private async startSmartBot(botId: string, secret: string): Promise<void> {
    try {
      // 动态导入 @wecom/aibot-node-sdk
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sdk: any = await import("@wecom/aibot-node-sdk").catch(() => null);

      if (!sdk) {
        throw new Error("@wecom/aibot-node-sdk 未安装，请运行: bun add @wecom/aibot-node-sdk");
      }

      this.running = true;

      // 创建 WSClient 实例
      // SDK API: new WSClient({ botId, secret })
      this.wsClient = new sdk.WSClient({
        botId,
        secret,
      });

      const self = this;

      // 注册消息处理器
      // SDK API: wsClient.on('message', handler) 或 wsClient.on('message.text', handler)
      this.wsClient.on("message", (frame: { body: { msgid: string; msgtype: string; from: { userid: string }; [key: string]: unknown } }) => {
        self.handleMessage(frame);
      });

      this.wsClient.on("error", (error: Error) => {
        console.error("[企业微信] SDK 错误:", error);
      });

      console.log("[企业微信] 正在连接智能机器人...");
      
      // 启动连接
      // SDK API: wsClient.connect() 返回 this
      this.wsClient.connect();
      this.setConnected(true);
      console.log("[企业微信] 智能机器人已连接");

      // 保持运行
      while (this.running) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    } catch (error) {
      this.setConnected(false, String(error));
      throw error;
    }
  }

  async stop(): Promise<void> {
    this.running = false;
    this.setConnected(false);
    
    if (this.wsClient) {
      try {
        this.wsClient?.disconnect?.();
      } catch {
        // 忽略关闭错误
      }
      this.wsClient = null;
    }
    console.log("[企业微信] Bot 已停止");
  }

  async send(message: OutboundMessage): Promise<SendResult> {
    const { webhookKey } = this.config;

    // 模式一：群机器人 Webhook
    if (webhookKey && !this.wsClient) {
      return this.sendViaWebhook(webhookKey, message);
    }

    // 模式二：智能机器人
    if (this.wsClient) {
      return this.sendViaSmartBot(message);
    }

    return { success: false, error: "企业微信客户端未初始化" };
  }

  /**
   * 通过 Webhook 发送消息
   */
  private async sendViaWebhook(webhookKey: string, message: OutboundMessage): Promise<SendResult> {
    try {
      const url = `https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=${webhookKey}`;
      
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          msgtype: "text",
          text: { content: message.text },
        }),
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await response.json() as any;
      
      if (result.errcode !== 0) {
        return { success: false, error: result.errmsg || "发送失败" };
      }

      return { success: true };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      return { success: false, error: errMsg };
    }
  }

  /** 回复 URL 缓存（按用户 ID） */
  private responseUrls = new Map<string, string>();

  /**
   * 通过智能机器人发送消息
   */
  private async sendViaSmartBot(message: OutboundMessage): Promise<SendResult> {
    try {
      // 优先使用 metadata 中的 responseUrl
      const responseUrl = message.metadata?.responseUrl || this.responseUrls.get(message.to);

      if (responseUrl && typeof responseUrl === "string") {
        // 使用 response_url 回复（推荐方式）
        // 企业微信智能机器人 response_url API
        const response = await fetch(responseUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            msgtype: "text",
            text: { content: message.text },
          }),
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await response.json() as any;

        if (result.errcode && result.errcode !== 0) {
          console.error(`[企业微信] response_url 回复失败 (${result.errcode}): ${result.errmsg}`);
          // 尝试使用 markdown 格式
          const retryResponse = await fetch(responseUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              msgtype: "markdown",
              markdown: { content: message.text },
            }),
          });

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const retryResult = await retryResponse.json() as any;

          if (retryResult.errcode && retryResult.errcode !== 0) {
            console.error(`[企业微信] markdown 格式也失败: ${retryResult.errmsg}`);
            return { success: false, error: retryResult.errmsg || "发送失败" };
          }

          return { success: true };
        }

        return { success: true };
      }

      // 无 response_url，使用 SDK 发送
      return this.sendViaSDK(message);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      return { success: false, error: errMsg };
    }
  }

  /**
   * 通过 SDK 发送消息
   */
  private async sendViaSDK(message: OutboundMessage): Promise<SendResult> {
    try {
      if (!this.wsClient) {
        return { success: false, error: "企业微信客户端未初始化" };
      }

      await this.wsClient.sendMessage(message.to, {
        msgtype: "markdown",
        markdown: { content: message.text },
      });

      return { success: true };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      return { success: false, error: errMsg };
    }
  }

  /**
   * 处理收到的消息
   */
  private handleMessage(frame: { body: { msgid: string; msgtype: string; from: { userid: string }; response_url?: string; [key: string]: unknown } }): void {
    try {
      const body = frame.body;
      let content = "";

      // 提取文本内容
      const bodyWithText = body as unknown as { text?: { content?: string } };
      if (body.msgtype === "text" && bodyWithText.text) {
        content = (bodyWithText.text.content || "").trim();
      } else if (bodyWithText.text) {
        content = (bodyWithText.text.content || "").trim();
      }

      if (!content) {
        return;
      }

      const senderId = body.from?.userid || "unknown";
      const chatId = ((body as { chatid?: string }).chatid) || senderId;
      const responseUrl = body.response_url;

      // 缓存 response_url 用于回复
      if (responseUrl) {
        this.responseUrls.set(senderId, responseUrl);
        // 清理过期缓存（保留最近 100 个）
        if (this.responseUrls.size > 100) {
          const firstKey = this.responseUrls.keys().next().value;
          if (firstKey) this.responseUrls.delete(firstKey);
        }
      }

      // 权限检查
      const allowList = this.config.allowFrom || [];
      if (allowList.length > 0 && !allowList.includes("*") && !allowList.includes(senderId)) {
        console.log(`[企业微信] 拒绝来自 ${senderId} 的消息（未在 allowFrom 列表中）`);
        return;
      }

      const inboundMsg: InboundMessage = {
        from: senderId,
        to: chatId,
        text: content,
        timestamp: Date.now(),
        channelId: this.id,
        metadata: responseUrl ? { responseUrl } : undefined,
      };

      this.emitMessage(inboundMsg);
      console.log(`[企业微信] 收到消息: ${senderId}: ${content}`);
    } catch (error) {
      console.error("[企业微信] 处理消息错误:", error);
    }
  }
}

/**
 * 创建企业微信 Channel 实例
 */
export function createWechatWorkChannel(config: WechatWorkBotConfig): WechatWorkChannel {
  return new WechatWorkChannel(config);
}
