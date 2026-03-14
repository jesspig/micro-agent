/**
 * 企业微信机器人 Channel 实现
 * 
 * 使用 @wecom/aibot-node-sdk 通过 WebSocket 长连接接收消息
 * 参考: https://developer.work.weixin.qq.com/document/path/101463
 * 
 * 安装依赖: bun add @wecom/aibot-node-sdk
 */

import type { ChannelConfig, InboundMessage, OutboundMessage, SendResult } from "../../../runtime/channel/types.js";
import { BaseChannel } from "../../../runtime/channel/base.js";
import type { ChannelCapabilities } from "../../../runtime/types.js";
import { convertMarkdown } from "./markdown.js";
import { truncateMessage, getMessageLimit, sanitizeMarkdown } from "../../shared/security.js";

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

/**
 * 企业微信 SDK 消息帧类型
 */
interface WecomMessageFrame {
  body: {
    msgid: string;
    msgtype: string;
    from: { userid: string };
    response_url?: string;
    chatid?: string;
    text?: { content?: string };
    [key: string]: unknown;
  };
}

/**
 * 企业微信 API 响应类型
 */
interface WecomApiResponse {
  errcode?: number;
  errmsg?: string;
}

/**
 * 企业微信 SDK 客户端接口
 * 使用 unknown 避免与 SDK 内部类型冲突
 */
