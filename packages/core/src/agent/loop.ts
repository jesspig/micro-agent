/**
 * Agent 循环 - ReAct 模式实现
 */

import type { LLMProvider, LLMMessage, LLMToolDefinition, ContentPart } from '../providers/base';
import type { MessageBus } from '../bus/queue';
import type { SessionStore } from '../storage/session/store';
import type { MemoryStore } from '../storage/memory/store';
import type { ToolRegistry, ToolContext } from '../tool/registry';
import type { InboundMessage, OutboundMessage, SessionKey } from '../bus/events';
import type { SkillsLoader } from '../skill/loader';
import type { GenerationConfig } from '../providers/base';
import type { ModelConfig, RoutingConfig, ModelsConfig } from '../config/schema';
import { ModelRouter, type ModelRouterConfig } from '../providers/router';
import { ContextBuilder } from './context';
import { getLogger } from '@logtape/logtape';

const log = getLogger(['agent']);

/** Agent 配置 */
export interface AgentConfig {
  workspace: string;
  models?: ModelsConfig;
  maxIterations: number;
  generation?: GenerationConfig;
  auto?: boolean;
  max?: boolean;
  availableModels?: Map<string, ModelConfig[]>;
  routing?: RoutingConfig;
}

const DEFAULT_CONFIG: AgentConfig = {
  workspace: './workspace',
  maxIterations: 20,
  generation: {
    maxTokens: 8192,
    temperature: 0.7,
    topK: 50,
    topP: 0.7,
    frequencyPenalty: 0.5,
  },
  auto: true,
  max: false,
};

/**
 * Agent 循环
 */
export class AgentLoop {
  private running = false;
  private router: ModelRouter;

  constructor(
    private bus: MessageBus,
    private provider: LLMProvider,
    private sessionStore: SessionStore,
    private memoryStore: MemoryStore,
    private toolRegistry: ToolRegistry,
    private skillsLoader: SkillsLoader,
    private config: AgentConfig = DEFAULT_CONFIG
  ) {
    this.router = new ModelRouter({
      chatModel: config.models?.chat || '',
      checkModel: config.models?.check,
      auto: config.auto ?? true,
      max: config.max ?? false,
      models: config.availableModels ?? new Map(),
      routing: config.routing,
    });
    this.router.setProvider(provider);
  }

  async run(): Promise<void> {
    this.running = true;
    log.info('Agent 循环已启动，加载 {count} 个技能', { count: this.skillsLoader.count });

    while (this.running) {
      try {
        const msg = await this.bus.consumeInbound();
        log.info('收到消息: {preview}', { preview: this.preview(msg.content) });
        const response = await this.processMessage(msg);
        if (response) {
          await this.bus.publishOutbound(response);
          log.info('回复已发送');
        }
      } catch (error) {
        log.error('处理消息失败: {error}', { error: this.errorMsg(error) });
      }
    }
  }

  stop(): void {
    this.running = false;
  }

  async processMessage(msg: InboundMessage): Promise<OutboundMessage | null> {
    const sessionKey = `${msg.channel}:${msg.chatId}` as SessionKey;
    const { messages, contextBuilder } = await this.buildContext(msg, sessionKey);
    const { finalContent, currentModel, currentLevel } = await this.runReActLoop(msg, messages);

    this.saveSession(sessionKey, messages, msg, finalContent);

    log.info('[Reply] {model} (level={level}): {content}', {
      model: currentModel,
      level: currentLevel,
      content: this.preview(finalContent, 100)
    });

    return {
      channel: msg.channel,
      chatId: msg.chatId,
      content: finalContent,
      media: [],
      metadata: msg.metadata,
    };
  }

  private async buildContext(
    msg: InboundMessage,
    sessionKey: SessionKey
  ): Promise<{ messages: LLMMessage[]; contextBuilder: ContextBuilder }> {
    const contextBuilder = new ContextBuilder(this.config.workspace, this.memoryStore);
    contextBuilder.setCurrentDir(msg.currentDir || this.config.workspace);

    const alwaysSkills = this.skillsLoader.getAlwaysSkills();
    if (alwaysSkills.length > 0) {
      contextBuilder.setAlwaysSkills(alwaysSkills);
    }

    contextBuilder.setSkillSummaries(this.skillsLoader.getSummaries());

    const history = this.getHistory(sessionKey);
    const messages = await contextBuilder.buildMessages(history, msg.content, msg.media);

    log.debug('上下文: {messages} 条消息, {history} 条历史', {
      messages: messages.length,
      history: history.length
    });

    return { messages, contextBuilder };
  }

  private async runReActLoop(
    msg: InboundMessage,
    messages: LLMMessage[]
  ): Promise<{ finalContent: string; currentModel: string; currentLevel: string }> {
    let iteration = 0;
    let finalContent = '';
    let currentModel = this.config.models.chat;
    let currentLevel = 'medium';
    let contextBuilder = new ContextBuilder(this.config.workspace, this.memoryStore);

    while (iteration < this.config.maxIterations) {
      iteration++;

      const { model, config: modelConfig, complexity, reason } = await this.selectModel(messages, msg.media, iteration);
      const generationConfig = this.mergeConfig(modelConfig);

      log.info('[LLM] {model} (level={level})', { model, level: modelConfig.level || 'medium' });
      if (complexity > 0) {
        log.debug('[Router] 复杂度={score}, 原因={reason}', { score: complexity, reason });
      }

      // 非视觉模型需要转换多模态消息为纯文本
      const processedMessages = modelConfig.vision ? messages : this.convertToPlainText(messages);

      const response = await this.provider.chat(processedMessages, this.getToolDefinitions(), model, generationConfig);

      currentModel = response.usedProvider && response.usedModel
        ? `${response.usedProvider}/${response.usedModel}`
        : model;
      currentLevel = response.usedLevel || modelConfig.level || 'medium';

      if (!response.hasToolCalls || !response.toolCalls) {
        finalContent = response.content;
        break;
      }

      // 添加助手消息并执行工具
      messages = contextBuilder.addAssistantMessage(messages, response.content, response.toolCalls);
      messages = await this.executeTools(response.toolCalls, msg, messages, currentModel);
    }

    return {
      finalContent: finalContent || '处理完成，但无响应内容。',
      currentModel,
      currentLevel
    };
  }

