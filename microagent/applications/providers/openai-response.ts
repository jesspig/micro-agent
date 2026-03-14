/**
 * OpenAI Response API Provider 实现
 *
 * 支持 OpenAI Response API 格式
 * 与 Chat Completions API 的区别：
 * - 端点: /v1/responses
 * - 工具定义不需要 function 包裹层
 * - 请求使用 input 替代 messages
 * - 响应使用 output 数组替代 choices
 */

import { BaseProvider } from "../../runtime/provider/base.js";
import type { IProviderExtended } from "../../runtime/provider/contract.js";
import type { ProviderCapabilities, ProviderConfig, ProviderStatus } from "../../runtime/provider/types.js";
import type { ChatRequest, ChatResponse, Message, ToolCall } from "../../runtime/types.js";

// ============================================================================
// 类型定义
// ============================================================================

interface OpenAIResponseAPIResponse {
  id: string;
  object: "response";
  created_at: string;
  model: string;
  output: Array<{
    id: string;
    type: "message" | "function_call" | "function_call_output";
    content?: Array<{
      type: "output_text" | "text";
      text?: string;
      annotations?: unknown[];
      logprobs?: unknown[];
    }>;
    role?: string;
    status?: "completed" | "in_progress" | "pending";
    call_id?: string;
    name?: string;
    arguments?: Record<string, unknown>;
  }>;
  usage?: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
  };
}

interface OpenAIResponseAPIError {
  error?: {
    message: string;
    type: string;
    code?: string;
  };
  message?: string;
}

export interface OpenAIResponseProviderOptions {
  name: string;
  displayName?: string;
  baseUrl: string;
  apiKey?: string;
  models: string[];
  timeout?: number;
  maxRetries?: number;
  capabilities?: Partial<ProviderCapabilities>;
}

// ============================================================================
// Provider 实现
// ============================================================================

export class OpenAIResponseProvider extends BaseProvider implements IProviderExtended {
  readonly name: string;
  readonly config: ProviderConfig;
  readonly capabilities: ProviderCapabilities;

  private readonly defaultModel: string;
  private readonly timeout: number;
  private readonly maxRetries: number;
  private readonly retryBaseDelay = 1000;

  constructor(options: OpenAIResponseProviderOptions) {
    super();

    if (!options.name) throw new Error("Provider name 未配置");
    if (!options.baseUrl) throw new Error(`${options.name} baseUrl 未配置`);
    if (!options.models?.length) throw new Error(`${options.name} models 未配置`);

    this.name = options.name;
    const apiKey = options.apiKey ?? process.env[`${options.name.toUpperCase()}_API_KEY`] ?? "";

    this.config = {
      id: options.name,
      name: options.displayName ?? options.name,
      baseUrl: options.baseUrl,
      apiKey,
      models: options.models,
    };

    this.capabilities = {
      supportsStreaming: true,
      supportsVision: true,
      supportsPromptCaching: true, // Response API 支持更好的缓存
      maxContextTokens: 128000,
      toolSchemaMode: "native",
      ...options.capabilities,
    };

    this.defaultModel = options.models[0]!;
    this.timeout = options.timeout ?? 60000;
    this.maxRetries = options.maxRetries ?? 3;
  }

  getSupportedModels(): string[] {
    return [...this.config.models];
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const { model, messages, tools, temperature, maxTokens } = request;

    // 解析模型名称：支持 "provider/model" 格式，提取 model 部分
    const actualModel = this.parseModelName(model || this.defaultModel);

    const body: Record<string, unknown> = {
      model: actualModel,
      input: this.convertMessages(messages),
      temperature: temperature ?? 0.7,
    };

    if (maxTokens !== undefined) body.max_tokens = maxTokens;
    if (tools?.length) {
      body.tools = tools.map((tool) => ({
        type: "function",
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      }));
    }

    const response = await this.requestWithRetry(`${this.config.baseUrl}/responses`, body);
    this.recordUsage();
    return this.parseResponse(response);
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
    // Response API 使用 items 而不是 messages
    return messages.map((msg) => {
      const result: Record<string, unknown> = { type: "message", role: msg.role, content: [] };

      if (typeof msg.content === "string") {
        result.content = [{ type: "text", text: msg.content }];
      } else if (Array.isArray(msg.content)) {
        result.content = msg.content;
      }

      if (msg.role === "assistant" && msg.toolCalls) {
        // 在 Response API 中，工具调用是独立的 items
        return [
          result,
          ...msg.toolCalls.map((tc) => ({
            type: "function_call",
            call_id: tc.id,
            name: tc.name,
            arguments: typeof tc.arguments === "string" ? this.parseToolArguments(tc.arguments) : tc.arguments,
          })),
        ];
      }

      if (msg.role === "tool") {
        return {
          type: "function_call_output",
          call_id: msg.toolCallId,
          output: msg.content,
        };
      }

      return result;
    }).flat();
  }

  private async requestWithRetry(url: string, body: unknown): Promise<OpenAIResponseAPIResponse> {
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

  private async sendRequest(url: string, body: unknown): Promise<OpenAIResponseAPIResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (this.config.apiKey) headers.Authorization = `Bearer ${this.config.apiKey}`;

      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorData = (await response.json()) as OpenAIResponseAPIError;
        const errorMessage = errorData.error?.message ?? errorData.message ?? response.statusText;
        throw new Error(`${this.config.name} API 错误: ${errorMessage}`);
      }

      return (await response.json()) as OpenAIResponseAPIResponse;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private isRetryableError(error: unknown): boolean {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return (
        message.includes("rate limit") ||
        message.includes("overloaded") ||
        message.includes("timeout") ||
        message.includes("network") ||
        message.includes("aborted") ||
        message.includes("429") ||
        message.includes("500") ||
        message.includes("502") ||
        message.includes("503") ||
        message.includes("504")
      );
    }
    return false;
  }

  private parseResponse(response: OpenAIResponseAPIResponse): ChatResponse {
    // Response API 返回 output 数组，每个 item 可以是 message 或 function_call
    const toolCalls: ToolCall[] = [];
    let textContent = "";

    for (const item of response.output) {
      if (item.type === "message" && item.content) {
        // 提取文本内容
        for (const content of item.content) {
          if (content.type === "output_text" || content.type === "text") {
            textContent += content.text ?? "";
          }
        }
      } else if (item.type === "function_call") {
        // 提取工具调用
        toolCalls.push({
          id: item.call_id ?? "",
          name: item.name ?? "",
          arguments: item.arguments ?? {},
        });
      }
    }

    const result: ChatResponse = {
      text: textContent,
      hasToolCall: toolCalls.length > 0,
    };

    if (toolCalls.length > 0) result.toolCalls = toolCalls;
    if (response.usage) {
      result.usage = {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      };
    }

    result.raw = response;
    return result;
  }

  private parseToolArguments(args: string | Record<string, unknown>): Record<string, unknown> {
    if (typeof args === "object") {
      return args;
    }
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
}

export function createOpenAIResponseProvider(options: OpenAIResponseProviderOptions): OpenAIResponseProvider {
  return new OpenAIResponseProvider(options);
}