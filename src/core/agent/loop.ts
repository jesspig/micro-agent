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
  /** 工作目录 */
  workspace: string;
  /** 模型配置 */
  models: ModelsConfig;
  /** 最大迭代次数 */
  maxIterations: number;
  /** 生成配置 */
  generation?: GenerationConfig;
  /** 开启自动路由 */
  auto?: boolean;
  /** 性能优先模式 */
  max?: boolean;
  /** 可用模型列表（用于自动路由） */
  availableModels?: Map<string, ModelConfig[]>;
  /** 路由规则配置 */
  routing?: RoutingConfig;
}

const DEFAULT_CONFIG: AgentConfig = {
  workspace: './workspace',
  models: { chat: 'qwen3' },
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
 * 合并生成配置
 * 模型配置覆盖默认配置
 */
function mergeGenerationConfig(
  defaultConfig: GenerationConfig | undefined,
  modelConfig: ModelConfig
): GenerationConfig {
  const merged: GenerationConfig = { ...defaultConfig };
  
  if (modelConfig.maxTokens !== undefined) merged.maxTokens = modelConfig.maxTokens;
  if (modelConfig.temperature !== undefined) merged.temperature = modelConfig.temperature;
  if (modelConfig.topK !== undefined) merged.topK = modelConfig.topK;
  if (modelConfig.topP !== undefined) merged.topP = modelConfig.topP;
  if (modelConfig.frequencyPenalty !== undefined) merged.frequencyPenalty = modelConfig.frequencyPenalty;
  
  return merged;
}

/**
 * Agent 循环
 * 
 * 核心 ReAct 模式实现：
 * 1. 接收消息
 * 2. 构建上下文
 * 3. 调用 LLM
 * 4. 执行工具
 * 5. 返回响应
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
    // 初始化模型路由器
    this.router = new ModelRouter({
      chatModel: config.models.chat,
      checkModel: config.models.check,
      auto: config.auto ?? true,
      max: config.max ?? false,
      models: config.availableModels ?? new Map(),
      routing: config.routing,
    });
    
    // 设置 provider 用于意图识别
    this.router.setProvider(provider);
  }

  /**
   * 运行 Agent 循环
   */
  async run(): Promise<void> {
    this.running = true;
    log.info('Agent 循环已启动，加载 {count} 个技能', { count: this.skillsLoader.count });

    while (this.running) {
      try {
        log.debug('等待消息...');
        const msg = await this.bus.consumeInbound();
        const preview = msg.content.slice(0, 30).replace(/\n/g, ' ');
        log.info('收到消息: {preview}', { preview: preview + (msg.content.length > 30 ? '...' : '') });
        const response = await this.processMessage(msg);
        if (response) {
          await this.bus.publishOutbound(response);
          log.info('回复已发送');
        }
      } catch (error) {
        log.error('处理消息失败: {error}', { error: error instanceof Error ? error.message : String(error) });
      }
    }
  }

  /**
   * 停止循环
   */
  stop(): void {
    this.running = false;
  }

  /**
   * 处理单条消息
   */
  async processMessage(msg: InboundMessage): Promise<OutboundMessage | null> {
    const sessionKey = `${msg.channel}:${msg.chatId}` as SessionKey;

    // 构建上下文
    const contextBuilder = new ContextBuilder(this.config.workspace, this.memoryStore);
    
    // 设置当前目录（用于目录级配置查找）
    const currentDir = msg.currentDir || this.config.workspace;
    contextBuilder.setCurrentDir(currentDir);
    
    // 注入 Always 技能（自动加载完整内容）
    const alwaysSkills = this.skillsLoader.getAlwaysSkills();
    if (alwaysSkills.length > 0) {
      contextBuilder.setAlwaysSkills(alwaysSkills);
      log.debug('Always 技能: {skills}', { skills: alwaysSkills.map(s => s.name).join(', ') });
    }
    
    // 注入技能摘要（渐进式披露）
    contextBuilder.setSkillSummaries(this.skillsLoader.getSummaries());
    
    const history = this.getHistory(sessionKey);
    let messages = await contextBuilder.buildMessages(history, msg.content, msg.media);
    log.debug('上下文: {messages} 条消息, {history} 条历史, skills: {skills}, currentDir: {dir}', { 
      messages: messages.length, 
      history: history.length,
      skills: this.skillsLoader.count,
      dir: currentDir 
    });

    // ReAct 循环
    let iteration = 0;
    let finalContent = '';
    let currentModel = this.config.models.chat;
    let currentLevel = 'medium';

    while (iteration < this.config.maxIterations) {
      iteration++;
      
      const tools = this.getToolDefinitions();
      
      // 调试：打印工具定义数量
      log.debug('[Tools] 工具定义数量: {count}', { count: tools?.length ?? 0 });
      
      // 选择模型
      let routeResult: { model: string; config: ModelConfig; complexity: number; reason: string };
      
      // 第一次迭代时使用意图识别
      if (iteration === 1 && this.config.auto) {
        // 使用 check 模型进行意图识别
        const intent = await this.router.analyzeIntent(messages, msg.media);
        routeResult = this.router.selectModelByIntent(intent);
        log.info('[Intent] model={model}, reason={reason}', { 
          model: intent.model, 
          reason: intent.reason 
        });
      } else {
        // 后续迭代使用规则路由
        routeResult = this.router.route(messages, iteration === 1 ? msg.media : undefined);
      }
      
      const requestedModel = routeResult.model;
      const modelCapabilities = routeResult.config;
      const requestedLevel = modelCapabilities.level || 'medium';
      const generationConfig = mergeGenerationConfig(this.config.generation, modelCapabilities);
      
      // 显示请求的模型信息
      log.info('[LLM] {model} (level={level})', { model: requestedModel, level: requestedLevel });
      
      if (routeResult.complexity > 0) {
        log.debug('[Router] 复杂度={score}, 原因={reason}', {
          score: routeResult.complexity,
          reason: routeResult.reason,
        });
      }
      
      const response = await this.provider.chat(messages, tools, requestedModel, generationConfig);
      
      // 更新为实际使用的模型和级别（fallback 时可能不同）
      if (response.usedProvider && response.usedModel) {
        currentModel = `${response.usedProvider}/${response.usedModel}`;
      } else {
        currentModel = requestedModel;
      }
      // 使用实际模型的 level（fallback 后可能不同）
      currentLevel = response.usedLevel || requestedLevel;

      if (response.hasToolCalls && response.toolCalls) {
        // 添加助手消息
        messages = contextBuilder.addAssistantMessage(
          messages,
          response.content,
          response.toolCalls
        );

        // 执行工具
        for (const tc of response.toolCalls) {
          // 格式化参数显示（截断过长的值）
          const argsPreview = this.formatToolArgs(tc.arguments);
          log.info('[Tool] {model} 调用: {name}({args})', { model: currentModel, name: tc.name, args: argsPreview });
          
          const startTime = Date.now();
          const result = await this.toolRegistry.execute(
            tc.name,
            tc.arguments,
            this.createToolContext(msg)
          );
          const elapsed = Date.now() - startTime;
          
          // 判断执行结果
          const isSuccess = !result.startsWith('错误') && !result.startsWith('参数错误') && !result.startsWith('执行错误');
          const resultPreview = this.formatToolResult(result);
          
          if (isSuccess) {
            log.info('[Tool] {model} 成功: {name} ({ms}ms) → {result}', { model: currentModel, name: tc.name, ms: elapsed, result: resultPreview });
          } else {
            log.error('[Tool] {model} 失败: {name} ({ms}ms) → {result}', { model: currentModel, name: tc.name, ms: elapsed, result: resultPreview });
          }
          
          messages = contextBuilder.addToolResult(messages, tc.id, result);
        }
      } else {
        finalContent = response.content;
        break;
      }
    }

    if (!finalContent) {
      finalContent = '处理完成，但无响应内容。';
    }

    // 保存会话（用户消息保留多模态内容）
    const userContent = msg.media && msg.media.length > 0 
      ? messages[messages.length - 1].content  // 使用构建好的多模态内容
      : msg.content;
    this.sessionStore.addMessage(sessionKey, 'user', userContent);
    this.sessionStore.addMessage(sessionKey, 'assistant', finalContent);

    const replyPreview = finalContent.slice(0, 100).replace(/\n/g, ' ');
    log.info('[Reply] {model} (level={level}): {content}', { 
      model: currentModel, 
      level: currentLevel,
      content: replyPreview + (finalContent.length > 100 ? '...' : '') 
    });
    return {
      channel: msg.channel,
      chatId: msg.chatId,
      content: finalContent,
      media: [],
      metadata: msg.metadata,
    };
  }

  /**
   * 获取历史消息
   */
  private getHistory(sessionKey: SessionKey): LLMMessage[] {
    const session = this.sessionStore.get(sessionKey);
    if (!session) return [];

    return session.messages.map((m: { role: string; content: string | ContentPart[] }) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));
  }

  /**
   * 获取工具定义
   */
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

  /**
   * 创建工具上下文
   */
  private createToolContext(msg: InboundMessage): ToolContext {
    return {
      channel: msg.channel,
      chatId: msg.chatId,
      workspace: this.config.workspace,
      currentDir: msg.currentDir || this.config.workspace,
      sendToBus: async (m) => this.bus.publishOutbound(m as OutboundMessage),
    };
  }

  /**
   * 格式化工具参数（用于日志显示）
   */
  private formatToolArgs(args: Record<string, unknown>): string {
    const entries = Object.entries(args);
    if (entries.length === 0) return '';

    const parts = entries.map(([key, value]) => {
      const valueStr = this.truncateString(JSON.stringify(value), 50);
      return `${key}=${valueStr}`;
    });

    const result = parts.join(', ');
    return result.length > 200 ? result.slice(0, 200) + '...' : result;
  }

  /**
   * 格式化工具结果（用于日志显示）
   */
  private formatToolResult(result: string): string {
    return this.truncateString(result.replace(/\n/g, ' '), 150);
  }

  /**
   * 截断字符串
   */
  private truncateString(str: string, maxLength: number): string {
    if (str.length <= maxLength) return str;
    return str.slice(0, maxLength) + '...';
  }
}
