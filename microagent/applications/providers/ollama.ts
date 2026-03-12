/**
 * Ollama Provider 实现
 *
 * 支持本地运行的开源大语言模型
 * 使用 Ollama 兼容的 API 格式（类似 OpenAI）
 */

import { BaseProvider } from "../../runtime/provider/base.js";
import type { IProviderExtended } from "../../runtime/provider/contract.js";
import type { ProviderCapabilities, ProviderConfig, ProviderStatus } from "../../runtime/provider/types.js";
import type { ChatRequest, ChatResponse, Message, ToolCall } from "../../runtime/types.js";

/**
 * Ollama 模型信息
 */
interface OllamaModel {
  name: string;
  modified_at: string;
  size: number;
}

/**
 * Ollama 模型列表响应
 */
interface OllamaModelsResponse {
  models: OllamaModel[];
}

/**
 * Ollama API 响应格式（与 OpenAI 兼容）
 */
interface OllamaResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string | null;
      tool_calls?: Array<{
        id: string;
        type: "function";
        function: {
          name: string;
          arguments: string;
        };
      }>;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * Ollama API 错误响应
 */
interface OllamaError {
  error: string;
}

/**
 * Ollama Provider 配置选项
 */
export interface OllamaProviderOptions {
  /** 基础 URL（可选，默认本地地址） */
  baseUrl?: string;
  /** 默认模型 */
  defaultModel?: string;
  /** 支持的模型列表（从配置文件读取，如未配置则运行时从 API 获取） */
  models?: string[];
  /** 请求超时（毫秒） */
  timeout?: number;
  /** 最大重试次数 */
  maxRetries?: number;
}

/**
 * Ollama Provider 实现
 *
 * 支持 Ollama 本地运行的各类开源模型
 * 使用 Bun 的 fetch API 进行 HTTP 请求
 */
export class OllamaProvider extends BaseProvider implements IProviderExtended {
  readonly name = "ollama";

  readonly config: ProviderConfig;

  /** 默认模型 */
  private readonly defaultModel: string;

  /** 请求超时（毫秒） */
  private readonly timeout: number;

  /** 最大重试次数 */
  private readonly maxRetries: number;

  /** 缓存的模型列表 */
  private cachedModels: string[] | null = null;

  /** 重试延迟基数（毫秒） */
  private readonly retryBaseDelay = 1000;

  /**
   * 创建 Ollama Provider 实例
   * @param options 配置选项
   */
  constructor(options: OllamaProviderOptions = {}) {
    super();

    const baseUrl = options.baseUrl ?? "http://localhost:11434/v1";

    // 从配置读取模型列表，如果配置了则使用配置的列表，否则运行时从 API 获取
    const models = options.models && options.models.length > 0
      ? options.models
      : []; // 空数组表示运行时从 API 获取

    this.config = {
      id: "ollama",
      name: "Ollama",
      baseUrl,
      apiKey: "", // Ollama 不需要 API Key
      models,
    };

    // 如果配置了模型列表，设置缓存
    if (models.length > 0) {
      this.cachedModels = [...models];
    }

    this.defaultModel = options.defaultModel ?? "llama3.2";
    this.timeout = options.timeout ?? 120000; // 本地模型可能较慢，延长超时
    this.maxRetries = options.maxRetries ?? 2;
  }

  /**
   * Provider 能力描述
   */
  override readonly capabilities: ProviderCapabilities = {
    supportsStreaming: true,
    supportsVision: false,
    supportsPromptCaching: false,
    maxContextTokens: 128000, // 根据具体模型而定
    toolSchemaMode: "native",
  };

  /**
   * 获取支持的模型列表
   * 如果配置了模型列表则返回配置的列表，否则首次调用时从 Ollama API 获取，后续使用缓存
   */
  getSupportedModels(): string[] {
    // 如果配置中有模型列表，直接返回
    if (this.config.models.length > 0) {
      return [...this.config.models];
    }

    // 返回缓存的模型列表或默认模型
    if (this.cachedModels) {
      return [...this.cachedModels];
    }

    // 返回默认模型列表（后台异步刷新）
    return [this.defaultModel];
  }

