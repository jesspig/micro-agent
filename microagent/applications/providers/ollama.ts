/**
 * Ollama Provider 实现
 *
 * 支持本地运行的开源大语言模型
 * 使用 Ollama 原生 API 格式（支持 thinking 模型）
 */

import { BaseProvider } from "../../runtime/provider/base.js";
import type { IProviderExtended } from "../../runtime/provider/contract.js";
import type { ProviderCapabilities, ProviderConfig, ProviderStatus } from "../../runtime/provider/types.js";
import type { ChatRequest, ChatResponse, Message, StreamCallback, StreamChunk, ToolCall } from "../../runtime/types.js";

// ============================================================================
// 类型定义
// ============================================================================

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
 * Ollama 原生 API 响应格式
 */
interface OllamaNativeResponse {
  model: string;
  created_at: string;
  message: {
    role: string;
    content: string;
    /** 思考内容（thinking 模型） */
    thinking?: string;
    tool_calls?: Array<{
      id?: string;
      type?: "function";
      function: {
        name: string;
        arguments: string;
      };
    }>;
  };
  done_reason?: string;
  done: boolean;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
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
  /** Provider 名称 */
  name?: string;
  /** 基础 URL */
  baseUrl?: string;
  /** 支持的模型列表 */
  models?: string[];
  /** 默认模型 */
  defaultModel?: string;
  /** 请求超时（毫秒） */
  timeout?: number;
  /** 最大重试次数 */
  maxRetries?: number;
  /** 是否启用 thinking 模式 */
  think?: boolean;
}

// ============================================================================
// Provider 实现
// ============================================================================

export class OllamaProvider extends BaseProvider implements IProviderExtended {
  readonly name: string;
  readonly config: ProviderConfig;
  readonly capabilities: ProviderCapabilities;

  private readonly defaultModel: string;
  private readonly timeout: number;
  private readonly maxRetries: number;
  private readonly think: boolean;
  private readonly retryBaseDelay = 1000;
  private cachedModels: string[] | null = null;

  constructor(options: OllamaProviderOptions = {}) {
    super();

    this.name = options.name ?? "ollama";
    const baseUrl = options.baseUrl ?? "http://localhost:11434";
    const models = options.models?.length ? options.models : [];

    this.config = {
      id: this.name,
      name: "Ollama",
      baseUrl,
      apiKey: "",
      models,
    };

    if (models.length > 0) {
      this.cachedModels = [...models];
    }

    this.defaultModel = options.defaultModel ?? "llama3.2";
    this.timeout = options.timeout ?? 120000;
    this.maxRetries = options.maxRetries ?? 2;
    this.think = options.think ?? true;

    this.capabilities = {
      supportsStreaming: true,
      supportsVision: false,
      supportsPromptCaching: false,
      maxContextTokens: 128000,
      toolSchemaMode: "native",
    };
  }

  getSupportedModels(): string[] {
    if (this.config.models.length > 0) {
      return [...this.config.models];
    }
    if (this.cachedModels) {
      return [...this.cachedModels];
    }
    return [this.defaultModel];
  }

  async refreshModels(): Promise<string[]> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      try {
        const response = await fetch(`${this.config.baseUrl}/api/tags`, {
          method: "GET",
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`获取模型列表失败: ${response.statusText}`);
        }

        const data = (await response.json()) as OllamaModelsResponse;
        this.cachedModels = data.models.map((m) => m.name);
        return [...this.cachedModels!];
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error) {
      console.warn("获取 Ollama 模型列表失败，使用默认模型:", error);
      return [this.defaultModel];
    }
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const { model, messages, tools, temperature, maxTokens } = request;

    if (!this.cachedModels) {
      await this.refreshModels();
    }

    // 解析模型名称：支持 "provider/model" 格式，提取 model 部分
    const actualModel = this.parseModelName(model || this.defaultModel);

    // 构建原生 Ollama API 请求体
    const body: Record<string, unknown> = {
      model: actualModel,
      messages: this.convertMessages(messages),
      stream: false,
      think: this.think,
    };

    if (temperature !== undefined) {
      body.options = { temperature };
    }

    if (maxTokens !== undefined) {
      body.options = { ...(body.options as Record<string, unknown>), num_predict: maxTokens };
    }

