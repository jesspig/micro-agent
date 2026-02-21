/**
 * Agent 执行器
 *
 * 实现 ReAct 循环处理消息并协调工具调用。
 */

import type { InboundMessage, OutboundMessage, ToolContext, ToolCall, ToolResult } from '@microbot/types';
import type { LLMGateway, LLMMessage, LLMToolDefinition, GenerationConfig, MessageContent } from '@microbot/providers';
import type { MessageBus } from '../bus/queue';
import type { ModelConfig, RoutingConfig } from '@microbot/config';
import { ModelRouter, convertToPlainText, buildUserContent, type RouteResult } from '@microbot/providers';
import { getLogger } from '@logtape/logtape';

const log = getLogger(['executor']);

/** 最大会话数量（防止内存泄漏） */
const MAX_SESSIONS = 1000;

/** 每个会话最大历史消息数 */
const MAX_HISTORY_PER_SESSION = 50;

/** 最大媒体数量 */
const MAX_MEDIA_COUNT = 10;

/**
 * 工具注册表接口（避免循环依赖）
 */
export interface ToolRegistryLike {
  getDefinitions(): Array<{ name: string; description: string; inputSchema: unknown }>;
  execute(name: string, input: unknown, ctx: ToolContext): Promise<string>;
}

/**
 * 将工具定义转换为 LLM 格式
 */
function toLLMToolDefinitions(tools: Array<{ name: string; description: string; inputSchema: unknown }>): LLMToolDefinition[] {
  return tools.map(tool => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema as Record<string, unknown>,
    },
  }));
}

/**
 * Agent 配置
 */
export interface AgentExecutorConfig {
  /** 工作目录 */
  workspace: string;
  /** 最大迭代次数 */
  maxIterations: number;
  /** 最大 tokens */
  maxTokens: number;
  /** 温度 */
  temperature: number;
  /** 系统提示词 */
  systemPrompt?: string;
  /** 自动路由 */
  auto?: boolean;
  /** 性能优先模式 */
  max?: boolean;
  /** 对话模型 */
  chatModel?: string;
  /** 意图识别模型 */
  checkModel?: string;
  /** 可用模型列表 */
  availableModels?: Map<string, ModelConfig[]>;
  /** 路由配置 */
  routing?: RoutingConfig;
}

const DEFAULT_CONFIG: AgentExecutorConfig = {
  workspace: './workspace',
  maxIterations: 20,
  maxTokens: 8192,
  temperature: 0.7,
  auto: true,
  max: false,
};

/**
 * Agent 执行器
 *
 * 处理消息并协调工具调用。
 */
export class AgentExecutor {
  private running = false;
  private conversationHistory = new Map<string, LLMMessage[]>();
  private router: ModelRouter;
  /** 缓存的工具定义 */
  private cachedToolDefinitions: LLMToolDefinition[] | null = null;

  constructor(
    private bus: MessageBus,
    private gateway: LLMGateway,
    private tools: ToolRegistryLike,
    private config: AgentExecutorConfig = DEFAULT_CONFIG
  ) {
    this.router = new ModelRouter({
      chatModel: config.chatModel || '',
      checkModel: config.checkModel,
      auto: config.auto ?? true,
      max: config.max ?? false,
      models: config.availableModels ?? new Map(),
      routing: config.routing,
    });
    this.router.setProvider(gateway);
  }

