/**
 * 飞书机器人 Channel 实现
 * 
 * 使用 @larksuiteoapi/node-sdk 通过 WebSocket 长连接接收消息
 * 参考: https://open.feishu.cn/document/client-docs/bot-v3/events/overview
 * 
 * 安装依赖: bun add @larksuiteoapi/node-sdk
 */

import type { ChannelConfig, InboundMessage, OutboundMessage, SendResult } from "../../../runtime/channel/types.js";
import { BaseChannel } from "../../../runtime/channel/base.js";
import type { ChannelCapabilities } from "../../../runtime/types.js";
import { convertToFeishuElements } from "./markdown.js";

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 飞书机器人配置
 */
export interface FeishuBotConfig extends ChannelConfig {
  /** App ID */
  appId: string;
  /** App Secret */
  appSecret: string;
  /** Encrypt Key（用于事件订阅加密解密） */
  encryptKey?: string;
  /** 允许发送消息的用户列表 */
  allowFrom?: string[] | undefined;
}

/**
 * 飞书消息事件数据
 */
interface FeishuMessageEvent {
  message: {
    message_id: string;
    chat_id: string;
    message_type: string;
    content: string;
    sender: {
        sender_id: {
            open_id: string;
            union_id: string;
            user_id: string;
        };
        sender_type: string;
    };
    create_time: string;
  };
}

// ============================================================================
// 飞书 Channel 实现
// ============================================================================

/**
 * 飞书机器人 Channel
 * 
 * 使用飞书开放平台 SDK 的 WebSocket 模式
 * - 无需公网服务器
 * - 支持私聊和群聊
 * - 自动重连
 */
export class FeishuChannel extends BaseChannel {
  readonly id: string;
  readonly type = "feishu" as const;
  readonly capabilities: ChannelCapabilities = {
    text: true,
    media: true,
    reply: true,
    edit: true,
    delete: false,
    markdown: true,
    streaming: true,
  };

  /** 飞书特定配置 */
  declare config: FeishuBotConfig;

  /** Lark Client */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private client: any = null;

  /** WebSocket Client */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private wsClient: any = null;

  constructor(config: FeishuBotConfig) {
    super(config);
    this.id = config.id;
    this.config = config;
  }

  async start(_config: ChannelConfig): Promise<void> {
    const { appId, appSecret, encryptKey } = this.config;

    if (!appId || !appSecret) {
      throw new Error("飞书 Channel 需要 appId 和 appSecret 配置");
    }

    try {
      // 动态导入 @larksuiteoapi/node-sdk
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const lark: any = await import("@larksuiteoapi/node-sdk").catch(() => null);

      if (!lark) {
        throw new Error("@larksuiteoapi/node-sdk 未安装，请运行: bun add @larksuiteoapi/node-sdk");
      }

      const self = this;

      // 创建 Client
      this.client = new lark.Client({
        appId: appId,
        appSecret: appSecret,
        appType: lark.AppType.SelfBuild,
        domain: lark.Domain.Feishu,
      });

      // 创建 EventDispatcher
      const eventDispatcher = new lark.EventDispatcher({
        encryptKey: encryptKey || "",
      }).register({
        // 接收消息事件
        "im.message.receive_v1": async (data: FeishuMessageEvent) => {
          self.handleMessage(data);
        },
      });

      // 创建 WebSocket 客户端
      this.wsClient = new lark.WSClient({
        appId: appId,
        appSecret: appSecret,
        domain: lark.Domain.Feishu,
        loggerLevel: lark.LoggerLevel.info,
      });

      console.log("[飞书] 正在连接...");

      // 启动 WebSocket 连接
      await this.wsClient.start({
        eventDispatcher: eventDispatcher,
      });

      this.setConnected(true);
      console.log("[飞书] 连接就绪");
    } catch (error) {
      this.setConnected(false, String(error));
      throw error;
    }
  }

  async stop(): Promise<void> {
    this.setConnected(false);
    
    if (this.wsClient) {
      try {
        this.wsClient?.stop?.();
      } catch {
        // 忽略关闭错误
      }
      this.wsClient = null;
    }
    this.client = null;
    console.log("[飞书] Bot 已停止");
  }

