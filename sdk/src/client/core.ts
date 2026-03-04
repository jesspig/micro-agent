/**
 * SDK 客户端核心
 * 
 * 提供与 Agent Service 通信的核心客户端逻辑。
 */

import type { SDKClientConfig } from './types';

/**
 * SDK 客户端核心类
 */
export class SDKClientCore {
  protected config: SDKClientConfig;
  protected isConnected = false;

  constructor(config: SDKClientConfig) {
    this.config = config;
  }

  /**
   * 连接到 Agent Service
   */
  async connect(): Promise<void> {
    // 由具体传输层实现
    this.isConnected = true;
  }

  /**
   * 断开连接
   */
  async disconnect(): Promise<void> {
    this.isConnected = false;
  }

  /**
   * 检查是否已连接
   */
  get connected(): boolean {
    return this.isConnected;
  }

  /**
   * 获取配置
   */
  getConfig(): SDKClientConfig {
    return this.config;
  }
}
