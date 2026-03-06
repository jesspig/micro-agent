#!/usr/bin/env bun

/**
 * Agent Service 入口
 *
 * 纯 Agent 运行时服务，支持两种通信模式：
 * 1. IPC 模式：作为 CLI 子进程运行，通过 process.send/on('message') 通信
 * 2. 独立模式：作为独立服务运行，通过 TCP/Unix Socket 通信
 */

import { loadConfig, type Config } from '@micro-agent/config';
import { OpenAICompatibleProvider, type LLMProvider } from '../runtime/provider/llm/openai';
import { ToolRegistry, type ToolContext } from '../runtime/capability/tool-system/registry';

const log = {
  info: (msg: string, data?: Record<string, unknown>) =>
    console.log(`[AgentService] ${msg}`, data ? JSON.stringify(data) : ''),
  error: (msg: string, error?: Error) =>
    console.error(`[AgentService] ${msg}`, error?.message ?? ''),
  debug: (msg: string, data?: Record<string, unknown>) =>
    process.env.LOG_LEVEL === 'debug' && console.log(`[AgentService] ${msg}`, data ? JSON.stringify(data) : ''),
};

/** Agent Service 配置 */
interface AgentServiceConfig {
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
  workspace?: string;
}

/** 默认配置 */
const DEFAULT_CONFIG: AgentServiceConfig = {
  logLevel: 'info',
  workspace: process.cwd(),
};

/**
 * Agent Service 实现
 */
class AgentServiceImpl {
  private config: AgentServiceConfig;
  private appConfig: Config | null = null;
  private running = false;
  private sessions = new Map<string, { messages: Array<{ role: string; content: string }> }>();
  private isIPCMode = false;
  
  // 核心组件
  private llmProvider: LLMProvider | null = null;
  private toolRegistry: ToolRegistry | null = null;
  private defaultModel: string = 'gpt-4';
  private systemPrompt: string = '你是一个有帮助的 AI 助手。';

  constructor(config: Partial<AgentServiceConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.isIPCMode = process.env.BUN_IPC === '1' || !!process.send;
  }

  async start(): Promise<void> {
    if (this.running) {
      log.info('Agent Service 已在运行');
      return;
    }

    log.info('Agent Service 启动中...', {
      workspace: this.config.workspace,
      mode: this.isIPCMode ? 'IPC' : '独立'
    });

    // 加载配置
    await this.loadAppConfig();

    // 初始化组件
    this.initializeComponents();

    if (this.isIPCMode) {
      this.startIPCMode();
    } else {
      await this.startStandaloneMode();
    }

    this.running = true;
    log.info('Agent Service 已启动');
  }

  /**
   * 加载应用配置
   */
  private async loadAppConfig(): Promise<void> {
    try {
      this.appConfig = loadConfig({
        workspace: this.config.workspace,
      });
      log.info('配置加载成功');
    } catch (error) {
      log.error('配置加载失败，使用默认配置', error as Error);
      // 使用默认配置
      this.appConfig = {
        agents: {
          workspace: this.config.workspace ?? '~/.micro-agent/workspace',
          maxTokens: 512,
          temperature: 0.7,
          topK: 50,
          topP: 0.7,
          frequencyPenalty: 0.5,
        },
        providers: {},
        channels: {},
        workspaces: [],
      };
    }
  }

  /**
   * 初始化组件
   */
  private initializeComponents(): void {
    if (!this.appConfig) return;

    // 初始化 LLM Provider
    this.initializeLLMProvider();

    // 初始化 Tool Registry
    this.initializeToolRegistry();

    // 设置系统提示词
    this.systemPrompt = this.buildSystemPrompt();
  }

