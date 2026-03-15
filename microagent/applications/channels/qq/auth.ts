/**
 * QQ 频道机器人认证模块
 * 
 * 管理 AccessToken 的获取和刷新
 */

import type { QQBotConfig, AccessTokenResponse, GatewayResponse } from "./types.js";
import { TOKEN_URL, SANDBOX_API_BASE } from "./types.js";

/**
 * QQ 认证管理器
 * 
 * 注意：个人助理场景强制使用沙箱环境
 */
export class QQAuth {
  private accessToken: string | null = null;
  private tokenExpireTime = 0;

  constructor(private config: QQBotConfig) {}

  /**
   * API 基础地址（强制沙箱环境）
   */
  get apiBase(): string {
    return SANDBOX_API_BASE;
  }

  /**
   * 获取 AccessToken
   * 
   * 自动缓存和刷新，提前 60 秒刷新
   */
  async getAccessToken(): Promise<string> {
    // 检查缓存是否有效（提前 60 秒刷新）
    if (this.accessToken && Date.now() < this.tokenExpireTime - 60000) {
      return this.accessToken;
    }

    const { appId, clientSecret } = this.config;

    if (!appId || !clientSecret) {
      throw new Error("QQ Channel 需要 appId 和 clientSecret 配置");
    }

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

    return this.accessToken;
  }

  /**
   * 获取 WebSocket Gateway 地址
   */
  async getGateway(): Promise<string> {
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

    return data.url;
  }

  /**
   * 清理敏感数据
   */
  clear(): void {
    this.accessToken = null;
    this.tokenExpireTime = 0;
  }
}
