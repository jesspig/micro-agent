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
import { isValidMessageId } from "../../shared/security.js";

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
    });

    this.ws.setDispatchHandler((eventType, data) => {
      this.handleDispatch(eventType, data);
    });
  }

  /**
   * 启动 Channel
   */
  async start(_config: QQBotConfig): Promise<void> {
    const { appId, clientSecret } = this.config;

    if (!appId || !clientSecret) {
      throw new Error("QQ Channel 需要 appId 和 clientSecret 配置");
    }

    try {
      const gatewayUrl = await this.auth.getGateway();
      await this.ws.connect(gatewayUrl);
      this.messageHandler.startCleanup();
    } catch (error) {
      this.setConnected(false, String(error));
      throw error;
    }
  }

  /**
   * 停止 Channel
   */
  async stop(): Promise<void> {
    this.messageHandler.clear();
    this.ws.disconnect();
    this.auth.clear();
    this.setConnected(false);
  }

  /**
   * 发送消息
   */
  async send(message: OutboundMessage): Promise<SendResult> {
    try {
      const isMarkdown = message.format === "markdown";
      const rawText = isMarkdown ? convertMarkdown(message.text) : message.text;

      // 检查群聊消息
      const groupId = (message.metadata?.groupId || message.metadata?.groupOpenid) as string | undefined;
      if (groupId) {
        return this.api.sendGroupMessage(groupId, rawText, isMarkdown);
      }

      // 检查单聊消息
      const userOpenid = message.metadata?.userOpenid as string | undefined;
      if (userOpenid) {
        return this.api.sendC2CMessage(userOpenid, rawText, isMarkdown);
      }

      // 尝试频道消息发送
      const result = await this.api.sendChannelMessage(message.to, rawText, isMarkdown);

      // 频道发送失败时尝试私聊
      if (!result.success && (result.error?.includes("404") || result.error?.includes("403"))) {
        return this.api.sendDirectMessage(message.to, rawText, isMarkdown);
      }

      return result;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
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
    try {
      if (!isValidMessageId(messageId)) {
        return { success: false, error: `无效的 messageId 格式: ${messageId}` };
      }

      const parts = messageId.split(":");

      if (parts.length === 2) {
        return this.api.updateChannelMessage(parts[0]!, parts[1]!, text);
      }

      if (parts.length === 3) {
        const [type, targetId, msgId] = parts;
        switch (type) {
          case "group":
            return this.api.updateGroupMessage(targetId!, msgId!, text);
          case "c2c":
            return this.api.updateC2CMessage(targetId!, msgId!, text);
          case "dms":
            return this.api.updateDirectMessage(targetId!, msgId!, text);
        }
      }

      return { success: false, error: `无效的 messageId 格式: ${messageId}` };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      return { success: false, error: errMsg };
    }
  }

  /**
   * 处理事件分发
   */
  private handleDispatch(eventType: string | undefined, data: unknown): void {
    if (!eventType) return;

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
  return new QQChannel(config);
}