  /**
   * 初始化 LLM Provider
   */
  private initializeLLMProvider(): void {
    const providers = this.appConfig?.providers || {};
    const agentConfig = this.appConfig?.agents;

    // 解析默认模型信息
    const chatModelConfig = agentConfig?.models?.chat || '';
    const slashIndex = chatModelConfig.indexOf('/');
    const defaultProviderName = slashIndex > 0 ? chatModelConfig.slice(0, slashIndex) : null;
    const defaultModelId = slashIndex > 0 ? chatModelConfig.slice(slashIndex + 1) : chatModelConfig;

    // 如果指定了 provider 名称，优先使用该 provider
    if (defaultProviderName) {
      const providerConfig = providers[defaultProviderName];
      if (providerConfig?.baseUrl) {
        this.defaultModel = defaultModelId;
        
        this.llmProvider = new OpenAICompatibleProvider({
          baseUrl: providerConfig.baseUrl,
          apiKey: providerConfig.apiKey,  // 可选，Ollama 等本地 provider 不需要
          defaultModel: defaultModelId,
          defaultGenerationConfig: {
            maxTokens: agentConfig?.maxTokens ?? 512,
            temperature: agentConfig?.temperature ?? 0.7,
            topK: agentConfig?.topK ?? 50,
            topP: agentConfig?.topP ?? 0.7,
            frequencyPenalty: agentConfig?.frequencyPenalty ?? 0.5,
          },
        }, defaultProviderName);

        log.info(`LLM Provider 已初始化: ${defaultProviderName}, 默认模型: ${defaultModelId}`);
        return;
      } else {
        log.info(`配置的 provider "${defaultProviderName}" 未找到或缺少 baseUrl`);
      }
    }

    // 回退：查找第一个可用的 provider
    for (const [name, providerConfig] of Object.entries(providers)) {
      if (providerConfig.baseUrl) {
        // 获取模型列表
        const models = providerConfig.models || [];
        
        // 确定要使用的模型 ID
        let modelId: string;
        if (models.length > 0) {
          const firstModel = models[0];
          const modelSlashIndex = firstModel.indexOf('/');
          modelId = modelSlashIndex > 0 ? firstModel.slice(modelSlashIndex + 1) : firstModel;
        } else {
          modelId = defaultModelId || 'gpt-4';
        }
        
        this.defaultModel = modelId;

        this.llmProvider = new OpenAICompatibleProvider({
          baseUrl: providerConfig.baseUrl,
          apiKey: providerConfig.apiKey,
          defaultModel: modelId,
          defaultGenerationConfig: {
            maxTokens: agentConfig?.maxTokens ?? 512,
            temperature: agentConfig?.temperature ?? 0.7,
            topK: agentConfig?.topK ?? 50,
            topP: agentConfig?.topP ?? 0.7,
            frequencyPenalty: agentConfig?.frequencyPenalty ?? 0.5,
          },
        }, name);

        log.info(`LLM Provider 已初始化（回退）: ${name}, 默认模型: ${modelId}`);
        return;
      }
    }

    // 没有配置 provider，使用模拟模式
    log.info('未配置 LLM Provider，使用模拟响应模式');
  }

  /**
   * 初始化 Tool Registry
   */
  private initializeToolRegistry(): void {
    this.toolRegistry = new ToolRegistry({
      workspace: this.config.workspace,
    });

    // 注册内置工具
    this.registerBuiltinTools();

    log.info(`Tool Registry 已初始化，已注册 ${this.toolRegistry.size} 个工具`);
  }

  /**
   * 注册内置工具
   */
  private registerBuiltinTools(): void {
    if (!this.toolRegistry) return;

    // TODO: 注册更多内置工具
    // 当前只有基础框架，后续可以注册文件操作、搜索等工具
  }

  /**
   * 构建系统提示词
   */
  private buildSystemPrompt(): string {
    return `你是一个有帮助的 AI 助手。请用中文回复用户的问题。

当前工作目录: ${this.config.workspace}

你可以帮助用户：
- 回答问题
- 编写代码
- 分析问题
- 提供建议

请用简洁、清晰的方式回复。`;
  }

  /**
   * IPC 模式启动
   */
  private startIPCMode(): void {
    process.on('message', (message: unknown) => {
      this.handleIPCMessage(message);
    });

    process.on('disconnect', () => {
      log.info('父进程断开连接');
      this.stop();
    });

    // 发送就绪信号
    process.send?.({ type: 'ready', jsonrpc: '2.0' });
  }

  /**
   * 处理 IPC 消息
   */
  private handleIPCMessage(message: unknown): void {
    const request = typeof message === 'string' ? JSON.parse(message) : message;
    const { id, method, params } = request;

    try {
      switch (method) {
        case 'ping':
          process.send?.({ jsonrpc: '2.0', id, result: { pong: true } });
          break;

        case 'status':
          process.send?.({
            jsonrpc: '2.0',
            id,
            result: this.getStatus(),
          });
          break;

        case 'execute':
          this.execute(params).then((result) => {
            process.send?.({ jsonrpc: '2.0', id, result });
          }).catch((error) => {
            process.send?.({
              jsonrpc: '2.0',
              id,
              error: { code: -32001, message: error.message },
            });
          });
          break;

        case 'chat':
          this.handleChatStream(params, id);
          break;

        default:
          process.send?.({
            jsonrpc: '2.0',
            id,
            error: { code: -32601, message: 'Method not found' },
          });
      }
    } catch (error) {
      process.send?.({
        jsonrpc: '2.0',
        id,
        error: { code: -32603, message: 'Internal error' },
      });
    }
  }

