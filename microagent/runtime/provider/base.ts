import type { ChatRequest, ChatResponse, StreamCallback, StreamChunk } from "../types.js";
import type { IProviderExtended } from "./contract.js";
import type { ProviderCapabilities, ProviderConfig, ProviderStatus } from "./types.js";
import { providerLogger, createTimer, logMethodCall, logMethodReturn, logMethodError } from "../../applications/shared/logger.js";

const logger = providerLogger();

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
   * 执行流式聊天请求
   * 默认实现：调用 chat 后一次性返回（用于不支持流式的 Provider）
   * @param request 聊天请求
   * @param callback 流式回调
   * @returns 最终响应
   */
  async streamChat(request: ChatRequest, callback: StreamCallback): Promise<ChatResponse> {
    const timer = createTimer();
    logMethodCall(logger, { method: "streamChat", module: "BaseProvider", params: { model: request.model } });

    try {
      const response = await this.chat(request);
      
      // 一次性返回完整响应
      const chunk: StreamChunk = {
        delta: response.text,
        text: response.text,
        done: true,
      };
      
      // 仅在有值时添加可选属性
      if (response.reasoning !== undefined) {
        chunk.reasoning = response.reasoning;
      }
      if (response.toolCalls !== undefined) {
        chunk.toolCalls = response.toolCalls;
      }
      if (response.usage !== undefined) {
        chunk.usage = response.usage;
      }
      
      await callback(chunk);

      logMethodReturn(logger, { 
        method: "streamChat", 
        module: "BaseProvider", 
        result: { usage: response.usage },
        duration: timer() 
      });

      return response;
    } catch (err) {
      const error = err as Error;
      logMethodError(logger, { 
        method: "streamChat", 
        module: "BaseProvider", 
        error: { name: error.name, message: error.message, stack: error.stack },
        params: { model: request.model },
        duration: timer() 
      });
      throw err;
    }
  }

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
    const timer = createTimer();
    logMethodCall(logger, { method: "getStatus", module: "BaseProvider" });

    const status: ProviderStatus = {
      name: this.name,
      available: true,
      models: this.getSupportedModels(),
      errorCount: this.errorCount,
    };
    if (this.lastUsed !== undefined) {
      status.lastUsed = this.lastUsed;
    }

    logMethodReturn(logger, { 
      method: "getStatus", 
      module: "BaseProvider", 
      result: { name: status.name, available: status.available, errorCount: status.errorCount },
      duration: timer() 
    });

    return status;
  }

  /**
   * 测试连接是否正常
   * 通过发送一个最小化请求来验证
   * @returns 连接是否成功
   */
  async testConnection(): Promise<boolean> {
    const timer = createTimer();
    logMethodCall(logger, { method: "testConnection", module: "BaseProvider" });

    try {
      const models = this.getSupportedModels();
      const defaultModel = models[0] ?? "default";
      await this.chat({
        model: defaultModel,
        messages: [{ role: "user", content: "test" }],
        maxTokens: 1,
      });

      logger.info("连接测试成功", { provider: this.name, model: defaultModel });

      logMethodReturn(logger, { 
        method: "testConnection", 
        module: "BaseProvider", 
        result: true,
        duration: timer() 
      });

      return true;
    } catch (err) {
      const error = err as Error;
      logger.warn("连接测试失败", { provider: this.name, error: error.message });

      logMethodReturn(logger, { 
        method: "testConnection", 
        module: "BaseProvider", 
        result: false,
        duration: timer() 
      });

      return false;
    }
  }

  /**
   * 记录使用时间
   */
  protected recordUsage(): void {
    this.lastUsed = Date.now();
    logger.debug("记录使用时间", { provider: this.name, lastUsed: this.lastUsed });
  }

  /**
   * 记录错误
   */
  protected recordError(): void {
    this.errorCount++;
    logger.warn("记录错误", { provider: this.name, errorCount: this.errorCount });
  }
}