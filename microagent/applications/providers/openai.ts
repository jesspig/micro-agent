/**
 * OpenAI Provider 实现
 *
 * 支持 OpenAI GPT API 格式
 */

import { BaseProvider } from "../../runtime/provider/base.js";
import type { IProviderExtended } from "../../runtime/provider/contract.js";
import type { ProviderCapabilities, ProviderConfig, ProviderStatus } from "../../runtime/provider/types.js";
import type { ChatRequest, ChatResponse, Message, StreamCallback, ToolCall } from "../../runtime/types.js";

// ============================================================================
// 类型定义
// ============================================================================

/** 流式工具调用（带原始参数字符串） */
interface StreamingToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  /** 原始参数字符串（流式累加） */
  _rawArgs?: string;
}

interface OpenAIResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string | null;
      /** 思考内容（OpenAI o1 等推理模型） */
      reasoning_content?: string;
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

/** 非标准错误响应格式（如部分国内平台） */
interface OpenAINonStandardError {
  status?: string | number;
  msg?: string;
}

export interface OpenAIProviderOptions {
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

export class OpenAIProvider extends BaseProvider implements IProviderExtended {
  readonly name: string;
  readonly config: ProviderConfig;
  readonly capabilities: ProviderCapabilities;

  private readonly defaultModel: string;
  private readonly timeout: number;
  private readonly maxRetries: number;
  private readonly retryBaseDelay = 1000;

  /** 缓存的请求头（避免每次请求重新创建对象） */
  private readonly cachedHeaders: Record<string, string>;

  constructor(options: OpenAIProviderOptions) {
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
      supportsPromptCaching: false,
      maxContextTokens: 128000,
      toolSchemaMode: "native",
      ...options.capabilities,
    };

    this.defaultModel = options.models[0]!;
    this.timeout = options.timeout ?? 60000;
    this.maxRetries = options.maxRetries ?? 3;

    // 初始化缓存请求头
    this.cachedHeaders = { "Content-Type": "application/json" };
    if (this.config.apiKey) {
      this.cachedHeaders.Authorization = `Bearer ${this.config.apiKey}`;
    }
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
      messages: this.convertMessages(messages),
      temperature: temperature ?? 0.7,
    };

    if (maxTokens !== undefined) body.max_tokens = maxTokens;
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