  async send(message: OutboundMessage): Promise<SendResult> {
    if (!this.client) {
      return { success: false, error: "飞书客户端未初始化" };
    }

    try {
      // 根据 format 决定消息类型
      const isMarkdown = message.format === "markdown";

      // 使用飞书 SDK 发送消息
      const response = await this.client.im.message.create({
        params: {
          receive_id_type: "chat_id",
        },
        data: isMarkdown
          ? this.buildInteractiveMessage(message)
          : this.buildTextMessage(message),
      });

      const result: SendResult = { success: true };
      if (response.data?.message_id) {
        result.messageId = response.data.message_id;
      }
      return result;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      return { success: false, error: errMsg };
    }
  }

  /**
   * 更新已有消息（用于流式输出）
   * 飞书 API: PUT /im/v1/messages/{message_id}
   * @param messageId - 消息 ID
   * @param text - 新消息内容
   * @param format - 消息格式
   * @returns 发送结果
   */
  async updateMessage(messageId: string, text: string, format?: "text" | "markdown"): Promise<SendResult> {
    if (!this.client) {
      return { success: false, error: "飞书客户端未初始化" };
    }

    try {
      const isMarkdown = format === "markdown";

      // 飞书消息更新 API
      const response = await this.client.im.message.update({
        path: {
          message_id: messageId,
        },
        params: {
          receive_id_type: "chat_id",
        },
        data: isMarkdown
          ? {
              content: JSON.stringify({
                zh_cn: { content: [[{ tag: "text", text }]] },
              }),
              msg_type: "post",
            }
          : {
              content: JSON.stringify({ text }),
              msg_type: "text",
            },
      });

      if (response.code !== 0) {
        return { success: false, error: response.msg || "更新失败" };
      }

      return { success: true, messageId };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      return { success: false, error: errMsg };
    }
  }

  /**
   * 构建文本消息
   */
  private buildTextMessage(message: OutboundMessage) {
    return {
      receive_id: message.to,
      msg_type: "text",
      content: JSON.stringify({ text: message.text }),
    };
  }

  /**
   * 构建交互式卡片消息（interactive 类型，JSON 2.0 结构）
   * 飞书卡片 JSON 2.0 富文本组件支持：
   * - 标题（# ~ ######）
   * - 加粗、斜体、删除线
   * - 链接、代码块、列表
   * - 表格、引用、分割线
   * - 彩色文本、标签等
   */
  private buildInteractiveMessage(message: OutboundMessage) {
    // 转换 Markdown 为飞书富文本元素
    const { title, elements } = convertToFeishuElements(message.text);

    // 构建飞书卡片 JSON 2.0 结构
    const card: Record<string, unknown> = {
      schema: "2.0",
      config: {
        wide_screen_mode: true,
      },
      body: {
        elements,
      },
    };

    // 如果有标题，添加 header 组件
    if (title) {
      card.header = {
        title: {
          tag: "plain_text",
          content: title,
        },
      };
    }

    return {
      receive_id: message.to,
      msg_type: "interactive",
      content: JSON.stringify(card),
    };
  }

  /**
   * 处理收到的消息
   */
  private handleMessage(event: FeishuMessageEvent): void {
    try {
      const message = event.message;
      const senderId = message.sender?.sender_id?.open_id || "unknown";
      const chatId = message.chat_id;

      // 忽略自己发送的消息
      if (message.sender?.sender_type === "app") {
        return;
      }

      // 解析消息内容
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let contentObj: any;
      try {
        contentObj = JSON.parse(message.content);
      } catch {
        contentObj = { text: message.content };
      }

      // 提取文本
      let content = "";
      if (contentObj.text) {
        content = contentObj.text.trim();
      } else if (typeof contentObj === "string") {
        content = contentObj.trim();
      }

      if (!content) {
        return;
      }

      // 权限检查
      const allowList = this.config.allowFrom || [];
      if (allowList.length > 0 && !allowList.includes("*") && !allowList.includes(senderId)) {
        console.log(`[飞书] 拒绝来自 ${senderId} 的消息（未在 allowFrom 列表中）`);
        return;
      }

      const inboundMsg: InboundMessage = {
        from: senderId,
        to: chatId,
        text: content,
        timestamp: Date.now(),
        channelId: this.id,
      };

      this.emitMessage(inboundMsg);
      console.log(`[飞书] 收到消息: ${senderId}@${chatId}: ${content}`);
    } catch (error) {
      console.error("[飞书] 处理消息错误:", error);
    }
  }
}

/**
 * 创建飞书 Channel 实例
 */
export function createFeishuChannel(config: FeishuBotConfig): FeishuChannel {
  return new FeishuChannel(config);
}