  /**
   * 启动执行器
   */
  async run(): Promise<void> {
    this.running = true;
    log.info('Agent 执行器已启动');
    log.info('配置: maxIterations={maxIterations}, maxTokens={maxTokens}, temperature={temperature}', {
      maxIterations: this.config.maxIterations,
      maxTokens: this.config.maxTokens,
      temperature: this.config.temperature,
    });

    const routerStatus = this.router.getStatus();
    log.info('路由配置: auto={auto}, max={max}, chatModel={chatModel}', {
      auto: routerStatus.auto,
      max: routerStatus.max,
      chatModel: routerStatus.chatModel,
    });
    if (routerStatus.rulesCount > 0) {
      log.info('路由规则: {count} 条', { count: routerStatus.rulesCount });
    }

    const tools = this.tools.getDefinitions();
    log.info('可用工具 ({count}个): {tools}', {
      count: tools.length,
      tools: tools.map(t => t.name).join(', ')
    });

    if (this.config.systemPrompt) {
      log.info('系统提示词: {length} 字符', { length: this.config.systemPrompt.length });
    }

    while (this.running) {
      try {
        const msg = await this.bus.consumeInbound();
        log.info('════════════════════════════════════════════════════════════');
        log.info('📥 收到消息');
        log.info('  通道: {channel}, 聊天ID: {chatId}', { channel: msg.channel, chatId: msg.chatId });
        log.info('  发送者: {senderId}', { senderId: msg.senderId });
        log.info('  内容: {content}', { content: msg.content });

        const startTime = Date.now();
        const response = await this.processMessage(msg);
        const elapsed = Date.now() - startTime;

        if (response) {
          await this.bus.publishOutbound(response);
          log.info('📤 回复已发送 (耗时 {elapsed}ms)', { elapsed });
          log.info('  内容预览: {preview}', { preview: this.preview(response.content, 100) });
        }
        log.info('════════════════════════════════════════════════════════════');
      } catch (error) {
        log.error('❌ 处理消息失败: {error}', { error: this.safeErrorMsg(error) });
      }
    }
  }

  /**
   * 停止执行器
   */
  stop(): void {
    this.running = false;
    log.info('Agent 执行器已停止');
  }

  /**
   * 处理单条消息
   */
  async processMessage(msg: InboundMessage): Promise<OutboundMessage | null> {
    const sessionKey = `${msg.channel}:${msg.chatId}`;
    const sessionHistory = this.conversationHistory.get(sessionKey) ?? [];

    // 构建消息
    const messages = this.buildMessages(sessionHistory, msg);

    try {
      const result = await this.runReActLoop(messages, msg);

      // 更新会话历史（跳过系统消息）
      this.updateHistory(sessionKey, messages.slice(1));

      return {
        channel: msg.channel,
        chatId: msg.chatId,
        content: result.content || '处理完成',
        media: [],
        metadata: msg.metadata,
      };
    } catch (error) {
      log.error('❌ 处理消息异常: {error}', { error: this.safeErrorMsg(error) });
      return this.createErrorResponse(msg);
    }
  }

  /**
   * 构建发送给 LLM 的消息列表
   */
  private buildMessages(history: LLMMessage[], msg: InboundMessage): LLMMessage[] {
    const messages: LLMMessage[] = [];

    // 系统消息
    if (this.config.systemPrompt) {
      messages.push({ role: 'system', content: this.config.systemPrompt });
    }

    // 历史消息
    messages.push(...history);

    // 用户消息（包含媒体）
    const userContent: MessageContent = buildUserContent(msg.content, msg.media);
    messages.push({ role: 'user', content: userContent });

    // 记录媒体信息
    if (msg.media && msg.media.length > 0) {
      log.info('  媒体: {count} 个', { count: msg.media.length });
      if (msg.media.length > MAX_MEDIA_COUNT) {
        log.warn('  ⚠️ 媒体数量超限，已截断为 {max} 个', { max: MAX_MEDIA_COUNT });
      }
    }

    return messages;
  }