    if (tools?.length) {
      body.tools = tools.map((tool) => ({
        type: "function",
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        },
      }));
    }

    const response = await this.requestWithRetry(`${this.config.baseUrl}/api/chat`, body);
    this.recordUsage();
    return this.parseResponse(response);
  }

  async streamChat(request: ChatRequest, callback: StreamCallback): Promise<ChatResponse> {
    const { model, messages, tools, temperature, maxTokens } = request;

    if (!this.cachedModels) {
      await this.refreshModels();
    }

    const actualModel = this.parseModelName(model || this.defaultModel);

    // 构建流式请求体
    const body: Record<string, unknown> = {
      model: actualModel,
      messages: this.convertMessages(messages),
      stream: true,
      think: this.think,
    };

    if (temperature !== undefined) {
      body.options = { temperature };
    }

    if (maxTokens !== undefined) {
      body.options = { ...(body.options as Record<string, unknown>), num_predict: maxTokens };
    }

    if (tools?.length) {
      body.tools = tools.map((tool) => ({
        type: "function",
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        },
      }));
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.config.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorData = (await response.json()) as OllamaError;
        throw new Error(`Ollama API 错误: ${errorData.error ?? response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("无法获取响应流");

      const decoder = new TextDecoder();
      let fullText = "";
      let fullReasoning = "";
      const toolCalls: ToolCall[] = [];
      let usage: { inputTokens: number; outputTokens: number } | undefined;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          // Ollama 每行一个 JSON 对象
          const lines = chunk.split("\n").filter((line) => line.trim());

          for (const line of lines) {
            try {
              const json = JSON.parse(line) as OllamaNativeResponse;

              // 累积内容
              if (json.message?.content) {
                fullText += json.message.content;
              }
              if (json.message?.thinking) {
                fullReasoning += json.message.thinking;
              }

              // 处理工具调用
              if (json.message?.tool_calls) {
                for (const tc of json.message.tool_calls) {
                  toolCalls.push({
                    id: tc.id ?? `tc_${Date.now()}_${toolCalls.length}`,
                    name: tc.function.name,
                    arguments: this.parseToolArguments(tc.function.arguments),
                  });
                }
              }

              // 触发回调
              const streamChunk: StreamChunk = {
                delta: json.message?.content ?? "",
                text: fullText,
                done: false,
              };
              if (fullReasoning) {
                const thinkingContent = json.message?.thinking;
                if (thinkingContent !== undefined) {
                  streamChunk.reasoningDelta = thinkingContent;
                }
                streamChunk.reasoning = fullReasoning;
              }
              await callback(streamChunk);

              // Ollama 在最后发送 done: true
              if (json.done) {
                usage = {
                  inputTokens: json.prompt_eval_count ?? 0,
                  outputTokens: json.eval_count ?? 0,
                };
              }
            } catch {
              // 忽略解析错误
            }
          }
        }
      } finally {
        reader.releaseLock();
      }

      // 最终回调
      const finalChunk: StreamChunk = {
        delta: "",
        text: fullText,
        done: true,
      };
      if (usage !== undefined) {
        finalChunk.usage = usage;
      }
      if (toolCalls.length > 0) {
        finalChunk.toolCalls = toolCalls;
      }
      if (fullReasoning) {
        finalChunk.reasoning = fullReasoning;
      }
      await callback(finalChunk);

      this.recordUsage();

      const chatResponse: ChatResponse = {
        text: fullText,
        hasToolCall: toolCalls.length > 0,
      };
      if (fullReasoning) {
        chatResponse.reasoning = fullReasoning;
      }
      if (toolCalls.length > 0) {
        chatResponse.toolCalls = toolCalls;
      }
      if (usage !== undefined) {
        chatResponse.usage = usage;
      }
      return chatResponse;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * 解析并验证模型名称
   * 支持格式：
   * - "model-name" -> 直接使用
   * - "provider/model-name" -> 验证 provider 匹配后提取 model
   *
   * @throws 如果 provider 不匹配当前 Provider 实例
   */
  private parseModelName(model: string): string {
    const slashIndex = model.indexOf("/");
    if (slashIndex >= 0) {
      const providerName = model.substring(0, slashIndex);
      const modelName = model.substring(slashIndex + 1);

      // 验证 provider 是否匹配当前实例
      if (providerName !== this.name) {
        throw new Error(
          `模型 "${model}" 的 provider "${providerName}" 与当前 Provider "${this.name}" 不匹配`
        );
      }

      return modelName;
    }
    return model;
  }

  private convertMessages(messages: Message[]): unknown[] {
    return messages.map((msg) => {
      const result: Record<string, unknown> = {
        role: msg.role,
        content: msg.content,
      };

      if (msg.role === "assistant" && msg.toolCalls) {
        result.tool_calls = msg.toolCalls.map((tc) => ({
          id: tc.id,
          type: "function",
          function: {
            name: tc.name,
            arguments: typeof tc.arguments === "string" ? tc.arguments : JSON.stringify(tc.arguments),
          },
        }));
      }

      if (msg.role === "tool") {
        result.tool_call_id = msg.toolCallId;
      }

      return result;
    });
  }

  private async requestWithRetry(url: string, body: unknown): Promise<OllamaNativeResponse> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await this.sendRequest(url, body);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (!this.isRetryableError(error)) throw error;
        if (attempt < this.maxRetries) {
          await this.sleep(this.retryBaseDelay * Math.pow(2, attempt));
        }
      }
    }

    this.recordError();
    throw lastError ?? new Error("请求失败");
  }

  private async sendRequest(url: string, body: unknown): Promise<OllamaNativeResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      const json: unknown = await response.json();

      if (!response.ok) {
        const errorMessage = this.extractErrorMessage(json);
        throw new Error(`Ollama API 错误: ${errorMessage}`);
      }

      return this.validateResponse(json);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * 从响应中提取错误消息
   */
  private extractErrorMessage(json: unknown): string {
    if (typeof json === "object" && json !== null) {
      const obj = json as Record<string, unknown>;
      if (typeof obj.error === "string") return obj.error;
    }
    return "未知错误";
  }

  /**
   * 验证并转换 Ollama 响应
   */
  private validateResponse(json: unknown): OllamaNativeResponse {
    if (typeof json !== "object" || json === null) {
      throw new Error("Ollama API 返回无效响应格式");
    }

    const obj = json as Record<string, unknown>;
    if (!obj.message || typeof obj.message !== "object") {
      throw new Error("Ollama API 返回非标准格式响应");
    }

    return json as OllamaNativeResponse;
  }

  private isRetryableError(error: unknown): boolean {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
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

  private parseResponse(response: OllamaNativeResponse): ChatResponse {
    const message = response.message;
    const toolCalls: ToolCall[] | undefined = message.tool_calls?.map((tc) => ({
      id: tc.id ?? `tc_${Date.now()}`,
      name: tc.function.name,
      arguments: this.parseToolArguments(tc.function.arguments),
    }));

    const result: ChatResponse = {
      text: message.content ?? "",
      hasToolCall: !!toolCalls?.length,
    };

    // 提取思考内容（thinking 模型：DeepSeek-R1、Qwen3 等）
    if (message.thinking) {
      result.reasoning = message.thinking;
    }

    if (toolCalls?.length) result.toolCalls = toolCalls;

    // 转换 usage 统计
    if (response.prompt_eval_count !== undefined || response.eval_count !== undefined) {
      result.usage = {
        inputTokens: response.prompt_eval_count ?? 0,
        outputTokens: response.eval_count ?? 0,
      };
    }

    result.raw = response;
    return result;
  }

  private parseToolArguments(args: string): Record<string, unknown> {
    try {
      return JSON.parse(args);
    } catch {
      return { raw: args };
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  override getStatus(): ProviderStatus {
    const status: ProviderStatus = {
      name: this.name,
      available: true,
      models: this.getSupportedModels(),
      errorCount: this.errorCount,
    };
    if (this.lastUsed !== undefined) status.lastUsed = this.lastUsed;
    return status;
  }

  override async testConnection(): Promise<boolean> {
    try {
      await this.refreshModels();
      return true;
    } catch {
      return false;
    }
  }
}

export function createOllamaProvider(options: OllamaProviderOptions): OllamaProvider {
  return new OllamaProvider(options);
}
