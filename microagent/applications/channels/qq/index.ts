/**
 * QQ 频道机器人 Channel 实现
 * 
 * 使用 QQ 机器人开放平台 API v2，基于 AccessToken 鉴权
 * 参考: https://bot.q.qq.com/wiki/develop/api-v2/dev-prepare/interface-framework/api-use.html
 */

import type { OutboundMessage, SendResult } from "../../../runtime/channel/types.js";
import { BaseChannel } from "../../../runtime/channel/base.js";
import type { ChannelCapabilities } from "../../../runtime/types.js";
import { convertMarkdown } from "./markdown.js";
import { isValidMessageId, truncateForLog } from "../../shared/security.js";
import { channelsLogger, createTimer, sanitize, logMethodCall, logMethodReturn, logMethodError } from "../../shared/logger.js";

const logger = channelsLogger();

/** 模块名称常量 */
const MODULE_NAME = "QQChannel";

// 导出类型
export type { QQBotConfig } from "./types.js";
export {
  type QQApiResponse,
  type ChannelMessageData,
  type GroupMessageData,
  type C2CMessageData,
  type WSMessage,
  parseMessageId,
} from "./types.js";

// 导入模块
import { QQAuth } from "./auth.js";
import { QQApi } from "./api.js";
import { QQWebSocket } from "./websocket.js";
import { QQMessageHandler } from "./message-handler.js";
import type { QQBotConfig, ChannelMessageData, GroupMessageData, C2CMessageData } from "./types.js";

/**
 * QQ 频道机器人 Channel
 */
export class QQChannel extends BaseChannel {
  readonly id: string;
  readonly type = "qq" as const;
  readonly capabilities: ChannelCapabilities = {
    text: true,
    markdown: true,
    media: true,
    reply: true,
    edit: false,
    delete: false,
    streaming: true,
  };

  declare config: QQBotConfig;

  /** 模块实例 */
  private auth: QQAuth;
  private api: QQApi;
  private ws: QQWebSocket;
  private messageHandler: QQMessageHandler;

  constructor(config: QQBotConfig) {
    super(config);
    this.id = config.id;
    this.config = config;

    // 初始化模块
    this.auth = new QQAuth(config);
    this.api = new QQApi(this.auth);
    this.ws = new QQWebSocket(config, this.auth);
    this.messageHandler = new QQMessageHandler(config, this.id, (msg) => this.emitMessage(msg));

    // 设置 WebSocket 回调
    this.ws.setConnectionChangeHandler((connected, error) => {
      this.setConnected(connected, error);
      logger.info("连接状态变更", { connected, error: error || undefined });
    });

    this.ws.setDispatchHandler((eventType, data) => {
      this.handleDispatch(eventType, data);
    });
  }

  /**
   * 启动 Channel
   */
  async start(_config: QQBotConfig): Promise<void> {
    const timer = createTimer();
    const { appId, clientSecret } = this.config;

    logMethodCall(logger, { method: "start", module: MODULE_NAME, params: { appId } });

    if (!appId || !clientSecret) {
      const error = new Error("QQ Channel 需要 appId 和 clientSecret 配置");
      logMethodError(logger, { method: "start", module: MODULE_NAME, error: { name: error.name, message: error.message }, params: { appId }, duration: timer() });
      throw error;
    }

    try {
      const gatewayUrl = await this.auth.getGateway();
      logger.info("QQ WebSocket 获取网关成功", { gatewayUrl });
      await this.ws.connect(gatewayUrl);
      logger.info("QQ WebSocket 连接成功");
      this.messageHandler.startCleanup();
      logger.info("QQ Channel 启动成功", { appId });
      logMethodReturn(logger, { method: "start", module: MODULE_NAME, result: { success: true }, duration: timer() });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.setConnected(false, String(error));
      logMethodError(logger, { method: "start", module: MODULE_NAME, error: { name: err.name, message: err.message, stack: err.stack }, params: { appId }, duration: timer() });
      throw error;
    }
  }

  /**
   * 停止 Channel
   */
  async stop(): Promise<void> {
    const timer = createTimer();
    const { appId } = this.config;
    logMethodCall(logger, { method: "stop", module: MODULE_NAME, params: { appId } });

    try {
      this.messageHandler.clear();
      this.ws.disconnect();
      this.auth.clear();
      this.setConnected(false);
      logger.info("QQ Channel 已停止");
      logMethodReturn(logger, { method: "stop", module: MODULE_NAME, result: { success: true }, duration: timer() });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logMethodError(logger, { method: "stop", module: MODULE_NAME, error: { name: err.name, message: err.message, stack: err.stack }, params: { appId }, duration: timer() });
      throw error;
    }
  }