  /**
   * 独立模式启动
   */
  private async startStandaloneMode(): Promise<void> {
    const { createIPCServer } = await import('../interface/ipc');

    const ipcConfig = {
      type: process.platform === 'win32' ? 'tcp-loopback' : 'unix-socket' as const,
      path: '/tmp/micro-agent.sock',
      port: 3927,
    };

    const ipcServer = await createIPCServer(ipcConfig, {
      emit: () => {},
      on: () => {},
    } as any);

    // 注册方法处理器
    if ('registerMethod' in ipcServer) {
      ipcServer.registerMethod('ping', async () => ({ pong: true }));
      ipcServer.registerMethod('status', async () => this.getStatus());
      ipcServer.registerMethod('execute', async (params) => this.execute(params));
    }

    if ('registerStreamMethod' in ipcServer) {
      ipcServer.registerStreamMethod('chat', async (params, context) => {
        await this.handleChatStreamToCallback(params, context.sendChunk);
      });
    }

    await ipcServer.start();

    // 信号处理
    const shutdown = async () => {
      console.log('\n正在关闭...');
      await ipcServer.stop();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  }

  /**
   * 获取状态
   */
  private getStatus(): Record<string, unknown> {
    return {
      version: '1.0.0',
      uptime: Math.floor(process.uptime()),
      activeSessions: this.sessions.size,
      provider: this.llmProvider ? {
        name: this.llmProvider.name,
        model: this.defaultModel,
      } : null,
      tools: this.toolRegistry?.size ?? 0,
    };
  }

  /**
   * 执行任务
   */
  private async execute(params: unknown): Promise<unknown> {
    const { sessionId, content } = params as {
      sessionId: string;
      content: { type: string; text: string };
    };

    // 如果有 LLM Provider，调用真实 LLM
    if (this.llmProvider) {
      const messages = [
        { role: 'system' as const, content: this.systemPrompt },
        { role: 'user' as const, content: content.text },
      ];

      const response = await this.llmProvider.chat(messages);
      return {
        sessionId,
        content: response.content,
        done: true,
      };
    }

    // 模拟响应
    return {
      sessionId,
      content: `执行结果: ${content.text}`,
      done: true,
    };
  }

  /**
   * 处理流式聊天（IPC 模式）
   */
  private async handleChatStream(params: unknown, requestId: string): Promise<void> {
    const { sessionId, content } = params as {
      sessionId: string;
      content: { type: string; text: string };
    };

    // 存储会话
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, { messages: [] });
    }
    const session = this.sessions.get(sessionId)!;
    session.messages.push({ role: 'user', content: content.text });

    // 如果有 LLM Provider，调用真实 LLM
    if (this.llmProvider) {
      try {
        await this.streamFromLLM(session, content.text, requestId);
        return;
      } catch (error) {
        log.error('LLM 调用失败', error as Error);
        // 回退到模拟响应
      }
    }

