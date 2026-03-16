/**
 * QQ 频道机器人 WebSocket 连接管理
 * 
 * 管理 WebSocket 连接、心跳、重连等
 */

import type { QQBotConfig, WSMessage, HelloData } from "./types.js";
import { OP, DEFAULT_HEARTBEAT_INTERVAL, MAX_RECONNECT_COUNT } from "./types.js";
import { QQAuth } from "./auth.js";
import { channelsLogger, createTimer, logMethodCall, logMethodReturn, logMethodError } from "../../shared/logger.js";

const logger = channelsLogger();

/** 模块名称常量 */
const MODULE_NAME = "QQWebSocket";

/**
 * WebSocket 连接管理器
 */
export class QQWebSocket {
  private ws: WebSocket | null = null;
  private heartbeatTimer: Timer | null = null;
  private heartbeatInterval = DEFAULT_HEARTBEAT_INTERVAL;
  private reconnectTimer: Timer | null = null;
  private sequence: number | null = null;
  private running = false;
  private reconnectCount = 0;

  /** 连接状态变更回调 */
  private onConnectionChange?: (connected: boolean, error?: string) => void;

  constructor(
    _config: QQBotConfig,
    private auth: QQAuth
  ) {}

  /**
   * 设置连接状态变更回调
   */
  setConnectionChangeHandler(handler: (connected: boolean, error?: string) => void): void {
    logMethodCall(logger, { method: "setConnectionChangeHandler", module: MODULE_NAME, params: {} });
    this.onConnectionChange = handler;
    logMethodReturn(logger, { method: "setConnectionChangeHandler", module: MODULE_NAME, result: {}, duration: 0 });
  }

  /**
   * 连接 WebSocket
   */
  async connect(url: string): Promise<void> {
    logMethodCall(logger, { method: "connect", module: MODULE_NAME, params: { url } });
    this.running = true;

    return new Promise((resolve) => {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        logger.info("WebSocket 连接已打开");
        this.onConnectionChange?.(true);
        resolve();
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string) as WSMessage;
          this.handleMessage(msg);
        } catch {
          // 解析消息失败，静默处理
          logger.warn("WebSocket 消息解析失败");
        }
      };

      this.ws.onerror = (event) => {
        logger.error("WebSocket 连接错误", { type: (event as ErrorEvent).type, message: (event as ErrorEvent).message });
        this.onConnectionChange?.(false, "WebSocket 错误");
      };

