/**
 * Provider 契约接口
 *
 * 定义 LLM 提供者的接口，遵循接口隔离原则
 */

import type { IChatProvider, IStreamProvider, IMonitorableProvider, IProviderExtended } from "../contracts.js";
import type { ProviderCapabilities, ProviderConfig, ProviderStatus } from "./types.js";
import type { ChatRequest, ChatResponse, StreamCallback } from "../types.js";

// 导出拆分后的接口
export type { IChatProvider, IStreamProvider, IMonitorableProvider } from "../contracts.js";

/**
 * IProvider 扩展接口
 *
 * 组合多个小接口，形成完整的 Provider 契约
 *
 * @deprecated 建议直接使用 IChatProvider、IStreamProvider、IMonitorableProvider
 *            根据需要组合使用
 */
export interface IProviderExtended extends IStreamProvider, IMonitorableProvider {
  /** Provider 配置信息 */
  readonly config: ProviderConfig;

  /** Provider 能力描述 */
  readonly capabilities: ProviderCapabilities;

  /**
   * 获取 Provider 当前状态
   * @returns Provider 状态信息
   */
  getStatus(): ProviderStatus;

  /**
   * 测试连接是否正常
   * @returns 连接是否成功
   */
  testConnection(): Promise<boolean>;

  /**
   * 执行流式聊天请求
   * @param request 聊天请求
   * @param callback 流式回调函数
   * @returns 最终聊天响应
   */
  streamChat(request: ChatRequest, callback: StreamCallback): Promise<ChatResponse>;
}