    // 模拟流式响应
    await this.streamMockResponse(content.text, requestId);
  }

  /**
   * 从 LLM 获取流式响应
   */
  private async streamFromLLM(
    session: { messages: Array<{ role: string; content: string }> },
    userMessage: string,
    requestId: string
  ): Promise<void> {
    if (!this.llmProvider) return;

    // 构建消息历史
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: this.systemPrompt },
    ];

    // 添加历史消息（最近 10 条）
    const recentMessages = session.messages.slice(-10);
    for (const msg of recentMessages) {
      messages.push({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      });
    }

    // 获取工具定义
    const tools = this.toolRegistry?.getDefinitions() || [];

    // 调用 LLM（非流式，因为我们自己的流式层在 IPC 上）
    const response = await this.llmProvider.chat(messages, tools.length > 0 ? tools : undefined);

    // 检查是否有工具调用
    if (response.hasToolCalls && response.toolCalls && this.toolRegistry) {
      // 处理工具调用
      await this.handleToolCalls(response.toolCalls, messages, requestId);
      return;
    }

    // 流式发送响应
    const fullContent = response.content || '';
    for (let i = 0; i < fullContent.length; i += 20) {
      const chunk = fullContent.slice(i, i + 20);
      process.send?.({
        jsonrpc: '2.0',
        id: requestId,
        method: 'stream',
        params: { delta: chunk, done: false },
      });
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    process.send?.({
      jsonrpc: '2.0',
      id: requestId,
      method: 'stream',
      params: { done: true },
    });

    session.messages.push({ role: 'assistant', content: fullContent });
  }

  /**
   * 处理工具调用
   */
  private async handleToolCalls(
    toolCalls: Array<{ id: string; name: string; arguments: Record<string, unknown> }>,
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    requestId: string
  ): Promise<void> {
    if (!this.toolRegistry || !this.llmProvider) return;

    // 添加助手消息（带工具调用）
    messages.push({
      role: 'assistant',
      content: '',
    });

    // 执行工具
    for (const tc of toolCalls) {
      const toolContext: ToolContext = {
        channel: 'ipc',
        chatId: requestId,
        workspace: this.config.workspace ?? process.cwd(),
        currentDir: this.config.workspace ?? process.cwd(),
        sendToBus: async () => {},
      };

      const result = await this.toolRegistry.execute(tc.name, tc.arguments, toolContext);
      const resultContent = typeof result.content === 'string' 
        ? result.content 
        : JSON.stringify(result.content);

      messages.push({
        role: 'user' as const,
        content: `工具 ${tc.name} 结果: ${resultContent}`,
      });
    }

    // 再次调用 LLM 获取最终响应
    const finalResponse = await this.llmProvider.chat(messages);
    const fullContent = finalResponse.content || '';

    // 流式发送响应
    for (let i = 0; i < fullContent.length; i += 20) {
      const chunk = fullContent.slice(i, i + 20);
      process.send?.({
        jsonrpc: '2.0',
        id: requestId,
        method: 'stream',
        params: { delta: chunk, done: false },
      });
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    process.send?.({
      jsonrpc: '2.0',
      id: requestId,
      method: 'stream',
      params: { done: true },
    });
  }

  /**
   * 模拟流式响应
   */
  private async streamMockResponse(userMessage: string, requestId: string): Promise<void> {
    const response = `收到消息: "${userMessage}"。Agent Service 正在运行。`;

    for (let i = 0; i < response.length; i += 10) {
      const chunk = response.slice(i, i + 10);
      process.send?.({
        jsonrpc: '2.0',
        id: requestId,
        method: 'stream',
        params: { delta: chunk, done: false },
      });
      await new Promise((resolve) => setTimeout(resolve, 20));
    }

    process.send?.({
      jsonrpc: '2.0',
      id: requestId,
      method: 'stream',
      params: { done: true },
    });
  }

  /**
   * 处理流式聊天（独立模式回调）
   */
  private async handleChatStreamToCallback(
    params: unknown,
    sendChunk: (chunk: { delta?: string; done: boolean }) => void
  ): Promise<void> {
    const { sessionId, content } = params as {
      sessionId: string;
      content: { type: string; text: string };
    };

    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, { messages: [] });
    }
    const session = this.sessions.get(sessionId)!;
    session.messages.push({ role: 'user', content: content.text });

    // 如果有 LLM Provider
    if (this.llmProvider) {
      try {
        const messages = [
          { role: 'system' as const, content: this.systemPrompt },
          { role: 'user' as const, content: content.text },
        ];
        const response = await this.llmProvider.chat(messages);
        
        sendChunk({ delta: response.content || '', done: false });
        sendChunk({ done: true });
        session.messages.push({ role: 'assistant', content: response.content || '' });
        return;
      } catch (error) {
        log.error('LLM 调用失败', error as Error);
      }
    }

    // 模拟响应
    const response = `收到消息: "${content.text}"。Agent Service 正在运行。`;
    sendChunk({ delta: response, done: false });
    sendChunk({ done: true });
    session.messages.push({ role: 'assistant', content: response });
  }

  stop(): void {
    this.running = false;
    this.sessions.clear();
    log.info('Agent Service 已停止');
  }
}

// 启动服务
async function main(): Promise<void> {
  const service = new AgentServiceImpl({
    logLevel: process.env.LOG_LEVEL as 'debug' | 'info' | 'warn' | undefined,
  });

  try {
    await service.start();

    // IPC 模式不需要保持运行，等待父进程消息
    // 独立模式需要保持运行
    if (!process.env.BUN_IPC) {
      await new Promise(() => {});
    }
  } catch (error) {
    console.error('启动失败:', error);
    process.exit(1);
  }
}

// 入口
if (import.meta.main) {
  main();
}

export { AgentServiceImpl };
