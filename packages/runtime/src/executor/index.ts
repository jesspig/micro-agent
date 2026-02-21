/**
 * Agent 执行器
 *
 * 实现 ReAct 循环处理消息并协调工具调用。
 * 所有模型统一使用 ReAct JSON 模式，不依赖原生 function calling。
 */

import type { InboundMessage, OutboundMessage, ToolContext } from '@microbot/types';
import type { LLMGateway, LLMMessage, GenerationConfig, MessageContent, IntentPromptBuilder, UserPromptBuilder } from '@microbot/providers';
import type { MessageBus } from '../bus/queue';
import type { ModelConfig, RoutingConfig } from '@microbot/config';
import { ModelRouter, convertToPlainText, buildUserContent, type RouteResult } from '@microbot/providers';
import { parseReActResponse, ReActActionToTool } from '../react-types';
import { getLogger } from '@logtape/logtape';

const log = getLogger(['executor']);

/** 最大会话数量（防止内存泄漏） */
const MAX_SESSIONS = 1000;

/** 每个会话最大历史消息数 */
const MAX_HISTORY_PER_SESSION = 50;

/**
 * 工具注册表接口（避免循环依赖）
 */
export interface ToolRegistryLike {
  getDefinitions(): Array<{ name: string; description: string; inputSchema: unknown }>;
  execute(name: string, input: unknown, ctx: ToolContext): Promise<string>;
}

/** ReAct 提示词构建函数类型 */
export type ReActPromptBuilder = (tools: Array<{ name: string; description: string; inputSchema: unknown }>) => string;
export type ObservationBuilder = (result: string) => string;

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
  /** 意图识别模型（不会被路由，始终固定） */
  intentModel?: string;
  /** 可用模型列表 */
  availableModels?: Map<string, ModelConfig[]>;
  /** 路由配置 */
  routing?: RoutingConfig;
  /** 意图识别 System Prompt 构建函数 */
  buildIntentPrompt?: IntentPromptBuilder;
  /** 用户 Prompt 构建函数 */
  buildUserPrompt?: UserPromptBuilder;
  /** ReAct 系统提示词构建函数（应用层注入） */
  buildReActPrompt?: ReActPromptBuilder;
  /** Observation 消息构建函数（应用层注入） */
  buildObservation?: ObservationBuilder;
}

const DEFAULT_CONFIG: AgentExecutorConfig = {
  workspace: './workspace',
  maxIterations: 20,
  maxTokens: 8192,
  temperature: 0.7,
  auto: true,
  max: false,
};

/** 默认 Observation 构建函数 */
function defaultBuildObservation(result: string): string {
  return 'Observation: ' + result;
}

/**
 * Agent 执行器
 */
export class AgentExecutor {
  private running = false;
  private conversationHistory = new Map<string, LLMMessage[]>();
  private router: ModelRouter;
  private cachedToolDefinitions: Array<{ name: string; description: string; inputSchema: unknown }> | null = null;
  private buildReActPrompt: ReActPromptBuilder;
  private buildObservation: ObservationBuilder;

  constructor(
    private bus: MessageBus,
    private gateway: LLMGateway,
    private tools: ToolRegistryLike,
    private config: AgentExecutorConfig = DEFAULT_CONFIG
  ) {
    this.router = new ModelRouter({
      chatModel: config.chatModel || '',
      intentModel: config.intentModel,
      auto: config.auto ?? true,
      max: config.max ?? false,
      models: config.availableModels ?? new Map(),
      routing: config.routing,
      buildIntentPrompt: config.buildIntentPrompt,
      buildUserPrompt: config.buildUserPrompt,
    });
    this.router.setProvider(gateway);

    // 应用层必须注入 ReAct 提示词构建函数
    if (!config.buildReActPrompt) {
      throw new Error('AgentExecutor 需要注入 buildReActPrompt 函数');
    }
    this.buildReActPrompt = config.buildReActPrompt;
    this.buildObservation = config.buildObservation ?? defaultBuildObservation;
  }