  /**
   * 发送消息
   */
  async send(message: OutboundMessage): Promise<SendResult> {
    const timer = createTimer();
    logMethodCall(logger, { method: "send", module: MODULE_NAME, params: { to: message.to, format: message.format } });

    try {
      const isMarkdown = message.format === "markdown";
      const rawText = isMarkdown ? convertMarkdown(message.text) : message.text;

      // 检查群聊消息
      const groupId = (message.metadata?.groupId || message.metadata?.groupOpenid) as string | undefined;
      if (groupId) {
        logger.info("发送群聊消息", { groupId, isMarkdown, content: truncateForLog(rawText) });
        const result = await this.api.sendGroupMessage(groupId, rawText, isMarkdown);
        if (result.success) {
          logger.info("群聊消息发送成功", { groupId });
        }
        logMethodReturn(logger, { method: "send", module: MODULE_NAME, result: sanitize(result), duration: timer() });
        return result;
      }

      // 检查单聊消息
      const userOpenid = message.metadata?.userOpenid as string | undefined;
      if (userOpenid) {
        logger.info("发送单聊消息", { userOpenid, isMarkdown, content: truncateForLog(rawText) });
        const result = await this.api.sendC2CMessage(userOpenid, rawText, isMarkdown);
        if (result.success) {
          logger.info("单聊消息发送成功", { userOpenid });
        }
        logMethodReturn(logger, { method: "send", module: MODULE_NAME, result: sanitize(result), duration: timer() });
        return result;
      }

      // 尝试频道消息发送
      logger.info("发送频道消息", { channelId: message.to, isMarkdown, content: truncateForLog(rawText) });
      const result = await this.api.sendChannelMessage(message.to, rawText, isMarkdown);

      // 频道发送失败时尝试私聊
      if (!result.success && (result.error?.includes("404") || result.error?.includes("403"))) {
        logger.info("频道发送失败，尝试私聊", { channelId: message.to });
        const fallbackResult = await this.api.sendDirectMessage(message.to, rawText, isMarkdown);
        if (fallbackResult.success) {
          logger.info("私聊消息发送成功", { channelId: message.to });
        }
        logMethodReturn(logger, { method: "send", module: MODULE_NAME, result: sanitize(fallbackResult), duration: timer() });
        return fallbackResult;
      }

      if (result.success) {
        logger.info("频道消息发送成功", { channelId: message.to });
      }
      logMethodReturn(logger, { method: "send", module: MODULE_NAME, result: sanitize(result), duration: timer() });
      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      const errMsg = err.message;
      logMethodError(logger, { method: "send", module: MODULE_NAME, error: { name: err.name, message: err.message, stack: err.stack }, params: { to: message.to }, duration: timer() });
      return { success: false, error: errMsg };
    }
  }

  /**
   * 更新消息
   */
  async updateMessage(
    messageId: string,
    text: string,
    _format?: "text" | "markdown"
  ): Promise<SendResult> {
    const timer = createTimer();
    logMethodCall(logger, { method: "updateMessage", module: MODULE_NAME, params: { messageId } });

    try {
      if (!isValidMessageId(messageId)) {
        const result = { success: false, error: `无效的 messageId 格式: ${messageId}` };
        logMethodReturn(logger, { method: "updateMessage", module: MODULE_NAME, result, duration: timer() });
        return result;
      }

      const parts = messageId.split(":");

      if (parts.length === 2) {
        logger.info("更新频道消息", { channelId: parts[0], messageId: parts[1] });
        const result = await this.api.updateChannelMessage(parts[0]!, parts[1]!, text);
        logMethodReturn(logger, { method: "updateMessage", module: MODULE_NAME, result: sanitize(result), duration: timer() });
        return result;
      }

      if (parts.length === 3) {
        const [type, targetId, msgId] = parts;
        logger.info("更新消息", { type, targetId, messageId: msgId });
        let result: SendResult;
        switch (type) {
          case "group":
            result = await this.api.updateGroupMessage(targetId!, msgId!, text);
            break;
          case "c2c":
            result = await this.api.updateC2CMessage(targetId!, msgId!, text);
            break;
          case "dms":
            result = await this.api.updateDirectMessage(targetId!, msgId!, text);
            break;
          default:
            result = { success: false, error: `无效的 messageId 格式: ${messageId}` };
        }
        logMethodReturn(logger, { method: "updateMessage", module: MODULE_NAME, result: sanitize(result), duration: timer() });
        return result;
      }

      const result = { success: false, error: `无效的 messageId 格式: ${messageId}` };
      logMethodReturn(logger, { method: "updateMessage", module: MODULE_NAME, result, duration: timer() });
      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      const errMsg = err.message;
      logMethodError(logger, { method: "updateMessage", module: MODULE_NAME, error: { name: err.name, message: err.message, stack: err.stack }, params: { messageId }, duration: timer() });
      return { success: false, error: errMsg };
    }
  }

  /**
   * 处理事件分发
   */
  private handleDispatch(eventType: string | undefined, data: unknown): void {
    if (!eventType) return;

    logger.debug("处理事件分发", { eventType });

    switch (eventType) {
      case "READY":
        this.ws.handleReady();
        break;

      case "MESSAGE_CREATE":
      case "AT_MESSAGE_CREATE":
        this.messageHandler.handleChannelMessage(data as ChannelMessageData);
        break;

      case "DIRECT_MESSAGE_CREATE":
        this.messageHandler.handleDirectMessage(data as ChannelMessageData);
        break;

      case "GROUP_AT_MESSAGE_CREATE":
        this.messageHandler.handleGroupMessage(data as GroupMessageData);
        break;

      case "C2C_MESSAGE_CREATE":
        this.messageHandler.handleC2CMessage(data as C2CMessageData);
        break;

      default:
        // 未处理事件，静默忽略
        break;
    }
  }
}

/**
 * 创建 QQ Channel 实例
 */
export function createQQChannel(config: QQBotConfig): QQChannel {
  logger.info("创建 QQ Channel 实例", { appId: config.appId });
  return new QQChannel(config);
}