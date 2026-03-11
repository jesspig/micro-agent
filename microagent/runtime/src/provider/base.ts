import type { ChatRequest, ChatResponse } from "../types.js";
import type { IProviderExtended } from "./contract.js";
import type { ProviderCapabilities, ProviderConfig, ProviderStatus } from "./types.js";

/**
 * Provider 抽象基类
 * 提供通用实现，子类只需实现核心方法
 */
export abstract class BaseProvider implements IProviderExtended {
  /** Provider 名称 */
  abstract readonly name: string;

  /** Provider 配置 */
  abstract readonly config: ProviderConfig;

  /** Provider 能力（默认值） */
  readonly capabilities: ProviderCapabilities = {
    supportsStreaming: true,
    supportsVision: false,
    supportsPromptCaching: false,
    maxContextTokens: 128000,
    toolSchemaMode: "native",
  };

  /** 错误计数 */
  protected errorCount = 0;

  /** 最后使用时间 */
  protected lastUsed?: number;

  /**
   * 执行聊天请求
   * @param request 聊天请求
   * @returns 聊天响应
   */
  abstract chat(request: ChatRequest): Promise<ChatResponse>;

  /**
   * 获取支持的模型列表
   * @returns 模型名称列表
   */
  abstract getSupportedModels(): string[];

  /**
   * 获取 Provider 状态
   * @returns 状态信息
   */
  getStatus(): ProviderStatus {
    const status: ProviderStatus = {
      name: this.name,
      available: true,
      models: this.getSupportedModels(),
      errorCount: this.errorCount,
    };
    if (this.lastUsed !== undefined) {
      status.lastUsed = this.lastUsed;
    }
    return status;
  }

  /**
   * 测试连接是否正常
   * 通过发送一个最小化请求来验证
   * @returns 连接是否成功
   */
  async testConnection(): Promise<boolean> {
    try {
      const models = this.getSupportedModels();
      const defaultModel = models[0] ?? "default";
      await this.chat({
        model: defaultModel,
        messages: [{ role: "user", content: "test" }],
        maxTokens: 1,
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 记录使用时间
   */
  protected recordUsage(): void {
    this.lastUsed = Date.now();
  }

  /**
   * 记录错误
   */
  protected recordError(): void {
    this.errorCount++;
  }
}
