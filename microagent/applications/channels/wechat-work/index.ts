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
import { truncateMessage, getMessageLimit, sanitizeMarkdown, truncateForLog } from "../../shared/security.js";
import { channelsLogger, createTimer, sanitize, logMethodCall, logMethodReturn, logMethodError } from "../../shared/logger.js";

const logger = channelsLogger();

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
  /** Channel 名称常量 */
  private static readonly CHANNEL_NAME = "WechatWorkChannel";

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
    logger.debug("创建 WechatWorkChannel 实例", { botId: config.botId });
  }

  async start(_config: ChannelConfig): Promise<void> {
    const timer = createTimer();
    const { botId, secret, webhookKey } = this.config;

    logMethodCall(logger, { method: "start", module: WechatWorkChannel.CHANNEL_NAME, params: { botId, hasWebhookKey: !!webhookKey } });

    // 模式一：群机器人 Webhook（仅发送，不接收）
    if (webhookKey && !botId) {
      this.setConnected(true);
      logger.info("企业微信 Channel 启动成功（Webhook 模式）");
      logMethodReturn(logger, { method: "start", module: WechatWorkChannel.CHANNEL_NAME, result: { success: true, mode: "webhook" }, duration: timer() });
      return;
    }

    // 模式二：智能机器人（WebSocket 长连接）
    if (botId && secret) {
      await this.startSmartBot(botId, secret);
      logMethodReturn(logger, { method: "start", module: WechatWorkChannel.CHANNEL_NAME, result: { success: true, mode: "smartBot" }, duration: timer() });
      return;
    }

    const error = new Error("企业微信 Channel 需要配置 botId + secret（智能机器人）或 webhookKey（群机器人）");
    logMethodError(logger, { method: "start", module: WechatWorkChannel.CHANNEL_NAME, error: { name: error.name, message: error.message }, params: {}, duration: timer() });
    throw error;
  }

  /**
   * 启动智能机器人模式
   */
  private async startSmartBot(botId: string, secret: string): Promise<void> {
    const timer = createTimer();
    logMethodCall(logger, { method: "startSmartBot", module: WechatWorkChannel.CHANNEL_NAME, params: { botId } });

    try {
      // 动态导入 @wecom/aibot-node-sdk
      const sdk = await import("@wecom/aibot-node-sdk").catch(() => null);

      if (!sdk) {
        const error = new Error("@wecom/aibot-node-sdk 未安装，请运行: bun add @wecom/aibot-node-sdk");
        logMethodError(logger, { method: "startSmartBot", module: WechatWorkChannel.CHANNEL_NAME, error: { name: error.name, message: error.message }, params: { botId }, duration: timer() });
        throw error;
      }

      this.running = true;

      // 创建 WSClient 实例
      // SDK API: new WSClient({ botId, secret, logger })
      // 配置空 Logger 禁用 SDK 日志输出
      const noopLogger = {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
      };

      this.wsClient = new sdk.WSClient({
        botId,
        secret,
        logger: noopLogger,
      }) as WecomWSClient;

      const self = this;

      // 注册消息处理器
      // SDK API: wsClient.on('message', handler) 或 wsClient.on('message.text', handler)
      this.wsClient.on("message", (frame: unknown) => {
        self.handleMessage(frame as WecomMessageFrame);
      });

      this.wsClient.on("error", (error: unknown) => {
        // 记录 SDK 错误详情
        const errMsg = error instanceof Error ? error.message : String(error);
        logger.error("企业微信 SDK 错误", { botId, error: errMsg });
      });

      // 启动连接
      // SDK API: wsClient.connect() 返回 this
      this.wsClient.connect();
      this.setConnected(true);
      logger.info("企业微信 WebSocket 连接成功", { botId });
      logger.info("企业微信智能机器人启动成功", { botId });

      // 保持运行
      while (this.running) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      logMethodReturn(logger, { method: "startSmartBot", module: WechatWorkChannel.CHANNEL_NAME, result: { success: true }, duration: timer() });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.setConnected(false, err.message);
      logMethodError(logger, { method: "startSmartBot", module: WechatWorkChannel.CHANNEL_NAME, error: { name: err.name, message: err.message, stack: err.stack }, params: { botId }, duration: timer() });
      throw error;
    }
  }

  async stop(): Promise<void> {
    const timer = createTimer();
    const { botId } = this.config;
    logMethodCall(logger, { method: "stop", module: WechatWorkChannel.CHANNEL_NAME, params: { botId } });

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
    logger.info("企业微信 Channel 已停止", { botId });
    logMethodReturn(logger, { method: "stop", module: WechatWorkChannel.CHANNEL_NAME, result: { success: true }, duration: timer() });
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
    const timer = createTimer();
    logMethodCall(logger, { method: "updateMessage", module: WechatWorkChannel.CHANNEL_NAME, params: { messageId, format } });

    // messageId 可能是 responseUrl 或 userId
    let responseUrl: string;

    // 检查 messageId 是否直接是 URL
    if (messageId.startsWith("http")) {
      responseUrl = messageId;
    } else {
      // 从缓存中获取 responseUrl
      const cachedUrl = this.responseUrls.get(messageId);
      if (!cachedUrl) {
        const result = { success: false, error: "未找到消息的 response_url" };
        logMethodReturn(logger, { method: "updateMessage", module: WechatWorkChannel.CHANNEL_NAME, result, duration: timer() });
        return result;
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

      logger.info("更新企业微信消息", { messageId, useMarkdown });

      const response = await fetch(responseUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = (await response.json()) as WecomApiResponse;

      if (result.errcode && result.errcode !== 0) {
        const sendResult = { success: false, error: result.errmsg || "更新失败" };
        logMethodReturn(logger, { method: "updateMessage", module: WechatWorkChannel.CHANNEL_NAME, result: sendResult, duration: timer() });
        return sendResult;
      }

      logger.info("企业微信消息更新成功", { messageId });
      logMethodReturn(logger, { method: "updateMessage", module: WechatWorkChannel.CHANNEL_NAME, result: { success: true, messageId }, duration: timer() });
      return { success: true, messageId };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logMethodError(logger, { method: "updateMessage", module: WechatWorkChannel.CHANNEL_NAME, error: { name: err.name, message: err.message, stack: err.stack }, params: { messageId }, duration: timer() });
      return { success: false, error: err.message };
    }
  }

  async send(message: OutboundMessage): Promise<SendResult> {
    const timer = createTimer();
    logMethodCall(logger, { method: "send", module: WechatWorkChannel.CHANNEL_NAME, params: { to: message.to, format: message.format } });

    const { webhookKey } = this.config;

    // 模式一：群机器人 Webhook
    if (webhookKey && !this.wsClient) {
      const result = await this.sendViaWebhook(webhookKey, message);
      logMethodReturn(logger, { method: "send", module: WechatWorkChannel.CHANNEL_NAME, result: sanitize(result), duration: timer() });
      return result;
    }

    // 模式二：智能机器人
    if (this.wsClient) {
      const result = await this.sendViaSmartBot(message);
      logMethodReturn(logger, { method: "send", module: WechatWorkChannel.CHANNEL_NAME, result: sanitize(result), duration: timer() });
      return result;
    }

    const result = { success: false, error: "企业微信客户端未初始化" };
    logMethodReturn(logger, { method: "send", module: WechatWorkChannel.CHANNEL_NAME, result, duration: timer() });
    return result;
  }

  /**
   * 通过 Webhook 发送消息
   */
  private async sendViaWebhook(webhookKey: string, message: OutboundMessage): Promise<SendResult> {
    const timer = createTimer();
    logMethodCall(logger, { method: "sendViaWebhook", module: WechatWorkChannel.CHANNEL_NAME, params: { to: message.to } });

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

      logger.info("通过 Webhook 发送企业微信消息", { useMarkdown, content: truncateForLog(text) });

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = (await response.json()) as WecomApiResponse;
      
      if (result.errcode && result.errcode !== 0) {
        const sendResult = { success: false, error: result.errmsg || "发送失败" };
        logMethodReturn(logger, { method: "sendViaWebhook", module: WechatWorkChannel.CHANNEL_NAME, result: sendResult, duration: timer() });
        return sendResult;
      }

      logger.info("企业微信 Webhook 消息发送成功");
      logMethodReturn(logger, { method: "sendViaWebhook", module: WechatWorkChannel.CHANNEL_NAME, result: { success: true }, duration: timer() });
      return { success: true };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logMethodError(logger, { method: "sendViaWebhook", module: WechatWorkChannel.CHANNEL_NAME, error: { name: err.name, message: err.message, stack: err.stack }, params: { to: message.to }, duration: timer() });
      return { success: false, error: err.message };
    }
  }

  /** 回复 URL 缓存（按用户 ID） */
  private responseUrls = new Map<string, string>();

  /**
   * 通过智能机器人发送消息
   */
  private async sendViaSmartBot(message: OutboundMessage): Promise<SendResult> {
    const timer = createTimer();
    logMethodCall(logger, { method: "sendViaSmartBot", module: WechatWorkChannel.CHANNEL_NAME, params: { to: message.to } });

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

        logger.info("通过 responseUrl 发送企业微信消息", { useMarkdown, content: truncateForLog(text) });

        const response = await fetch(responseUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const result = (await response.json()) as WecomApiResponse;

        if (result.errcode && result.errcode !== 0) {
          const sendResult = { success: false, error: result.errmsg || "发送失败" };
          logMethodReturn(logger, { method: "sendViaSmartBot", module: WechatWorkChannel.CHANNEL_NAME, result: sendResult, duration: timer() });
          return sendResult;
        }

        // 返回 responseUrl 作为 messageId，用于后续更新消息
        logMethodReturn(logger, { method: "sendViaSmartBot", module: WechatWorkChannel.CHANNEL_NAME, result: { success: true, messageId: responseUrl }, duration: timer() });
        return { success: true, messageId: responseUrl };
      }

      // 无 response_url，使用 SDK 发送
      const result = await this.sendViaSDK(message);
      logMethodReturn(logger, { method: "sendViaSmartBot", module: WechatWorkChannel.CHANNEL_NAME, result: sanitize(result), duration: timer() });
      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logMethodError(logger, { method: "sendViaSmartBot", module: WechatWorkChannel.CHANNEL_NAME, error: { name: err.name, message: err.message, stack: err.stack }, params: { to: message.to }, duration: timer() });
      return { success: false, error: err.message };
    }
  }

  /**
   * 通过 SDK 发送消息
   */
  private async sendViaSDK(message: OutboundMessage): Promise<SendResult> {
    const timer = createTimer();
    logMethodCall(logger, { method: "sendViaSDK", module: WechatWorkChannel.CHANNEL_NAME, params: { to: message.to } });

    try {
      if (!this.wsClient) {
        const result = { success: false, error: "企业微信客户端未初始化" };
        logMethodReturn(logger, { method: "sendViaSDK", module: WechatWorkChannel.CHANNEL_NAME, result, duration: timer() });
        return result;
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

      logger.info("通过 SDK 发送企业微信消息", { to: message.to, useMarkdown, content: truncateForLog(text) });

      await this.wsClient.sendMessage(message.to, payload);

      logMethodReturn(logger, { method: "sendViaSDK", module: WechatWorkChannel.CHANNEL_NAME, result: { success: true }, duration: timer() });
      return { success: true };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logMethodError(logger, { method: "sendViaSDK", module: WechatWorkChannel.CHANNEL_NAME, error: { name: err.name, message: err.message, stack: err.stack }, params: { to: message.to }, duration: timer() });
      return { success: false, error: err.message };
    }
  }

  /**
   * 处理收到的消息
   */
  private handleMessage(frame: WecomMessageFrame): void {
    const timer = createTimer();
    logMethodCall(logger, { method: "handleMessage", module: WechatWorkChannel.CHANNEL_NAME, params: { msgId: frame.body?.msgid } });

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
        logMethodReturn(logger, { method: "handleMessage", module: WechatWorkChannel.CHANNEL_NAME, result: { skipped: true, reason: "empty" }, duration: timer() });
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
        logger.debug("企业微信消息权限检查失败", { senderId });
        logMethodReturn(logger, { method: "handleMessage", module: WechatWorkChannel.CHANNEL_NAME, result: { skipped: true, reason: "permission" }, duration: timer() });
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

      logger.info("企业微信消息接收", { senderId, chatId, msgId: body.msgid, content: truncateForLog(content) });
      this.emitMessage(inboundMsg);
      logMethodReturn(logger, { method: "handleMessage", module: WechatWorkChannel.CHANNEL_NAME, result: { success: true }, duration: timer() });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logMethodError(logger, { method: "handleMessage", module: WechatWorkChannel.CHANNEL_NAME, error: { name: err.name, message: err.message }, params: {}, duration: timer() });
    }
  }
}

/**
 * 创建企业微信 Channel 实例
 */
export function createWechatWorkChannel(config: WechatWorkBotConfig): WechatWorkChannel {
  logger.info("创建企业微信 Channel 实例", { botId: config.botId });
  return new WechatWorkChannel(config);
}