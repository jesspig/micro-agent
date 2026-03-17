/**
 * QQ 频道机器人认证模块
 * 
 * 管理 AccessToken 的获取和刷新
 */

import type { QQBotConfig, AccessTokenResponse, GatewayResponse } from "./types.js";
import { TOKEN_URL, API_BASE, SANDBOX_API_BASE } from "./types.js";
import { channelsLogger, createTimer, logMethodCall, logMethodReturn, logMethodError } from "../../shared/logger.js";

const logger = channelsLogger();

/** 模块名称常量 */
const MODULE_NAME = "QQAuth";

/**
 * QQ 认证管理器
 * 
 * 注意：个人助理场景强制使用沙箱环境
 */
export class QQAuth {
  private accessToken: string | null = null;
  private tokenExpireTime = 0;

  constructor(private config: QQBotConfig) {
    logger.debug("创建 QQAuth 实例", { appId: config.appId });
  }

  /**
   * API 基础地址（根据配置切换沙箱/生产环境）
   */
  get apiBase(): string {
    // 默认使用沙箱环境，除非明确配置 sandbox: false
    return this.config.sandbox === false ? API_BASE : SANDBOX_API_BASE;
  }

  /**
   * 获取 AccessToken
   * 
   * 自动缓存和刷新，提前 60 秒刷新
   */
  async getAccessToken(): Promise<string> {
    const timer = createTimer();
    logMethodCall(logger, { method: "getAccessToken", module: MODULE_NAME, params: { appId: this.config.appId } });

    // 检查缓存是否有效（提前 60 秒刷新）
    if (this.accessToken && Date.now() < this.tokenExpireTime - 60000) {
      logger.debug("使用缓存的 AccessToken");
      logMethodReturn(logger, { method: "getAccessToken", module: MODULE_NAME, result: { cached: true }, duration: timer() });
      return this.accessToken;
    }

    const { appId, clientSecret } = this.config;

    if (!appId || !clientSecret) {
      const error = new Error("QQ Channel 需要 appId 和 clientSecret 配置");
      logMethodError(logger, { method: "getAccessToken", module: MODULE_NAME, error: { name: error.name, message: error.message }, params: {}, duration: timer() });
      throw error;
    }

    try {
      const response = await fetch(TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appId, clientSecret }),
      });

      if (!response.ok) {
        const text = await response.text();
        const error = new Error(`获取 AccessToken 失败: ${response.status} ${text}`);
        logMethodError(logger, { method: "getAccessToken", module: MODULE_NAME, error: { name: error.name, message: error.message }, params: { appId }, duration: timer() });
        throw error;
      }

      const data = (await response.json()) as AccessTokenResponse;

      if (!data.access_token) {
        const error = new Error("AccessToken 响应无效");
        logMethodError(logger, { method: "getAccessToken", module: MODULE_NAME, error: { name: error.name, message: error.message }, params: { appId }, duration: timer() });
        throw error;
      }

      this.accessToken = data.access_token;
      this.tokenExpireTime = Date.now() + data.expires_in * 1000;

      logger.info("AccessToken 获取成功", { expiresIn: data.expires_in });
      logMethodReturn(logger, { method: "getAccessToken", module: MODULE_NAME, result: { success: true, expiresIn: data.expires_in }, duration: timer() });
      return this.accessToken;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logMethodError(logger, { method: "getAccessToken", module: MODULE_NAME, error: { name: err.name, message: err.message, stack: err.stack }, params: { appId }, duration: timer() });
      throw error;
    }
  }

  /**
   * 获取 WebSocket Gateway 地址
   */
  async getGateway(): Promise<string> {
    const timer = createTimer();
    logMethodCall(logger, { method: "getGateway", module: MODULE_NAME, params: {} });

    try {
      const token = await this.getAccessToken();

      const response = await fetch(`${this.apiBase}/gateway/bot`, {
        headers: { Authorization: `QQBot ${token}` },
      });

      if (!response.ok) {
        const text = await response.text();
        const error = new Error(`获取 Gateway 失败: ${response.status} ${text}`);
        logMethodError(logger, { method: "getGateway", module: MODULE_NAME, error: { name: error.name, message: error.message }, params: {}, duration: timer() });
        throw error;
      }

      const data = (await response.json()) as GatewayResponse;

      if (!data.url) {
        const error = new Error("Gateway 响应无效");
        logMethodError(logger, { method: "getGateway", module: MODULE_NAME, error: { name: error.name, message: error.message }, params: {}, duration: timer() });
        throw error;
      }

      logger.info("Gateway 获取成功");
      logMethodReturn(logger, { method: "getGateway", module: MODULE_NAME, result: { success: true }, duration: timer() });
      return data.url;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logMethodError(logger, { method: "getGateway", module: MODULE_NAME, error: { name: err.name, message: err.message, stack: err.stack }, params: {}, duration: timer() });
      throw error;
    }
  }

  /**
   * 清理敏感数据
   */
  clear(): void {
    logMethodCall(logger, { method: "clear", module: MODULE_NAME, params: {} });
    this.accessToken = null;
    this.tokenExpireTime = 0;
    logger.info("认证数据已清理");
    logMethodReturn(logger, { method: "clear", module: MODULE_NAME, result: { success: true }, duration: 0 });
  }
}