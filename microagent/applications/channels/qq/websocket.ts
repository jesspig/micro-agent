/**
 * QQ 频道机器人 WebSocket 连接管理
 * 
 * 管理 WebSocket 连接、心跳、重连等
 */

import type { QQBotConfig, WSMessage, HelloData } from "./types.js";
import { OP, DEFAULT_HEARTBEAT_INTERVAL, MAX_RECONNECT_COUNT } from "./types.js";
import { QQAuth } from "./auth.js";

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
    this.onConnectionChange = handler;
  }

  /**
   * 连接 WebSocket
   */
  async connect(url: string): Promise<void> {
    this.running = true;

    return new Promise((resolve) => {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        console.log("[QQ] WebSocket 已连接");
        resolve();
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string) as WSMessage;
          this.handleMessage(msg);
        } catch (error) {
          console.error("[QQ] 解析消息失败:", error);
        }
      };

      this.ws.onerror = (error) => {
        console.error("[QQ] WebSocket 错误:", error);
        this.onConnectionChange?.(false, "WebSocket 错误");
      };

      this.ws.onclose = (event) => {
        console.log(`[QQ] WebSocket 已关闭: code=${event.code}, reason=${event.reason}`);
        this.onConnectionChange?.(false);
        this.stopHeartbeat();

        // 自动重连
        if (this.running && this.reconnectCount < MAX_RECONNECT_COUNT) {
          this.reconnectCount++;
          console.log(`[QQ] 尝试重连 (${this.reconnectCount}/${MAX_RECONNECT_COUNT})...`);
          this.reconnectTimer = setTimeout(() => this.reconnect(), 5000);
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

    switch (msg.op) {
      case OP.HELLO:
        this.handleHello(msg.d as HelloData);
        break;

      case OP.RECONNECT:
        console.log("[QQ] 服务端要求重连");
        this.reconnect();
        break;

      case OP.HEARTBEAT_ACK:
        // 心跳确认（静默）
        break;

      case OP.DISPATCH:
        // 事件分发由外部处理器处理
        this.onDispatch?.(msg.t, msg.d);
        break;

      default:
        console.log(`[QQ] 收到未知 OP: ${msg.op}`);
        break;
    }
  }

  /** 事件分发处理器 */
  private onDispatch?: (eventType: string | undefined, data: unknown) => void;

  /**
   * 设置事件分发处理器
   */
  setDispatchHandler(handler: (eventType: string | undefined, data: unknown) => void): void {
    this.onDispatch = handler;
  }

  /**
   * 处理 Hello 消息
   */
  private handleHello(data: HelloData): void {
    console.log("[QQ] 收到 HELLO");
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
    const token = await this.auth.getAccessToken();

    // QQ 开放平台 intents
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
      const gatewayUrl = await this.auth.getGateway();
      await this.connect(gatewayUrl);
    } catch (error) {
      console.error("[QQ] 重连失败:", error);
    }
  }

  /**
   * 处理 READY 事件
   */
  handleReady(sessionId?: string): void {
    console.log("[QQ] 连接就绪, session_id:", sessionId);
    this.reconnectCount = 0;
    this.onConnectionChange?.(true);
  }

  /**
   * 断开连接
   */
  disconnect(): void {
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

    console.log("[QQ] WebSocket 已断开");
  }
}