interface WecomWSClient {
  on(event: string, handler: (data: unknown) => void): void;
  connect(): void;
  disconnect(): void;
  sendMessage(to: string, payload: unknown): Promise<unknown>;
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
    markdown: true,
    media: false,
    reply: true,
    edit: false,
    delete: false,
    streaming: true, // 支持流式输出
  };

  /** 企业微信特定配置 */
  declare config: WechatWorkBotConfig;

  /** 智能机器人 SDK 实例 */
  private wsClient: WecomWSClient | null = null;

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
      const sdk = await import("@wecom/aibot-node-sdk").catch(() => null);

      if (!sdk) {
        throw new Error("@wecom/aibot-node-sdk 未安装，请运行: bun add @wecom/aibot-node-sdk");
      }

      this.running = true;

      // 创建 WSClient 实例
      // SDK API: new WSClient({ botId, secret })
      this.wsClient = new sdk.WSClient({
        botId,
        secret,
      }) as WecomWSClient;

      const self = this;

      // 注册消息处理器
      // SDK API: wsClient.on('message', handler) 或 wsClient.on('message.text', handler)
      this.wsClient.on("message", (frame: unknown) => {
        self.handleMessage(frame as WecomMessageFrame);
      });

      this.wsClient.on("error", (error: unknown) => {
        console.error("[企业微信] SDK 错误:", error instanceof Error ? error.message : "未知错误");
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
      this.setConnected(false, error instanceof Error ? error.message : String(error));
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

  /**
   * 更新已有消息（用于流式输出）
   * 企业微信通过 response_url 实现消息覆盖
   * @param messageId - 消息 ID（userId 或直接的 responseUrl）
   * @param text - 新消息内容
   * @param format - 消息格式
   * @returns 发送结果
   */
  async updateMessage(messageId: string, text: string, format?: "text" | "markdown"): Promise<SendResult> {
    // messageId 可能是 responseUrl 或 userId
    let responseUrl: string;

    // 检查 messageId 是否直接是 URL
    if (messageId.startsWith("http")) {
      responseUrl = messageId;
    } else {
      // 从缓存中获取 responseUrl
      const cachedUrl = this.responseUrls.get(messageId);
      if (!cachedUrl) {
        return { success: false, error: "未找到消息的 response_url" };
      }
      responseUrl = cachedUrl;
    }

    try {
      const useMarkdown = format !== "text";

      // 应用消息长度限制
      const maxLength = getMessageLimit("wechatWork", useMarkdown);
      const truncatedText = truncateMessage(text, maxLength);

      // 清理 Markdown 内容
      const safeText = useMarkdown ? sanitizeMarkdown(truncatedText) : truncatedText;

      const payload = useMarkdown
        ? { msgtype: "markdown", markdown: { content: safeText } }
        : { msgtype: "text", text: { content: safeText } };

      const response = await fetch(responseUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = (await response.json()) as WecomApiResponse;

      if (result.errcode && result.errcode !== 0) {
        return { success: false, error: result.errmsg || "更新失败" };
      }

      return { success: true, messageId };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      return { success: false, error: errMsg };
    }
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
      
      // 根据 message.format 决定消息格式
      const useMarkdown = message.format !== "text";

      // 应用消息长度限制
      const maxLength = getMessageLimit("wechatWork", useMarkdown);
      const truncatedText = truncateMessage(message.text, maxLength);
      
      // 应用 markdown 转换和清理
      const text = useMarkdown ? sanitizeMarkdown(convertMarkdown(truncatedText)) : truncatedText;
      
      const payload = useMarkdown
        ? { msgtype: "markdown", markdown: { content: text } }
        : { msgtype: "text", text: { content: text } };
      
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = (await response.json()) as WecomApiResponse;
      
      if (result.errcode && result.errcode !== 0) {
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

      // 根据 message.format 决定消息格式
      const useMarkdown = message.format !== "text";

      // 应用消息长度限制
      const maxLength = getMessageLimit("wechatWork", useMarkdown);
      const truncatedText = truncateMessage(message.text, maxLength);

      // 应用 markdown 转换和清理
      const text = useMarkdown ? sanitizeMarkdown(convertMarkdown(truncatedText)) : truncatedText;

      if (responseUrl && typeof responseUrl === "string") {
        // 使用 response_url 回复（推荐方式）
        // 企业微信智能机器人 response_url API
        const payload = useMarkdown
          ? { msgtype: "markdown", markdown: { content: text } }
          : { msgtype: "text", text: { content: text } };

        const response = await fetch(responseUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const result = (await response.json()) as WecomApiResponse;

        if (result.errcode && result.errcode !== 0) {
          console.error(`[企业微信] response_url 回复失败 (${result.errcode}): ${result.errmsg}`);
          return { success: false, error: result.errmsg || "发送失败" };
        }

        // 返回 responseUrl 作为 messageId，用于后续更新消息
        return { success: true, messageId: responseUrl };
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

      // 根据 message.format 决定消息格式
      const useMarkdown = message.format !== "text";

      // 应用消息长度限制
      const maxLength = getMessageLimit("wechatWork", useMarkdown);
      const truncatedText = truncateMessage(message.text, maxLength);

      // 应用 markdown 转换和清理
      const text = useMarkdown ? sanitizeMarkdown(convertMarkdown(truncatedText)) : truncatedText;

      const payload = useMarkdown
        ? { msgtype: "markdown", markdown: { content: text } }
        : { msgtype: "text", text: { content: text } };

      await this.wsClient.sendMessage(message.to, payload);

      return { success: true };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      return { success: false, error: errMsg };
    }
  }

  /**
   * 处理收到的消息
   */
  private handleMessage(frame: WecomMessageFrame): void {
    try {
      const body = frame.body;
      let content = "";

      // 提取文本内容
      if (body.msgtype === "text" && body.text) {
        content = (body.text.content || "").trim();
      } else if (body.text) {
        content = (body.text.content || "").trim();
      }

      if (!content) {
        return;
      }

      const senderId = body.from?.userid || "unknown";
      const chatId = body.chatid || senderId;
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
        console.log(`[企业微信] 拒绝来自未授权用户的消息`);
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
      console.error("[企业微信] 处理消息错误:", error instanceof Error ? error.message : "未知错误");
    }
  }
}

/**
 * 创建企业微信 Channel 实例
 */
export function createWechatWorkChannel(config: WechatWorkBotConfig): WechatWorkChannel {
  return new WechatWorkChannel(config);
}
