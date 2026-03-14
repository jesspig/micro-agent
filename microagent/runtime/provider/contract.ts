import type { IProvider } from "../contracts.js";
import type { ProviderCapabilities, ProviderConfig, ProviderStatus } from "./types.js";
import type { ChatRequest, ChatResponse, StreamCallback } from "../types.js";

/**
 * IProvider 扩展接口
 * 在基础 IProvider 接口上增加配置、能力和状态管理
 */
export interface IProviderExtended extends IProvider {
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