  /**
   * 运行 ReAct 循环
   */
  private async runReActLoop(messages: LLMMessage[], msg: InboundMessage): Promise<{ content: string }> {
    let iteration = 0;
    let lastContent = '';

    // 获取工具定义（缓存）
    const toolDefinitions = this.getToolDefinitions();

    while (iteration < this.config.maxIterations) {
      iteration++;
      log.info('🔄 ReAct 迭代 #{iteration}', { iteration });

      const routeResult = await this.selectModel(messages, msg.media, iteration);
      const generationConfig = this.mergeGenerationConfig(routeResult.config);

      // 视觉检查
      const processedMessages = routeResult.config.vision
        ? messages
        : convertToPlainText(messages);

      // 调用 LLM
      log.info('  🤖 调用 LLM: {model}', { model: routeResult.model });
      log.info('    路由原因: {reason}', { reason: routeResult.reason });
      log.info('    视觉支持: {vision}', { vision: routeResult.config.vision ?? false });

      const response = await this.gateway.chat(processedMessages, toolDefinitions, routeResult.model, generationConfig);

      // 记录响应
      this.logResponse(response);

      // 添加助手消息
      messages.push(this.buildAssistantMessage(response));

      // 无工具调用则返回
      if (!response.hasToolCalls || !response.toolCalls || response.toolCalls.length === 0) {
        log.info('  📝 无工具调用，返回最终回复');
        return { content: response.content };
      }

      // 执行工具调用
      lastContent = await this.executeToolCalls(response.toolCalls, msg, messages);
    }

    log.warn('  ⚠️ 达到最大迭代次数 {maxIterations}', { maxIterations: this.config.maxIterations });
    return { content: lastContent };
  }

  /**
   * 获取工具定义（带缓存）
   */
  private getToolDefinitions(): LLMToolDefinition[] {
    if (!this.cachedToolDefinitions) {
      this.cachedToolDefinitions = toLLMToolDefinitions(this.tools.getDefinitions());
    }
    return this.cachedToolDefinitions;
  }

  /**
   * 记录 LLM 响应
   */
  private logResponse(response: { content: string; usedProvider?: string; usedModel?: string; usage?: { inputTokens: number; outputTokens: number; totalTokens: number } }): void {
    log.info('  ✅ LLM 响应');
    log.info('    模型: {provider}/{model}', {
      provider: response.usedProvider ?? 'unknown',
      model: response.usedModel ?? 'unknown'
    });
    if (response.usage) {
      log.info('    Token: 输入={input}, 输出={output}, 总计={total}', {
        input: response.usage.inputTokens,
        output: response.usage.outputTokens,
        total: response.usage.totalTokens,
      });
    }
    if (response.content) {
      log.info('    回复: {content}', { content: this.preview(response.content, 500) });
    }
  }

  /**
   * 构建助手消息
   */
  private buildAssistantMessage(response: { content: string; toolCalls?: ToolCall[] }): LLMMessage {
    const msg: LLMMessage = { role: 'assistant', content: response.content };
    if (response.toolCalls && response.toolCalls.length > 0) {
      msg.toolCalls = response.toolCalls;
    }
    return msg;
  }

  /**
   * 执行工具调用
   */
  private async executeToolCalls(toolCalls: ToolCall[], msg: InboundMessage, messages: LLMMessage[]): Promise<string> {
    log.info('  🔧 执行 {count} 个工具调用...', { count: toolCalls.length });
    let lastResult = '';

    for (const toolCall of toolCalls) {
      log.info('    ▶ 工具: {name}', { name: toolCall.name });
      log.info('      参数: {args}', { args: JSON.stringify(toolCall.arguments, null, 2) });

      const startTime = Date.now();
      const result = await this.runTool(toolCall, msg);
      const elapsed = Date.now() - startTime;

      log.info('      ✅ 完成 (耗时 {elapsed}ms)', { elapsed: elapsed });
      log.info('      结果: {result}', { result: this.preview(result, 500) });

      messages.push({ role: 'tool', content: result, toolCallId: toolCall.id });
      lastResult = result;
    }

    return lastResult;
  }

  /**
   * 执行单个工具
   */
  private async runTool(toolCall: ToolCall, msg: InboundMessage): Promise<string> {
    try {
      return await this.tools.execute(toolCall.name, toolCall.arguments, this.createContext(msg));
    } catch (error) {
      const errorMsg = this.safeErrorMsg(error);
      log.error('      ❌ 工具执行失败: {error}', { error: errorMsg });
      return JSON.stringify({ error: '工具执行失败', tool: toolCall.name });
    }
  }