      this.ws.onclose = () => {
        logger.info("WebSocket 连接已关闭");
        this.onConnectionChange?.(false);
        this.stopHeartbeat();

        // 自动重连
        if (this.running && this.reconnectCount < MAX_RECONNECT_COUNT) {
          this.reconnectCount++;
          logger.info("WebSocket 连接断开，准备重连", { reconnectCount: this.reconnectCount, maxReconnect: MAX_RECONNECT_COUNT });
          this.reconnectTimer = setTimeout(() => this.reconnect(), 5000);
        } else if (this.reconnectCount >= MAX_RECONNECT_COUNT) {
          logger.error("WebSocket 重连次数已达上限", { maxReconnect: MAX_RECONNECT_COUNT });
          this.onConnectionChange?.(false, "重连次数已达上限");
        }
      };
    });
  }

  /**
   * 处理 WebSocket 消息
   */
  private handleMessage(msg: WSMessage): void {
    // 更新序列号
    if (msg.s !== undefined) {
      this.sequence = msg.s;
    }

    logger.debug("收到 WebSocket 消息", { op: msg.op, t: msg.t });

    switch (msg.op) {
      case OP.HELLO:
        this.handleHello(msg.d as HelloData);
        break;

      case OP.RECONNECT:
        logger.info("收到重连指令");
        this.reconnect();
        break;

      case OP.INVALID_SESSION:
        // OP 9 表示会话无效，需要重新 IDENTIFY
        // 清除 token 缓存，下次重新获取
        this.auth.clear();
        // 不重连，等待人工检查配置
        this.running = false;
        logger.error("会话无效", { reason: "INVALID_SESSION" });
        this.onConnectionChange?.(false, "INVALID_SESSION: 请检查 QQ 开放平台的 Intents 权限配置");
        break;

      case OP.HEARTBEAT_ACK:
        // 心跳确认（静默）
        logger.trace("心跳确认");
        break;

      case OP.DISPATCH:
        // 事件分发由外部处理器处理
        this.onDispatch?.(msg.t, msg.d);
        break;

      default:
        // 未知 OP，静默处理
        break;
    }
  }

  /** 事件分发处理器 */
  private onDispatch?: (eventType: string | undefined, data: unknown) => void;

  /**
   * 设置事件分发处理器
   */
  setDispatchHandler(handler: (eventType: string | undefined, data: unknown) => void): void {
    logMethodCall(logger, { method: "setDispatchHandler", module: MODULE_NAME, params: {} });
    this.onDispatch = handler;
    logMethodReturn(logger, { method: "setDispatchHandler", module: MODULE_NAME, result: {}, duration: 0 });
  }

  /**
   * 处理 Hello 消息
   */
  private handleHello(data: HelloData): void {
    logger.info("收到 Hello 消息", { heartbeatInterval: data?.heartbeat_interval });
    this.heartbeatInterval = data?.heartbeat_interval ?? DEFAULT_HEARTBEAT_INTERVAL;

    // 开始心跳
    this.startHeartbeat();

    // 发送鉴权
    this.sendIdentify();
  }

  /**
   * 发送鉴权（IDENTIFY）
   */
  private async sendIdentify(): Promise<void> {
    logMethodCall(logger, { method: "sendIdentify", module: MODULE_NAME, params: {} });
    const timer = createTimer();

    try {
      const token = await this.auth.getAccessToken();

      // QQ 开放平台 intents 配置
      // 文档: https://bot.q.qq.com/wiki/develop/api-v2/dev-prepare/interface-framework/event-emit.html
      //
      // 私域机器人 intents:
      // - GUILD_MESSAGES (1 << 9): 频道全部消息（私域机器人专用）
      // - GROUP_AND_C2C_EVENT (1 << 25): 群聊和单聊消息
      const GUILD_MESSAGES = 1 << 9;
      const GROUP_AND_C2C_EVENT = 1 << 25;
      const intents = GUILD_MESSAGES | GROUP_AND_C2C_EVENT;

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

      this.ws?.send(JSON.stringify(identify));
      logger.info("已发送 IDENTIFY");
      logMethodReturn(logger, { method: "sendIdentify", module: MODULE_NAME, result: { success: true }, duration: timer() });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logMethodError(logger, { method: "sendIdentify", module: MODULE_NAME, error: { name: err.name, message: err.message, stack: err.stack }, params: {}, duration: timer() });
    }
  }

  /**
   * 开始心跳
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();
    logger.info("开始心跳", { interval: this.heartbeatInterval });
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
      logger.debug("心跳已停止");
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
      logger.trace("发送心跳", { sequence: this.sequence });
    }
  }

  /**
   * 重连
   */
  private async reconnect(): Promise<void> {
    const timer = createTimer();
    logMethodCall(logger, { method: "reconnect", module: MODULE_NAME, params: { reconnectCount: this.reconnectCount } });

    this.ws?.close();
    this.ws = null;

    try {
      const gatewayUrl = await this.auth.getGateway();
      await this.connect(gatewayUrl);
      logger.info("重连成功");
      logMethodReturn(logger, { method: "reconnect", module: MODULE_NAME, result: { success: true }, duration: timer() });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logMethodError(logger, { method: "reconnect", module: MODULE_NAME, error: { name: err.name, message: err.message }, params: { reconnectCount: this.reconnectCount }, duration: timer() });
    }
  }

  /**
   * 处理 READY 事件
   */
  handleReady(): void {
    logMethodCall(logger, { method: "handleReady", module: MODULE_NAME, params: {} });
    this.reconnectCount = 0;
    this.onConnectionChange?.(true);
    logger.info("QQ WebSocket 已就绪");
    logMethodReturn(logger, { method: "handleReady", module: MODULE_NAME, result: { success: true }, duration: 0 });
  }

  /**
   * 断开连接
   */
  disconnect(): void {
    const timer = createTimer();
    logMethodCall(logger, { method: "disconnect", module: MODULE_NAME, params: {} });

    this.running = false;

    // 停止心跳
    this.stopHeartbeat();

    // 取消重连定时器
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    // 关闭 WebSocket
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }

    // 重置状态
    this.sequence = null;
    this.reconnectCount = 0;
    logger.info("WebSocket 已断开");
    logMethodReturn(logger, { method: "disconnect", module: MODULE_NAME, result: { success: true }, duration: timer() });
  }
}