    const response = await this.requestWithRetry(`${this.config.baseUrl}/chat/completions`, body);
    this.recordUsage();
    return this.parseResponse(response);
  }

  async streamChat(request: ChatRequest, callback: StreamCallback): Promise<ChatResponse> {
    const { model, messages, tools, temperature, maxTokens } = request;
    const actualModel = this.parseModelName(model || this.defaultModel);

    const body: Record<string, unknown> = {
      model: actualModel,
      messages: this.convertMessages(messages),
      temperature: temperature ?? 0.7,
      stream: true,
    };

    if (maxTokens !== undefined) body.max_tokens = maxTokens;
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
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (this.config.apiKey) headers.Authorization = `Bearer ${this.config.apiKey}`;

      const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`${this.config.name} API 错误: ${response.statusText} - ${errorText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("无法获取响应流");

      const decoder = new TextDecoder();
      let fullText = "";
      let fullReasoning = "";
      const toolCalls: StreamingToolCall[] = [];
      let usage: { inputTokens: number; outputTokens: number } | undefined;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n").filter((line) => line.startsWith("data: "));

          for (const line of lines) {
            const data = line.slice(6);
            if (data === "[DONE]") continue;

            try {
              const json = JSON.parse(data) as {
                choices?: Array<{
                  delta?: {
                    content?: string;
                    reasoning_content?: string;
                    tool_calls?: Array<{
                      id?: string;
                      function?: { name?: string; arguments?: string };
                    }>;
                  };
                }>;
                usage?: { prompt_tokens: number; completion_tokens: number };
              };
              const delta = json.choices?.[0]?.delta;

              if (delta?.content) {
                fullText += delta.content;
              }
              if (delta?.reasoning_content) {
                fullReasoning += delta.reasoning_content;
              }
              if (delta?.tool_calls) {
                for (const tc of delta.tool_calls) {
                  this.mergeToolCall(toolCalls, tc);
                }
              }
              if (json.usage) {
                usage = {
                  inputTokens: json.usage.prompt_tokens,
                  outputTokens: json.usage.completion_tokens,
                };
              }

              // 构建回调参数（处理 exactOptionalPropertyTypes）
              const callbackChunk: {
                delta: string;
                text: string;
                done: boolean;
                reasoningDelta?: string;
                reasoning?: string;
              } = {
                delta: delta?.content || "",
                text: fullText,
                done: false,
              };
              if (delta?.reasoning_content !== undefined) {
                callbackChunk.reasoningDelta = delta.reasoning_content;
              }
              if (fullReasoning) {
                callbackChunk.reasoning = fullReasoning;
              }
              await callback(callbackChunk);
            } catch {
              // 忽略 JSON 解析错误（可能是不完整的 chunk）
            }
          }
        }
      } finally {
        reader.releaseLock();
      }

      // 最终回调
      const finalChunk: {
        delta: string;
        text: string;
        done: boolean;
        reasoning?: string;
        toolCalls?: ToolCall[];
        usage?: { inputTokens: number; outputTokens: number };
      } = {
        delta: "",
        text: fullText,
        done: true,
      };
      if (fullReasoning) {
        finalChunk.reasoning = fullReasoning;
      }
      if (toolCalls.length > 0) {
        finalChunk.toolCalls = toolCalls.map((tc) => ({
          id: tc.id,
          name: tc.name,
          arguments: tc._rawArgs ? this.parseToolArguments(tc._rawArgs) : tc.arguments,
        }));
      }
      if (usage) {
        finalChunk.usage = usage;
      }
      await callback(finalChunk);

      // 构建返回值
      const result: ChatResponse = {
        text: fullText,
        hasToolCall: toolCalls.length > 0,
      };
      if (fullReasoning) {
        result.reasoning = fullReasoning;
      }
      if (toolCalls.length > 0) {
        result.toolCalls = toolCalls.map((tc) => ({
          id: tc.id,
          name: tc.name,
          arguments: tc._rawArgs ? this.parseToolArguments(tc._rawArgs) : tc.arguments,
        }));
      }
      if (usage) {
        result.usage = usage;
      }

      this.recordUsage();
      return result;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * 合并流式工具调用
   * OpenAI 流式返回工具调用时，id 和 arguments 可能分多次返回
   */
  private mergeToolCall(
    toolCalls: StreamingToolCall[],
    tc: { id?: string; function?: { name?: string; arguments?: string } }
  ): void {
    if (tc.id) {
      // 新的工具调用开始
      toolCalls.push({
        id: tc.id,
        name: tc.function?.name || "",
        arguments: {},
        _rawArgs: "",
      });
    } else if (toolCalls.length > 0 && tc.function?.arguments) {
      // 追加参数到最后一个工具调用
      const last = toolCalls[toolCalls.length - 1]!;
      last._rawArgs = (last._rawArgs || "") + tc.function.arguments;
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
      const result: Record<string, unknown> = { role: msg.role, content: msg.content };
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
      if (msg.role === "tool") result.tool_call_id = msg.toolCallId;
      return result;
    });
  }

  private async requestWithRetry(url: string, body: unknown): Promise<OpenAIResponse> {
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

  private async sendRequest(url: string, body: unknown): Promise<OpenAIResponse> {
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

      const json: unknown = await response.json();

      // 处理 HTTP 错误
      if (!response.ok) {
        const errorMessage = this.extractErrorMessage(json);
        throw new Error(`${this.config.name} API 错误: ${errorMessage}`);
      }

      // 处理非标准错误格式（如 {"status":"435","msg":"Model not support"}）
      if (this.isNonStandardError(json)) {
        throw new Error(`${this.config.name} API 错误: ${json.msg} (status: ${json.status})`);
      }

      return this.validateOpenAIResponse(json);
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
      if (obj.error && typeof obj.error === "object") {
        const error = obj.error as Record<string, unknown>;
        if (typeof error.message === "string") return error.message;
      }
      if (typeof obj.message === "string") return obj.message;
    }
    return "未知错误";
  }

  /**
   * 检查是否为非标准错误响应
   */
  private isNonStandardError(json: unknown): json is OpenAINonStandardError {
    return (
      typeof json === "object" &&
      json !== null &&
      "status" in json &&
      "msg" in json &&
      !("choices" in json)
    );
  }

  /**
   * 验证并转换 OpenAI 响应
   * 使用类型守卫确保运行时类型安全
   */
  private validateOpenAIResponse(json: unknown): OpenAIResponse {
    if (typeof json !== "object" || json === null) {
      throw new Error(`${this.config.name} API 返回无效响应格式`);
    }

    const obj = json as Record<string, unknown>;
    if (!Array.isArray(obj.choices)) {
      throw new Error(`${this.config.name} API 返回非标准格式响应，请检查 baseUrl 是否正确`);
    }

    return json as OpenAIResponse;
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

  private parseResponse(response: OpenAIResponse): ChatResponse {
    // 检查响应格式
    if (!response.choices || !Array.isArray(response.choices)) {
      throw new Error(`${this.config.name} API 返回非标准格式响应，请检查 baseUrl 是否正确`);
    }

    const choice = response.choices[0];
    if (!choice) throw new Error(`${this.config.name} API 返回空响应`);

    const message = choice.message;
    const toolCalls: ToolCall[] | undefined = message.tool_calls?.map((tc) => ({
      id: tc.id,
      name: tc.function.name,
      arguments: this.parseToolArguments(tc.function.arguments),
    }));

    const result: ChatResponse = {
      text: message.content ?? "",
      hasToolCall: !!toolCalls?.length,
    };

    // 提取思考内容（OpenAI o1、DeepSeek 等推理模型）
    if (message.reasoning_content) {
      result.reasoning = message.reasoning_content;
    }

    if (toolCalls?.length) result.toolCalls = toolCalls;
    if (response.usage) {
      result.usage = {
        inputTokens: response.usage.prompt_tokens,
        outputTokens: response.usage.completion_tokens,
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
}

export function createOpenAIProvider(options: OpenAIProviderOptions): OpenAIProvider {
  return new OpenAIProvider(options);
}