  private async selectModel(
    messages: LLMMessage[],
    media: string[] | undefined,
    iteration: number
  ): Promise<{ model: string; config: ModelConfig; complexity: number; reason: string }> {
    if (iteration === 1 && this.config.auto) {
      const intent = await this.router.analyzeIntent(messages, media);
      log.info('[Intent] model={model}, reason={reason}', { model: intent.model, reason: intent.reason });
      return this.router.selectModelByIntent(intent);
    }
    return this.router.route(messages, iteration === 1 ? media : undefined);
  }

  private async executeTools(
    toolCalls: Array<{ id: string; name: string; arguments: Record<string, unknown> }>,
    msg: InboundMessage,
    messages: LLMMessage[],
    currentModel: string
  ): Promise<LLMMessage[]> {
    const contextBuilder = new ContextBuilder(this.config.workspace, this.memoryStore);

    for (const tc of toolCalls) {
      log.info('[Tool] {model} 调用: {name}({args})', {
        model: currentModel,
        name: tc.name,
        args: this.formatArgs(tc.arguments)
      });

      const startTime = Date.now();
      const result = await this.toolRegistry.execute(tc.name, tc.arguments, this.createContext(msg));
      const elapsed = Date.now() - startTime;

      const isSuccess = !result.startsWith('错误') && !result.startsWith('参数错误');
      if (isSuccess) {
        log.info('[Tool] {model} 成功: {name} ({ms}ms) → {result}', {
          model: currentModel,
          name: tc.name,
          ms: elapsed,
          result: this.formatResult(result)
        });
      } else {
        log.error('[Tool] {model} 失败: {name} ({ms}ms) → {result}', {
          model: currentModel,
          name: tc.name,
          ms: elapsed,
          result: this.formatResult(result)
        });
      }

      messages = contextBuilder.addToolResult(messages, tc.id, result);
    }

    return messages;
  }

  private saveSession(
    sessionKey: SessionKey,
    messages: LLMMessage[],
    msg: InboundMessage,
    finalContent: string
  ): void {
    const userContent = msg.media && msg.media.length > 0
      ? messages[messages.length - 1].content
      : msg.content;
    this.sessionStore.addMessage(sessionKey, 'user', userContent);
    this.sessionStore.addMessage(sessionKey, 'assistant', finalContent);
  }

  private getHistory(sessionKey: SessionKey): LLMMessage[] {
    const session = this.sessionStore.get(sessionKey);
    if (!session) return [];

    return session.messages.map((m: { role: string; content: string | ContentPart[] }) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));
  }

  private getToolDefinitions(): LLMToolDefinition[] | undefined {
    const defs = this.toolRegistry.getDefinitions();
    if (!defs || defs.length === 0) return undefined;

    return defs.map(d => ({
      type: 'function' as const,
      function: {
        name: d.name,
        description: d.description,
        parameters: d.inputSchema as Record<string, unknown>,
      },
    }));
  }

  private createContext(msg: InboundMessage): ToolContext {
    return {
      channel: msg.channel,
      chatId: msg.chatId,
      workspace: this.config.workspace,
      currentDir: msg.currentDir || this.config.workspace,
      sendToBus: async (m) => this.bus.publishOutbound(m as OutboundMessage),
    };
  }

  private mergeConfig(modelConfig: ModelConfig): GenerationConfig {
    const merged: GenerationConfig = { ...this.config.generation };
    if (modelConfig.maxTokens !== undefined) merged.maxTokens = modelConfig.maxTokens;
    if (modelConfig.temperature !== undefined) merged.temperature = modelConfig.temperature;
    if (modelConfig.topK !== undefined) merged.topK = modelConfig.topK;
    if (modelConfig.topP !== undefined) merged.topP = modelConfig.topP;
    if (modelConfig.frequencyPenalty !== undefined) merged.frequencyPenalty = modelConfig.frequencyPenalty;
    return merged;
  }

  private formatArgs(args: Record<string, unknown>): string {
    const parts = Object.entries(args).map(([k, v]) => `${k}=${this.truncate(JSON.stringify(v), 50)}`);
    const result = parts.join(', ');
    return result.length > 200 ? result.slice(0, 200) + '...' : result;
  }

  private formatResult(result: string): string {
    return this.truncate(result.replace(/\n/g, ' '), 150);
  }

  private preview(text: string, max = 30): string {
    const preview = text.slice(0, max).replace(/\n/g, ' ');
    return preview + (text.length > max ? '...' : '');
  }

  private truncate(str: string, max: number): string {
    return str.length <= max ? str : str.slice(0, max) + '...';
  }

  private errorMsg(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  /**
   * 将多模态消息转换为纯文本格式
   * 用于不支持 vision 的模型
   */
  private convertToPlainText(messages: LLMMessage[]): LLMMessage[] {
    return messages.map(msg => {
      if (typeof msg.content === 'string') return msg;

      // ContentPart[] -> 纯文本
      const textParts: string[] = [];
      for (const part of msg.content) {
        if (part.type === 'text') {
          textParts.push(part.text);
        } else if (part.type === 'image_url') {
          textParts.push('[图片]');
        }
      }

      return { ...msg, content: textParts.join('\n') };
    });
  }
}