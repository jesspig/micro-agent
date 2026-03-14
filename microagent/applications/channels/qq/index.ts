/**
 * QQ 频道机器人 Channel 实现
 * 
 * 使用 QQ 机器人开放平台 API v2，基于 AccessToken 鉴权
 * 参考: https://bot.q.qq.com/wiki/develop/api-v2/dev-prepare/interface-framework/api-use.html
 * 
 * 不再依赖 qq-guild-bot SDK，直接使用 HTTP API + WebSocket
 */

import type { ChannelConfig, InboundMessage, OutboundMessage, SendResult } from "../../../runtime/channel/types.js";
import { BaseChannel } from "../../../runtime/channel/base.js";
import type { ChannelCapabilities } from "../../../runtime/types.js";
import { convertMarkdown } from "./markdown.js";

// ============================================================================
// 类型定义
// ============================================================================

/**
 * QQ 频道机器人配置
 */
export interface QQBotConfig extends ChannelConfig {
  /** AppID（机器人ID） */
  appId: string;
  /** ClientSecret（机器人密钥） */
  clientSecret: string;
  /** 是否沙箱环境 */
  sandbox?: boolean | undefined;
  /** 允许发送消息的频道列表 */
  allowChannels?: string[] | undefined;
  /** 允许发送消息的用户列表 */
  allowFrom?: string[] | undefined;
}

/**
 * AccessToken 响应
 */
interface AccessTokenResponse {
  access_token: string;
  expires_in: number;
}

/**
 * Gateway 响应
 */
interface GatewayResponse {
  url: string;
  shards?: number;
  session_start_limit?: {
    total: number;
    remaining: number;
    reset_after: number;
    max_concurrency: number;
  };
}

/**
 * WebSocket 消息
 */
interface WSMessage {
  op: number;
  d: unknown;
  s?: number;
  t?: string;
}

/**
 * 频道消息数据
 */
interface ChannelMessageData {
  id: string;
  channel_id: string;
  guild_id: string;
  content: string;
  author: {
    id: string;
    username: string;
    bot: boolean;
  };
  timestamp: string;
}

/**
 * 群聊消息数据
 */
interface GroupMessageData {
  id: string;
  group_id: string;
  group_openid: string;
  content: string;
  author: {
    id: string;
    member_openid: string;
    bot: boolean;
  };
  timestamp: string;
}

/**
 * 单聊消息数据
 */
interface C2CMessageData {
  id: string;
  content: string;
  author: {
    id: string;
    user_openid: string;
    bot: boolean;
  };
  timestamp: string;
}

// ============================================================================
// 常量定义
// ============================================================================

/** API 基础地址 */
const API_BASE = "https://api.sgroup.qq.com";
const SANDBOX_API_BASE = "https://sandbox.api.sgroup.qq.com";
const TOKEN_URL = "https://bots.qq.com/app/getAppAccessToken";

/** WebSocket OP Codes */
const OP = {
  DISPATCH: 0,
  HEARTBEAT: 1,
  IDENTIFY: 2,
  RESUME: 6,
  RECONNECT: 7,
  HELLO: 10,
  HEARTBEAT_ACK: 11,
};

// ============================================================================
// QQ Channel 实现
// ============================================================================

/**
 * QQ 频道机器人 Channel
 * 
 * 使用 QQ 开放平台 API v2
 * - AccessToken 鉴权
 * - WebSocket 实时消息
 * - 自动重连
 */
export class QQChannel extends BaseChannel {
  readonly id: string;
  readonly type = "qq" as const;
  readonly capabilities: ChannelCapabilities = {
    text: true,
    markdown: true, // QQ 频道支持有限的 Markdown 渲染（加粗、斜体、链接）
    media: true,
    reply: true,
    edit: false,
    delete: false,
    streaming: true, // 支持流式输出
  };

  /** QQ 特定配置 */
  declare config: QQBotConfig;

