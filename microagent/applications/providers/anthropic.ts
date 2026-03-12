/**
 * Anthropic Provider 实现
 *
 * 支持 Anthropic Claude API 格式
 */

import { BaseProvider } from "../../runtime/provider/base.js";
import type { IProviderExtended } from "../../runtime/provider/contract.js";
import type { ProviderCapabilities, ProviderConfig, ProviderStatus } from "../../runtime/provider/types.js";
import type { ChatRequest, ChatResponse, Message, ToolCall } from "../../runtime/types.js";

// ============================================================================
// 类型定义
// ============================================================================

interface AnthropicMessage {
  role: "user" | "assistant";
  content: Array<{ type: string; text?: string; tool_use_id?: string; name?: string; input?: unknown }>;
}

interface AnthropicRequest {
  model: string;
  messages: AnthropicMessage[];
  system?: string;
  max_tokens: number;
  temperature?: number;
  tools?: Array<{
    name: string;
    description: string;
    input_schema: unknown;
  }>;
}

interface AnthropicResponse {
  id: string;
  type: "message";
  role: "assistant";
  content: Array<{
    type: "text" | "tool_use";
    text?: string;
    id?: string;
    name?: string;
    input?: unknown;
  }>;
  stop_reason: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

export interface AnthropicProviderOptions {
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

export class AnthropicProvider extends BaseProvider implements IProviderExtended {
  readonly name: string;
  readonly config: ProviderConfig;
  readonly capabilities: ProviderCapabilities;

  private readonly defaultModel: string;
  private readonly timeout: number;
  private readonly maxRetries: number;
  private readonly retryBaseDelay = 1000;

  constructor(options: AnthropicProviderOptions) {
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
      supportsVision: false,
      supportsPromptCaching: true,
      maxContextTokens: 200000,
      toolSchemaMode: "anthropic",
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

    const body: AnthropicRequest = {
      model: model || this.defaultModel,
      messages: this.convertMessages(messages),
      max_tokens: maxTokens ?? 4096,
    };

    if (temperature !== undefined) body.temperature = temperature;
    if (tools?.length) {
      body.tools = tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.parameters,
      }));
    }

    const response = await this.requestWithRetry(`${this.config.baseUrl}/messages`, body);
    this.recordUsage();
    return this.parseResponse(response);
  }

  private convertMessages(messages: Message[]): AnthropicMessage[] {
    const result: AnthropicMessage[] = [];

    for (const msg of messages) {
      if (msg.role === "system") continue; // Anthropic 使用 system 参数

      if (msg.role === "user") {
        result.push({
          role: "user",
          content: [{ type: "text", text: msg.content }],
        });
      } else if (msg.role === "assistant") {
        const content: Array<{ type: string; text?: string; tool_use_id?: string; name?: string; input?: unknown }> = [];

        if (msg.content) {
          content.push({ type: "text", text: msg.content });
        }

        if (msg.toolCalls) {
          for (const tc of msg.toolCalls) {
            content.push({
              type: "tool_use",
              id: tc.id,
              name: tc.name,
              input: typeof tc.arguments === "string" ? JSON.parse(tc.arguments) : tc.arguments,
            });
          }
        }

        result.push({ role: "assistant", content });
      } else if (msg.role === "tool") {
        // 找到对应的 tool_use 消息
        const lastAssistant = result[result.length - 1];
        if (lastAssistant && lastAssistant.role === "assistant") {
          lastAssistant.content.push({
            type: "tool_result",
            tool_use_id: msg.toolCallId!,
            content: msg.content,
          });
        }
      }
    }

    return result;
  }

  private async requestWithRetry(url: string, body: AnthropicRequest): Promise<AnthropicResponse> {
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

  private async sendRequest(url: string, body: AnthropicRequest): Promise<AnthropicResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "x-api-key": this.config.apiKey,
        "anthropic-version": "2023-06-01",
      };

      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error?.message ?? response.statusText;
        throw new Error(`${this.config.name} API 错误: ${errorMessage}`);
      }

      return (await response.json()) as AnthropicResponse;
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

  private parseResponse(response: AnthropicResponse): ChatResponse {
    const toolCalls: ToolCall[] | undefined = [];
    let text = "";

    for (const block of response.content) {
      if (block.type === "text") {
        text += block.text ?? "";
      } else if (block.type === "tool_use") {
        toolCalls.push({
          id: block.id!,
          name: block.name!,
          arguments: block.input as Record<string, unknown>,
        });
      }
    }

    const result: ChatResponse = {
      text,
      hasToolCall: toolCalls.length > 0,
    };

    if (toolCalls.length) result.toolCalls = toolCalls;
    result.usage = {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };

    result.raw = response;
    return result;
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

export function createAnthropicProvider(options: AnthropicProviderOptions): AnthropicProvider {
  return new AnthropicProvider(options);
}