  /**
   * 更新会话历史
   */
  private updateHistory(sessionKey: string, history: LLMMessage[]): void {
    // 限制历史长度
    const trimmed = history.length > MAX_HISTORY_PER_SESSION
      ? history.slice(-MAX_HISTORY_PER_SESSION)
      : history;

    this.conversationHistory.set(sessionKey, trimmed);

    // 清理过期会话
    this.trimSessions();
  }

  /**
   * 清理过期会话
   */
  private trimSessions(): void {
    if (this.conversationHistory.size <= MAX_SESSIONS) return;

    // 删除最旧的会话
    const keysToDelete = Array.from(this.conversationHistory.keys())
      .slice(0, this.conversationHistory.size - MAX_SESSIONS);

    for (const key of keysToDelete) {
      this.conversationHistory.delete(key);
    }

    log.debug('清理了 {count} 个过期会话', { count: keysToDelete.length });
  }

  /**
   * 创建错误响应
   */
  private createErrorResponse(msg: InboundMessage): OutboundMessage {
    return {
      channel: msg.channel,
      chatId: msg.chatId,
      content: '处理消息时发生内部错误，请稍后重试',
      media: [],
      metadata: msg.metadata,
    };
  }

  /**
   * 执行工具调用
   */
  private async executeToolCall(toolCall: ToolCall, msg: InboundMessage): Promise<string> {
    return this.runTool(toolCall, msg);
  }

  /**
   * 创建工具上下文
   */
  createContext(msg: InboundMessage): ToolContext {
    return {
      channel: msg.channel,
      chatId: msg.chatId,
      workspace: this.config.workspace,
      currentDir: msg.currentDir || this.config.workspace,
      sendToBus: async (m) => this.bus.publishOutbound(m as OutboundMessage),
    };
  }

  /**
   * 清除会话历史
   */
  clearSession(channel: string, chatId: string): void {
    const sessionKey = `${channel}:${chatId}`;
    this.conversationHistory.delete(sessionKey);
    log.info('会话已清除: {sessionKey}', { sessionKey });
  }

  /**
   * 选择模型（自动路由）
   */
  private async selectModel(
    messages: LLMMessage[],
    media: string[] | undefined,
    iteration: number
  ): Promise<RouteResult> {
    if (iteration === 1 && this.config.auto) {
      const intent = await this.router.analyzeIntent(messages, media);
      log.info('  🎯 意图识别: model={model}, reason={reason}', {
        model: intent.model,
        reason: intent.reason
      });
      return this.router.selectModelByIntent(intent);
    }

    return this.router.route(messages, iteration === 1 ? media : undefined);
  }

  /**
   * 合并生成配置
   */
  private mergeGenerationConfig(modelConfig: ModelConfig): GenerationConfig {
    const merged: GenerationConfig = {
      maxTokens: this.config.maxTokens,
      temperature: this.config.temperature,
    };

    if (modelConfig.maxTokens !== undefined) merged.maxTokens = modelConfig.maxTokens;
    if (modelConfig.temperature !== undefined) merged.temperature = modelConfig.temperature;
    if (modelConfig.topK !== undefined) merged.topK = modelConfig.topK;
    if (modelConfig.topP !== undefined) merged.topP = modelConfig.topP;
    if (modelConfig.frequencyPenalty !== undefined) merged.frequencyPenalty = modelConfig.frequencyPenalty;

    return merged;
  }

  private preview(text: string, maxLen = 50): string {
    if (!text) return '';
    return text.length > maxLen ? text.slice(0, maxLen) + '...' : text;
  }

  /**
   * 安全的错误消息（脱敏）
   */
  private safeErrorMsg(error: unknown): string {
    if (!(error instanceof Error)) return '未知错误';

    // 移除可能的敏感信息
    let msg = error.message;

    // 移除路径
    msg = msg.replace(/[A-Z]:\\[^\s]+/gi, '[路径]');

    // 移除 API 密钥
    msg = msg.replace(/[a-zA-Z0-9_-]{20,}/g, '[密钥]');

    return msg;
  }

  /**
   * 完整的错误消息（仅用于日志）
   */
  private errorMsg(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}