  /**
   * 启动执行器
   */
  async run(): Promise<void> {
    this.running = true;
    log.info('Agent 执行器已启动 (ReAct 模式)');

    log.debug('配置详情', {
      maxIterations: this.config.maxIterations,
      maxTokens: this.config.maxTokens,
      temperature: this.config.temperature,
      auto: this.config.auto,
      max: this.config.max,
    });

    while (this.running) {
      try {
        const msg = await this.bus.consumeInbound();

        // CLI: 用户输入
        log.info('📥 用户输入', { content: msg.content });

        log.debug('消息详情', {
          channel: msg.channel,
          chatId: msg.chatId,
          senderId: msg.senderId,
          mediaCount: msg.media?.length ?? 0,
        });

        const startTime = Date.now();
        const response = await this.processMessage(msg);
        const elapsed = Date.now() - startTime;

        if (response) {
          await this.bus.publishOutbound(response);
          log.info('📤 回复已发送', { elapsed: `${elapsed}ms` });
        }
      } catch (error) {
        log.error('❌ 处理消息失败', { error: this.safeErrorMsg(error) });
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

    const messages = this.buildMessages(sessionHistory, msg);

    try {
      const result = await this.runReActLoop(messages, msg);
      this.updateHistory(sessionKey, messages.slice(1));

      return {
        channel: msg.channel,
        chatId: msg.chatId,
        content: result.content || '处理完成',
        media: [],
        metadata: msg.metadata,
      };
    } catch (error) {
      log.error('❌ 处理消息异常', { error: this.safeErrorMsg(error) });
      return this.createErrorResponse(msg);
    }
  }

  /**
   * 构建消息列表
   */
  private buildMessages(history: LLMMessage[], msg: InboundMessage): LLMMessage[] {
    const messages: LLMMessage[] = [];

    if (this.config.systemPrompt) {
      messages.push({ role: 'system', content: this.config.systemPrompt });
    }

    messages.push(...history);

    const userContent: MessageContent = buildUserContent(msg.content, msg.media);
    messages.push({ role: 'user', content: userContent });

    if (msg.media && msg.media.length > 0) {
      log.info('📎 媒体', { count: msg.media.length });
    }

    return messages;
  }

  /**
   * 运行 ReAct 循环
   *
   * 所有模型统一使用 ReAct JSON 模式
   */
  private async runReActLoop(messages: LLMMessage[], msg: InboundMessage): Promise<{ content: string }> {
    let iteration = 0;
    const toolDefs = this.getToolDefinitions();
    const reactSystemPrompt = this.buildReActPrompt(toolDefs);

    while (iteration < this.config.maxIterations) {
      iteration++;

      const routeResult = await this.selectModel(messages, msg.media, iteration);
      const generationConfig = this.mergeGenerationConfig(routeResult.config);

      const processedMessages = routeResult.config.vision
        ? messages
        : convertToPlainText(messages);

      // 构建 ReAct 消息
      const reactMessages: LLMMessage[] = [
        { role: 'system', content: reactSystemPrompt },
        ...processedMessages.filter(m => m.role !== 'system'),
      ];

      // CLI: 模型选择
      log.info('🤖 调用模型', { model: routeResult.model, reason: routeResult.reason });

      log.debug('路由详情', {
        provider: routeResult.config.id,
        vision: routeResult.config.vision,
        iteration,
      });

      const llmStartTime = Date.now();
      const response = await this.gateway.chat(reactMessages, [], routeResult.model, generationConfig);
      const llmElapsed = Date.now() - llmStartTime;

      // CLI: LLM 响应统计
      log.info('💬 LLM 响应', {
        model: `${response.usedProvider}/${response.usedModel}`,
        tokens: response.usage ? `${response.usage.inputTokens}→${response.usage.outputTokens}` : 'N/A',
        elapsed: `${llmElapsed}ms`,
      });

      // 解析 ReAct 响应
      const reactResponse = parseReActResponse(response.content);

      if (!reactResponse) {
        // 无法解析为 ReAct 格式，直接返回原始响应
        log.info('📝 回复 (非 ReAct 格式)', { content: response.content });
        return { content: response.content };
      }

      log.info('🧠 ReAct 思考', { thought: reactResponse.thought });

      if (reactResponse.action === 'finish') {
        // 任务完成
        const finalContent = typeof reactResponse.action_input === 'string'
          ? reactResponse.action_input
          : JSON.stringify(reactResponse.action_input);
        log.info('✅ 任务完成', { result: finalContent });
        return { content: finalContent };
      }

      // 执行工具
      // 1. 尝试从映射表获取工具名
      let toolName = ReActActionToTool[reactResponse.action];
      
      // 2. 如果映射为 null，尝试直接使用 action 名（动态工具发现）
      if (!toolName) {
        toolName = reactResponse.action;
      }
      
      // 3. 检查工具是否存在
      const toolExists = this.getToolDefinitions().some(t => t.name === toolName);
      if (!toolExists) {
        log.warn('⚠️ 未知动作', { action: reactResponse.action, resolvedTool: toolName });
        const obsMsg = JSON.stringify({
          error: true,
          message: `未找到工具: ${toolName}`,
          action: reactResponse.action
        });
        messages.push({ role: 'assistant', content: response.content });
        messages.push({ role: 'user', content: this.buildObservation(obsMsg) });
        continue;
      }

      const toolResult = await this.executeTool(toolName, reactResponse.action_input, msg);
      log.info('🔧 工具执行', { tool: toolName, result: toolResult });

      // 添加观察结果到消息
      messages.push({ role: 'assistant', content: response.content });
      messages.push({ role: 'user', content: this.buildObservation(toolResult) });
    }

    log.warn('⚠️ 达到最大迭代次数', { maxIterations: this.config.maxIterations });
    return { content: '达到最大迭代次数，任务未完成' };
  }

  /**
   * 获取工具定义
   */
  private getToolDefinitions(): Array<{ name: string; description: string; inputSchema: unknown }> {
    if (!this.cachedToolDefinitions) {
      this.cachedToolDefinitions = this.tools.getDefinitions();
    }
    return this.cachedToolDefinitions;
  }

  /**
   * 执行单个工具
   */
  private async executeTool(name: string, input: unknown, msg: InboundMessage): Promise<string> {
    try {
      const startTime = Date.now();
      const result = await this.tools.execute(name, input, this.createContext(msg));
      const elapsed = Date.now() - startTime;
      log.info('✅ 工具结果', { tool: name, elapsed: `${elapsed}ms` });
      return result;
    } catch (error) {
      log.error('❌ 工具执行失败', { tool: name, error: this.safeErrorMsg(error) });
      return JSON.stringify({
        error: true,
        message: '工具执行失败: ' + this.safeErrorMsg(error),
        tool: name
      });
    }
  }

  /**
   * 更新会话历史
   */
  private updateHistory(sessionKey: string, history: LLMMessage[]): void {
    const trimmed = history.length > MAX_HISTORY_PER_SESSION
      ? history.slice(-MAX_HISTORY_PER_SESSION)
      : history;

    this.conversationHistory.set(sessionKey, trimmed);
    this.trimSessions();
  }

  /**
   * 清理过期会话
   */
  private trimSessions(): void {
    if (this.conversationHistory.size <= MAX_SESSIONS) return;

    const keysToDelete = Array.from(this.conversationHistory.keys())
      .slice(0, this.conversationHistory.size - MAX_SESSIONS);

    for (const key of keysToDelete) {
      this.conversationHistory.delete(key);
    }

    log.debug('清理过期会话', { count: keysToDelete.length });
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
    log.debug('会话已清除', { sessionKey });
  }

  /**
   * 选择模型
   */
  private async selectModel(
    messages: LLMMessage[],
    media: string[] | undefined,
    iteration: number
  ): Promise<RouteResult> {
    if (iteration === 1 && this.config.auto) {
      const intent = await this.router.analyzeIntent(messages, media);
      log.info('🎯 意图识别', { model: intent.model, reason: intent.reason });
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

  /**
   * 安全的错误消息（脱敏）
   */
  private safeErrorMsg(error: unknown): string {
    if (!(error instanceof Error)) return '未知错误';

    let msg = error.message;
    msg = msg.replace(/[A-Z]:\\[^\s]+/gi, '[路径]');
    msg = msg.replace(/[a-zA-Z0-9_-]{20,}/g, '[密钥]');

    return msg;
  }
}