  /**
   * 刷新模型列表缓存
   * 从 Ollama API 获取最新的可用模型
   */
  async refreshModels(): Promise<string[]> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      try {
        const response = await fetch(
          `${this.config.baseUrl.replace("/v1", "")}/api/tags`,
          {
            method: "GET",
            signal: controller.signal,
          }
        );

        if (!response.ok) {
          throw new Error(`获取模型列表失败: ${response.statusText}`);
        }

        const data = (await response.json()) as OllamaModelsResponse;
        this.cachedModels = data.models.map((m) => m.name);
        return [...this.cachedModels];
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error) {
      console.warn("获取 Ollama 模型列表失败，使用默认模型:", error);
      return [this.defaultModel];
    }
  }

  /**
   * 执行聊天请求
   * @param request 聊天请求
   * @returns 聊天响应
   */
  async chat(request: ChatRequest): Promise<ChatResponse> {
    const { model, messages, tools, temperature, maxTokens } = request;

    // 刷新模型列表（如果是首次调用）
    if (!this.cachedModels) {
      await this.refreshModels();
    }

    // 构建 Ollama API 请求体（兼容 OpenAI 格式）
    const body: Record<string, unknown> = {
      model: model || this.defaultModel,
      messages: this.convertMessages(messages),
      temperature: temperature ?? 0.7,
      stream: false, // 当前仅支持非流式响应
    };

    // 添加可选参数
    if (maxTokens !== undefined) {
      body.max_tokens = maxTokens;
    }

    // 添加工具定义（Ollama 部分模型支持工具调用）
    if (tools && tools.length > 0) {
      body.tools = tools.map((tool) => ({
        type: "function",
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        },
      }));
    }

    // 发送请求（带重试）
    const response = await this.requestWithRetry(
      `${this.config.baseUrl}/chat/completions`,
      body
    );

    this.recordUsage();
    return this.parseResponse(response);
  }

  /**
   * 转换消息格式为 Ollama 格式（与 OpenAI 兼容）
   */
  private convertMessages(messages: Message[]): unknown[] {
    return messages.map((msg) => {
      const result: Record<string, unknown> = {
        role: msg.role,
        content: msg.content,
      };

      // 处理工具调用（assistant 消息）
      if (msg.role === "assistant" && msg.toolCalls) {
        result.tool_calls = msg.toolCalls.map((tc) => ({
          id: tc.id,
          type: "function",
          function: {
            name: tc.name,
            arguments: typeof tc.arguments === "string"
              ? tc.arguments
              : JSON.stringify(tc.arguments),
          },
        }));
      }

      // 处理工具响应（tool 消息）
      if (msg.role === "tool") {
        result.tool_call_id = msg.toolCallId;
      }

      return result;
    });
  }

  /**
   * 带重试的请求发送
   */
  private async requestWithRetry(url: string, body: unknown): Promise<OllamaResponse> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await this.sendRequest(url, body);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // 检查是否可重试
        if (!this.isRetryableError(error)) {
          throw error;
        }

        // 延迟后重试
        if (attempt < this.maxRetries) {
          const delay = this.retryBaseDelay * Math.pow(2, attempt);
          await this.sleep(delay);
        }
      }
    }

    this.recordError();
    throw lastError ?? new Error("请求失败");
  }

  /**
   * 发送单个请求
   */
  private async sendRequest(url: string, body: unknown): Promise<OllamaResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorData = (await response.json()) as OllamaError;
        throw new Error(
          `Ollama API 错误: ${errorData.error ?? response.statusText}`
        );
      }

      return (await response.json()) as OllamaResponse;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * 判断错误是否可重试
   */
  private isRetryableError(error: unknown): boolean {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      // 网络错误、超时可重试
      return (
        message.includes("timeout") ||
        message.includes("network") ||
        message.includes("aborted") ||
        message.includes("econnrefused") ||
        message.includes("connection")
      );
    }
    return false;
  }

  /**
   * 解析 API 响应
   */
  private parseResponse(response: OllamaResponse): ChatResponse {
    const choice = response.choices[0];
    if (!choice) {
      throw new Error("Ollama API 返回空响应");
    }

    const message = choice.message;
    const toolCalls: ToolCall[] | undefined = message.tool_calls?.map((tc) => ({
      id: tc.id,
      name: tc.function.name,
      arguments: this.parseToolArguments(tc.function.arguments),
    }));

    const result: ChatResponse = {
      text: message.content ?? "",
      hasToolCall: !!toolCalls && toolCalls.length > 0,
    };

    // 仅在有值时添加可选属性
    if (toolCalls && toolCalls.length > 0) {
      result.toolCalls = toolCalls;
    }

    if (response.usage) {
      result.usage = {
        inputTokens: response.usage.prompt_tokens,
        outputTokens: response.usage.completion_tokens,
      };
    }

    result.raw = response;
    return result;
  }

  /**
   * 解析工具调用参数
   */
  private parseToolArguments(args: string): Record<string, unknown> {
    try {
      return JSON.parse(args);
    } catch {
      return { raw: args };
    }
  }

  /**
   * 延迟函数
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * 获取 Provider 状态
   */
  override getStatus(): ProviderStatus {
    const status: ProviderStatus = {
      name: this.name,
      available: true,
      models: this.getSupportedModels(),
      errorCount: this.errorCount,
    };

    // 仅在有值时添加可选属性
    if (this.lastUsed !== undefined) {
      status.lastUsed = this.lastUsed;
    }

    return status;
  }

/**
   * 测试连接
   */
  override async testConnection(): Promise<boolean> {
    try {
      await this.refreshModels();
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * 创建 Ollama Provider 实例
 */
export function createOllamaProvider(options: OllamaProviderOptions): OllamaProvider {
  return new OllamaProvider(options);
}