  /** AccessToken */
  private accessToken: string | null = null;
  private tokenExpireTime = 0;

  /** WebSocket 连接 */
  private ws: WebSocket | null = null;

  /** 心跳定时器 */
  private heartbeatTimer: Timer | null = null;

  /** 心跳间隔 */
  private heartbeatInterval = 41250;

  /** 序列号 */
  private sequence: number | null = null;

  /** 已处理消息 ID 集合（防重） */
  private processedIds = new Set<string>();

  /** 运行标志 */
  private running = false;

  /** 重连计数 */
  private reconnectCount = 0;
  private readonly maxReconnect = 5;

  constructor(config: QQBotConfig) {
    super(config);
    this.id = config.id;
    this.config = config;
  }

  /**
   * 获取 API 基础地址
   */
  private get apiBase(): string {
    return this.config.sandbox ? SANDBOX_API_BASE : API_BASE;
  }

  /**
   * 获取 AccessToken
   */
  private async getAccessToken(): Promise<string> {
    // 检查缓存是否有效（提前 60 秒刷新）
    if (this.accessToken && Date.now() < this.tokenExpireTime - 60000) {
      return this.accessToken;
    }

    const { appId, clientSecret } = this.config;

    if (!appId || !clientSecret) {
      throw new Error("QQ Channel 需要 appId 和 clientSecret 配置");
    }

    console.log("[QQ] 正在获取 AccessToken...");

    const response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appId, clientSecret }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`获取 AccessToken 失败: ${response.status} ${text}`);
    }

    const data = (await response.json()) as AccessTokenResponse;

    if (!data.access_token) {
      throw new Error("AccessToken 响应无效");
    }

    this.accessToken = data.access_token;
    this.tokenExpireTime = Date.now() + data.expires_in * 1000;

    console.log(`[QQ] AccessToken 已获取，有效期 ${data.expires_in} 秒`);

    return this.accessToken;
  }

  /**
   * 获取 WebSocket Gateway 地址
   */
  private async getGateway(): Promise<string> {
    const token = await this.getAccessToken();

    const response = await fetch(`${this.apiBase}/gateway/bot`, {
      headers: { Authorization: `QQBot ${token}` },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`获取 Gateway 失败: ${response.status} ${text}`);
    }

    const data = (await response.json()) as GatewayResponse;

    if (!data.url) {
      throw new Error("Gateway 响应无效");
    }

    // 沙箱环境的 API 已经返回沙箱 WebSocket URL，无需额外处理
    return data.url;
  }

  /**
   * 启动 Channel
   */
  async start(_config: ChannelConfig): Promise<void> {
    const { appId, clientSecret } = this.config;

    if (!appId || !clientSecret) {
      throw new Error("QQ Channel 需要 appId 和 clientSecret 配置");
    }

    this.running = true;

    try {
      // 获取 Gateway 地址
      const gatewayUrl = await this.getGateway();

      console.log(`[QQ] 正在连接 Gateway: ${gatewayUrl.replace(/[^/]+@/, "***@")}`);

      // 创建 WebSocket 连接
      await this.connectWebSocket(gatewayUrl);
    } catch (error) {
      this.setConnected(false, String(error));
      throw error;
    }
  }

  /**
   * 连接 WebSocket
   */
  private async connectWebSocket(url: string): Promise<void> {
    return new Promise((resolve) => {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        console.log("[QQ] WebSocket 已连接");
        resolve();
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string) as WSMessage;
          this.handleWSMessage(msg);
        } catch (error) {
          console.error("[QQ] 解析消息失败:", error);
        }
      };

      this.ws.onerror = (error) => {
        console.error("[QQ] WebSocket 错误:", error);
        this.setConnected(false, "WebSocket 错误");
      };

      this.ws.onclose = (event) => {
        console.log(`[QQ] WebSocket 已关闭: code=${event.code}, reason=${event.reason}`);
        this.setConnected(false);
        this.stopHeartbeat();

        // 自动重连
        if (this.running && this.reconnectCount < this.maxReconnect) {
          this.reconnectCount++;
          console.log(`[QQ] 尝试重连 (${this.reconnectCount}/${this.maxReconnect})...`);
          setTimeout(() => this.reconnect(), 5000);
        }
      };
    });
  }

  /**
   * 处理 WebSocket 消息
   */
  private handleWSMessage(msg: WSMessage): void {
    // 更新序列号
    if (msg.s !== undefined) {
      this.sequence = msg.s;
    }

    switch (msg.op) {
      case OP.HELLO:
        // 服务端 Hello，开始鉴权
        console.log("[QQ] 收到 HELLO");
        this.handleHello(msg.d as { heartbeat_interval?: number });
        break;

      case OP.DISPATCH:
        // 事件分发
        this.handleDispatch(msg.t, msg.d);
        break;

      case OP.HEARTBEAT_ACK:
        // 心跳确认（静默）
        break;

      case OP.RECONNECT:
        // 服务端要求重连
        console.log("[QQ] 服务端要求重连");
        this.reconnect();
        break;

      default:
        console.log(`[QQ] 收到未知 OP: ${msg.op}, data: ${JSON.stringify(msg.d).substring(0, 100)}`);
        break;
    }
  }

  /**
   * 处理 Hello 消息
   */
  private handleHello(data: { heartbeat_interval?: number }): void {
    this.heartbeatInterval = data?.heartbeat_interval ?? 41250;

    // 开始心跳
    this.startHeartbeat();

    // 发送鉴权
    this.sendIdentify();
  }

  /**
   * 发送鉴权（IDENTIFY）
   */
  private async sendIdentify(): Promise<void> {
    const token = await this.getAccessToken();

    // QQ 开放平台 intents:
    // GUILDS = 1 << 0 (频道事件)
    // GUILD_MEMBERS = 1 << 1 (成员事件)
    // GUILD_MESSAGES = 1 << 9 (频道消息，仅私域机器人)
    // DIRECT_MESSAGE = 1 << 12 (频道私信)
    // GROUP_AND_C2C_EVENT = 1 << 25 (群聊@机器人、单聊消息)
    // PUBLIC_GUILD_MESSAGES = 1 << 30 (公域消息，需要@机器人)
    const intents = (1 << 0) | (1 << 1) | (1 << 9) | (1 << 12) | (1 << 25) | (1 << 30);

    const identify = {
      op: OP.IDENTIFY,
      d: {
        token: `QQBot ${token}`,
        intents,
        shard: [0, 1],
        properties: {
          $os: process.platform,
          $browser: "micro-agent",
          $device: "micro-agent",
        },
      },
    };

    console.log(`[QQ] 发送 IDENTIFY, intents: ${intents}`);
    this.ws?.send(JSON.stringify(identify));
  }

  /**
   * 处理事件分发
   */
  private handleDispatch(eventType: string | undefined, data: unknown): void {
    if (!eventType) return;

    // 显示所有事件类型和数据摘要
    const dataStr = typeof data === 'object' ? JSON.stringify(data).substring(0, 200) : String(data);
    console.log(`[QQ] 事件: ${eventType}, 数据: ${dataStr}`);

    switch (eventType) {
      case "READY":
        this.handleReady(data as { session_id?: string });
        break;

      case "MESSAGE_CREATE":
      case "AT_MESSAGE_CREATE":
        // 频道消息事件
        this.handleChannelMessage(data as ChannelMessageData);
        break;

      case "DIRECT_MESSAGE_CREATE":
        // 频道私信消息事件
        this.handleDirectMessage(data as ChannelMessageData);
        break;

      case "GROUP_AT_MESSAGE_CREATE":
        // 群聊@机器人消息事件
        this.handleGroupMessage(data as GroupMessageData);
        break;

      case "C2C_MESSAGE_CREATE":
        // 单聊消息事件
        this.handleC2CMessage(data as C2CMessageData);
        break;

      default:
        // 显示未处理的事件
        console.log(`[QQ] 未处理事件: ${eventType}`);
        break;
    }
  }

  /**
   * 处理 READY 事件
   */
  private handleReady(data: { session_id?: string }): void {
    console.log("[QQ] 连接就绪, session_id:", data.session_id);
    // Session ID 可用于后续 RESUME 重连功能
    this.reconnectCount = 0;
    this.setConnected(true);
  }

  /**
   * 开始心跳
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeat();
    }, this.heartbeatInterval);
  }

  /**
   * 停止心跳
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * 发送心跳
   */
  private sendHeartbeat(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      const heartbeat = {
        op: OP.HEARTBEAT,
        d: this.sequence,
      };
      this.ws.send(JSON.stringify(heartbeat));
    }
  }

  /**
   * 重连
   */
  private async reconnect(): Promise<void> {
    this.ws?.close();
    this.ws = null;

    try {
      const gatewayUrl = await this.getGateway();
      await this.connectWebSocket(gatewayUrl);
    } catch (error) {
      console.error("[QQ] 重连失败:", error);
    }
  }

  /**
   * 处理频道消息
   */
  private handleChannelMessage(msg: ChannelMessageData): void {
    console.log(`[QQ] 频道消息: ${JSON.stringify(msg).substring(0, 300)}`);

    // 防重处理
    if (this.processedIds.has(msg.id)) {
      console.log(`[QQ] 跳过重复消息: ${msg.id}`);
      return;
    }
    this.processedIds.add(msg.id);

    // 清理过期 ID
    if (this.processedIds.size > 1000) {
      const ids = Array.from(this.processedIds);
      this.processedIds = new Set(ids.slice(-500));
    }

    // 忽略机器人自己的消息
    if (msg.author?.bot) {
      console.log(`[QQ] 跳过机器人消息: ${msg.id}`);
      return;
    }

    const senderId = msg.author?.id || "unknown";
    const channelId = msg.channel_id;
    const guildId = msg.guild_id;
    const content = (msg.content || "").trim();

    if (!content) {
      console.log(`[QQ] 跳过空消息`);
      return;
    }

    // 权限检查 - 频道列表
    const allowChannels = this.config.allowChannels || [];
    if (allowChannels.length > 0 && !allowChannels.includes("*") && !allowChannels.includes(channelId)) {
      console.log(`[QQ] 拒绝来自频道 ${channelId} 的消息（未在 allowChannels 列表中）`);
      return;
    }

    // 权限检查 - 用户列表
    const allowFrom = this.config.allowFrom || [];
    if (allowFrom.length > 0 && !allowFrom.includes("*") && !allowFrom.includes(senderId)) {
      console.log(`[QQ] 拒绝来自用户 ${senderId} 的消息（未在 allowFrom 列表中）`);
      return;
    }

    const inboundMsg: InboundMessage = {
      from: senderId,
      to: channelId,
      text: content,
      timestamp: Date.now(),
      channelId: this.id,
    };

    this.emitMessage(inboundMsg);
    console.log(`[QQ] 收到频道消息[${guildId}/${channelId}]: ${senderId}: ${content}`);
  }

  /**
   * 处理私聊消息
   */
  private handleDirectMessage(msg: ChannelMessageData): void {
    console.log(`[QQ] 私聊消息: ${JSON.stringify(msg).substring(0, 300)}`);

    // 防重处理
    if (this.processedIds.has(msg.id)) {
      return;
    }
    this.processedIds.add(msg.id);

    // 忽略机器人自己的消息
    if (msg.author?.bot) {
      return;
    }

    const senderId = msg.author?.id || "unknown";
    const content = (msg.content || "").trim();

    if (!content) return;

    // 权限检查
    const allowFrom = this.config.allowFrom || [];
    if (allowFrom.length > 0 && !allowFrom.includes("*") && !allowFrom.includes(senderId)) {
      console.log(`[QQ] 拒绝来自用户 ${senderId} 的私聊消息`);
      return;
    }

    const inboundMsg: InboundMessage = {
      from: senderId,
      to: senderId, // 私聊回复给发送者
      text: content,
      timestamp: Date.now(),
      channelId: this.id,
    };

    this.emitMessage(inboundMsg);
    console.log(`[QQ] 收到私聊消息: ${senderId}: ${content}`);
  }

  /**
   * 处理群聊消息
   */
  private handleGroupMessage(msg: GroupMessageData): void {
    console.log(`[QQ] 群聊消息: ${JSON.stringify(msg).substring(0, 300)}`);

    // 防重处理
    if (this.processedIds.has(msg.id)) {
      return;
    }
    this.processedIds.add(msg.id);

    // 忽略机器人自己的消息
    if (msg.author?.bot) {
      return;
    }

    const senderId = msg.author?.id || "unknown";
    const groupId = msg.group_openid || msg.group_id || "unknown";
    const content = (msg.content || "").trim();

    if (!content) return;

    // 权限检查
    const allowFrom = this.config.allowFrom || [];
    if (allowFrom.length > 0 && !allowFrom.includes("*") && !allowFrom.includes(senderId)) {
      console.log(`[QQ] 拒绝来自用户 ${senderId} 的群聊消息`);
      return;
    }

    const inboundMsg: InboundMessage = {
      from: senderId,
      to: groupId, // 群聊回复到群
      text: content,
      timestamp: Date.now(),
      channelId: this.id,
      metadata: {
        groupId,
        groupOpenid: msg.group_openid,
        memberOpenid: msg.author?.member_openid,
      },
    };

    this.emitMessage(inboundMsg);
    console.log(`[QQ] 收到群聊消息[${groupId}]: ${senderId}: ${content}`);
  }

  /**
   * 处理单聊消息
   */
  private handleC2CMessage(msg: C2CMessageData): void {
    console.log(`[QQ] 单聊消息: ${JSON.stringify(msg).substring(0, 300)}`);

    // 防重处理
    if (this.processedIds.has(msg.id)) {
      return;
    }
    this.processedIds.add(msg.id);

    // 忽略机器人自己的消息
    if (msg.author?.bot) {
      return;
    }

    const senderId = msg.author?.id || "unknown";
    const userOpenid = msg.author?.user_openid || senderId;
    const content = (msg.content || "").trim();

    if (!content) return;

    // 权限检查
    const allowFrom = this.config.allowFrom || [];
    if (allowFrom.length > 0 && !allowFrom.includes("*") && !allowFrom.includes(senderId)) {
      console.log(`[QQ] 拒绝来自用户 ${senderId} 的单聊消息`);
      return;
    }

    const inboundMsg: InboundMessage = {
      from: senderId,
      to: userOpenid, // 单聊回复用 openid
      text: content,
      timestamp: Date.now(),
      channelId: this.id,
      metadata: {
        userOpenid,
      },
    };

    this.emitMessage(inboundMsg);
    console.log(`[QQ] 收到单聊消息: ${senderId}: ${content}`);
  }

  /**
   * 停止 Channel
   */
  async stop(): Promise<void> {
    this.running = false;
    this.stopHeartbeat();

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.accessToken = null;
    this.setConnected(false);
    console.log("[QQ] Bot 已停止");
  }

  /**
   * 发送消息
   *
   * QQ 频道支持 Markdown 消息类型，需要使用 markdown 字段
   * 参考: https://bot.q.qq.com/wiki/develop/api-v2/server-inter/message/type/markdown.html
   *
   * 注意：Markdown 消息需要内邀开通权限（沙箱环境可调试）
   * 支持的格式：标题、加粗、斜体、链接、列表、代码块等
   */
  async send(message: OutboundMessage): Promise<SendResult> {
    try {
      const token = await this.getAccessToken();
      const isMarkdown = message.format === "markdown";

      // 应用 markdown 转换
      const text = isMarkdown ? convertMarkdown(message.text) : message.text;

      console.log(`[QQ] 发送消息到 ${message.to}: ${text.substring(0, 50)}...`);

      // 检查是否是群聊消息（通过 metadata 判断）
      const groupId = (message.metadata?.groupId || message.metadata?.groupOpenid) as string | undefined;
      if (groupId) {
        return this.sendGroupMessage(text, token, groupId, isMarkdown);
      }

      // 检查是否是单聊消息（通过 metadata 判断）
      const userOpenid = message.metadata?.userOpenid as string | undefined;
      if (userOpenid) {
        return this.sendC2CMessage(text, token, userOpenid, isMarkdown);
      }

      // 默认尝试作为频道消息发送
      const body = isMarkdown
        ? { markdown: { content: text } }
        : { content: text };

      const response = await fetch(`${this.apiBase}/channels/${message.to}/messages`, {
        method: "POST",
        headers: {
          Authorization: `QQBot ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const text = await response.text();
        console.error(`[QQ] 频道发送失败: ${response.status} ${text}`);

        // 如果频道发送失败，尝试作为私聊发送
        if (response.status === 404 || response.status === 403) {
          return this.sendDirectMessage(message.text, token, message.to, isMarkdown);
        }

        return { success: false, error: `发送失败: ${response.status} ${text}` };
      }

      const data = (await response.json()) as { id?: string; code?: number; message?: string };

      // 检查业务错误
      if (data.code) {
        console.error(`[QQ] 发送业务错误: ${data.code} ${data.message}`);
        return { success: false, error: `${data.message || '发送失败'} (code: ${data.code})` };
      }

      const result: SendResult = { success: true };
      if (data.id) {
        // 返回格式化的 messageId: {channel_id}:{message_id}
        result.messageId = `${message.to}:${data.id}`;
        result.metadata = { rawMessageId: data.id, channelId: message.to };
      }
      console.log(`[QQ] 消息发送成功: ${data.id || 'unknown'}`);
      return result;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.error(`[QQ] 发送异常: ${errMsg}`);
      return { success: false, error: errMsg };
    }
  }

  /**
   * 发送群聊消息
   *
   * QQ 群聊支持 Markdown 消息类型
   */
  private async sendGroupMessage(content: string, token: string, groupId: string, isMarkdown?: boolean): Promise<SendResult> {
    try {
      console.log(`[QQ] 发送群聊消息到 ${groupId}...`);

      const body = isMarkdown
        ? { markdown: { content }, msg_type: 2 } // msg_type: 2 表示 Markdown 消息
        : { content, msg_type: 0 }; // msg_type: 0 表示文本消息

      const response = await fetch(`${this.apiBase}/v2/groups/${groupId}/messages`, {
        method: "POST",
        headers: {
          Authorization: `QQBot ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const text = await response.text();
        console.error(`[QQ] 群聊发送失败: ${response.status} ${text}`);
        return { success: false, error: `群聊发送失败: ${response.status} ${text}` };
      }

      const data = (await response.json()) as { id?: string };
      const result: SendResult = { success: true };
      if (data.id) {
        // 返回格式化的 messageId: group:{group_id}:{message_id}
        result.messageId = `group:${groupId}:${data.id}`;
        result.metadata = { rawMessageId: data.id, groupId };
      }
      console.log(`[QQ] 群聊消息发送成功: ${data.id || 'unknown'}`);
      return result;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      return { success: false, error: errMsg };
    }
  }

  /**
   * 发送单聊消息
   *
   * QQ 单聊支持 Markdown 消息类型
   */
  private async sendC2CMessage(content: string, token: string, userOpenid: string, isMarkdown?: boolean): Promise<SendResult> {
    try {
      console.log(`[QQ] 发送单聊消息到 ${userOpenid}...`);

      const body = isMarkdown
        ? { markdown: { content }, msg_type: 2 } // msg_type: 2 表示 Markdown 消息
        : { content, msg_type: 0 }; // msg_type: 0 表示文本消息

      const response = await fetch(`${this.apiBase}/v2/users/${userOpenid}/messages`, {
        method: "POST",
        headers: {
          Authorization: `QQBot ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const text = await response.text();
        console.error(`[QQ] 单聊发送失败: ${response.status} ${text}`);
        return { success: false, error: `单聊发送失败: ${response.status} ${text}` };
      }

      const data = (await response.json()) as { id?: string };
      const result: SendResult = { success: true };
      if (data.id) {
        // 返回格式化的 messageId: c2c:{user_openid}:{message_id}
        result.messageId = `c2c:${userOpenid}:${data.id}`;
        result.metadata = { rawMessageId: data.id, userOpenid };
      }
      console.log(`[QQ] 单聊消息发送成功: ${data.id || 'unknown'}`);
      return result;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      return { success: false, error: errMsg };
    }
  }

  /**
   * 发送私聊消息
   *
   * QQ 私聊支持 Markdown 消息类型
   */
  private async sendDirectMessage(content: string, token: string, to: string, isMarkdown?: boolean): Promise<SendResult> {
    try {
      console.log(`[QQ] 尝试私聊发送...`);

      const body = isMarkdown
        ? { markdown: { content } }
        : { content };

      const response = await fetch(`${this.apiBase}/dms/${to}/messages`, {
        method: "POST",
        headers: {
          Authorization: `QQBot ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const text = await response.text();
        console.error(`[QQ] 私聊发送失败: ${response.status} ${text}`);
        return { success: false, error: `私聊发送失败: ${response.status} ${text}` };
      }

      const data = (await response.json()) as { id?: string };
      const result: SendResult = { success: true };
      if (data.id) {
        // 私聊消息格式: dms:{user_id}:{message_id}
        result.messageId = `dms:${to}:${data.id}`;
        result.metadata = { rawMessageId: data.id, dmsId: to };
      }
      console.log(`[QQ] 私聊消息发送成功: ${data.id || 'unknown'}`);
      return result;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      return { success: false, error: errMsg };
    }
  }

  /**
   * 更新消息
   * 
   * QQ 频道消息更新 API: PATCH /channels/{channel_id}/messages/{message_id}
   * 
   * messageId 格式要求：
   * - 频道消息: `{channel_id}:{message_id}`
   * - 群聊消息: `group:{group_id}:{message_id}`
   * - 单聊消息: `c2c:{user_openid}:{message_id}`
   * 
   * 注意：QQ 对 Markdown 渲染支持有限，仅支持加粗、斜体、链接
   */
  async updateMessage(
    messageId: string,
    text: string,
    _format?: "text" | "markdown"
  ): Promise<SendResult> {
    try {
      const token = await this.getAccessToken();

      // 解析 messageId 格式
      const parts = messageId.split(":");

      // 频道消息: {channel_id}:{message_id}
      if (parts.length === 2) {
        return this.updateChannelMessage(parts[1]!, text, token, parts[0]!);
      }

      // 群聊消息: group:{group_id}:{message_id}
      if (parts.length === 3 && parts[0] === "group") {
        return this.updateGroupMessage(parts[2]!, text, token, parts[1]!);
      }

      // 单聊消息: c2c:{user_openid}:{message_id}
      if (parts.length === 3 && parts[0] === "c2c") {
        return this.updateC2CMessage(parts[2]!, text, token, parts[1]!);
      }

      // 私聊消息: dms:{user_id}:{message_id}
      if (parts.length === 3 && parts[0] === "dms") {
        return this.updateDirectMessage(parts[2]!, text, token, parts[1]!);
      }

      return { success: false, error: `无效的 messageId 格式: ${messageId}` };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.error(`[QQ] 更新消息异常: ${errMsg}`);
      return { success: false, error: errMsg };
    }
  }

  /**
   * 更新频道消息
   */
  private async updateChannelMessage(
    messageId: string,
    content: string,
    token: string,
    channelId: string
  ): Promise<SendResult> {
    try {
      console.log(`[QQ] 更新频道消息: ${channelId}/${messageId}`);

      const response = await fetch(
        `${this.apiBase}/channels/${channelId}/messages/${messageId}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `QQBot ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            content,
            msg_type: 0,
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[QQ] 频道消息更新失败: ${response.status} ${errorText}`);
        return { success: false, error: `更新失败: ${response.status} ${errorText}` };
      }

      const data = (await response.json()) as { id?: string; code?: number; message?: string };

      if (data.code) {
        return { success: false, error: data.message || "更新失败" };
      }

      console.log(`[QQ] 频道消息更新成功: ${data.id || messageId}`);
      return { success: true, messageId: data.id || messageId };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      return { success: false, error: errMsg };
    }
  }

  /**
   * 更新群聊消息
   */
  private async updateGroupMessage(
    messageId: string,
    content: string,
    token: string,
    groupId: string
  ): Promise<SendResult> {
    try {
      console.log(`[QQ] 更新群聊消息: ${groupId}/${messageId}`);

      const response = await fetch(
        `${this.apiBase}/v2/groups/${groupId}/messages/${messageId}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `QQBot ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            content,
            msg_type: 0,
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[QQ] 群聊消息更新失败: ${response.status} ${errorText}`);
        return { success: false, error: `更新失败: ${response.status} ${errorText}` };
      }

      const data = (await response.json()) as { id?: string; code?: number; message?: string };

      if (data.code) {
        return { success: false, error: data.message || "更新失败" };
      }

      console.log(`[QQ] 群聊消息更新成功: ${data.id || messageId}`);
      return { success: true, messageId: data.id || messageId };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      return { success: false, error: errMsg };
    }
  }

  /**
   * 更新单聊消息
   */
  private async updateC2CMessage(
    messageId: string,
    content: string,
    token: string,
    userOpenid: string
  ): Promise<SendResult> {
    try {
      console.log(`[QQ] 更新单聊消息: ${userOpenid}/${messageId}`);

      const response = await fetch(
        `${this.apiBase}/v2/users/${userOpenid}/messages/${messageId}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `QQBot ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            content,
            msg_type: 0,
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[QQ] 单聊消息更新失败: ${response.status} ${errorText}`);
        return { success: false, error: `更新失败: ${response.status} ${errorText}` };
      }

      const data = (await response.json()) as { id?: string; code?: number; message?: string };

      if (data.code) {
        return { success: false, error: data.message || "更新失败" };
      }

      console.log(`[QQ] 单聊消息更新成功: ${data.id || messageId}`);
      return { success: true, messageId: data.id || messageId };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      return { success: false, error: errMsg };
    }
  }

  /**
   * 更新私聊消息
   */
  private async updateDirectMessage(
    messageId: string,
    content: string,
    token: string,
    dmsId: string
  ): Promise<SendResult> {
    try {
      console.log(`[QQ] 更新私聊消息: ${dmsId}/${messageId}`);

      const response = await fetch(
        `${this.apiBase}/dms/${dmsId}/messages/${messageId}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `QQBot ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            content,
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[QQ] 私聊消息更新失败: ${response.status} ${errorText}`);
        return { success: false, error: `更新失败: ${response.status} ${errorText}` };
      }

      const data = (await response.json()) as { id?: string; code?: number; message?: string };

      if (data.code) {
        return { success: false, error: data.message || "更新失败" };
      }

      console.log(`[QQ] 私聊消息更新成功: ${data.id || messageId}`);
      return { success: true, messageId: data.id || messageId };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      return { success: false, error: errMsg };
    }
  }
}

/**
 * 创建 QQ Channel 实例
 */
export function createQQChannel(config: QQBotConfig): QQChannel {
  return new QQChannel(config);
}
