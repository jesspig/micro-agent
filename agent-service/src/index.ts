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
import { SkillRegistry, type SkillDefinition } from '../runtime/capability/skill-system/registry';
import { AgentOrchestrator, type OrchestratorConfig, type StreamCallbacks } from '../runtime/kernel/orchestrator';
import { getLogger, initLogging, getTracer, subscribeToLogs, type ServiceLifecycleLog, type SessionLifecycleLog, type LLMCallLog, type ToolCallLog, type IPCMessageLog } from '../runtime/infrastructure/logging/logger';
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join, basename, resolve, dirname } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';
import matter from 'gray-matter';
// 内置工具导入
import {
  ReadFileTool,
  WriteFileTool,
  ListDirTool,
  createExecTool,
  WebFetchTool,
  MessageTool,
} from '../../extensions/tool';
import type { Tool } from '../types';
import type { InboundMessage } from '../types/message';
import {
  KnowledgeBaseManager,
  KnowledgeRetriever,
  setKnowledgeBase,
  createDocumentScanner,
  createDocumentIndexer,
  createRetriever,
  type KnowledgeBaseConfig,
  type RetrieverConfig,
} from '../runtime/capability/knowledge';
import {
  MemoryManager,
  type MemoryManagerConfig,
} from '../runtime/capability/memory/manager';
import {
  createEmbeddingService,
  type EmbeddingService,
} from '../runtime/capability/memory/embedding';

const log = getLogger(['agent-service']);
const tracer = getTracer();

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
 * 记录服务生命周期日志
 */
function logServiceLifecycle(
  event: ServiceLifecycleLog['event'],
  options?: { error?: string; mode?: 'ipc' | 'standalone' }
): void {
  const entry: ServiceLifecycleLog = {
    _type: 'service_lifecycle',
    timestamp: new Date().toISOString(),
    level: event === 'error' ? 'error' : 'info',
    category: 'agent-service',
    message: event === 'start' ? 'Agent Service 启动中...'
      : event === 'ready' ? 'Agent Service 已就绪'
      : event === 'stop' ? 'Agent Service 已停止'
      : `Agent Service 错误: ${options?.error}`,
    event,
    service: {
      version: '1.0.0',
      mode: options?.mode,
      pid: process.pid,
    },
    error: options?.error,
  };
  
  log.info('📢 服务生命周期', entry);
}

/**
 * 记录会话生命周期日志
 */
function logSessionLifecycle(
  event: SessionLifecycleLog['event'],
  sessionId: string,
  user?: { id?: string; channel?: string }
): void {
  const entry: SessionLifecycleLog = {
    _type: 'session_lifecycle',
    timestamp: new Date().toISOString(),
    level: 'info',
    category: 'session',
    message: event === 'create' ? `会话创建: ${sessionId.slice(0, 8)}`
      : event === 'destroy' ? `会话销毁: ${sessionId.slice(0, 8)}`
      : `会话${event}: ${sessionId.slice(0, 8)}`,
    event,
    sessionId,
    user,
  };
  
  log.info('📱 会话生命周期', entry);
}

/**
 * 记录 IPC 消息日志
 */
function logIPCMessage(
  direction: 'in' | 'out',
  method: string,
  options?: { requestId?: string; sessionId?: string; size?: number }
): void {
  const entry: IPCMessageLog = {
    _type: 'ipc_message',
    timestamp: new Date().toISOString(),
    level: 'debug',
    category: 'ipc',
    message: direction === 'in' ? `收到请求: ${method}` : `发送响应: ${method}`,
    direction,
    method,
    requestId: options?.requestId,
    sessionId: options?.sessionId,
    size: options?.size,
  };
  
  log.debug('📨 IPC 消息', entry);
}

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

  // 知识库组件
  private knowledgeBaseManager: KnowledgeBaseManager | null = null;
  private knowledgeRetriever: KnowledgeRetriever | null = null;
  private embeddingService: EmbeddingService | null = null;
  private knowledgeConfig: KnowledgeBaseConfig | null = null;
  
  // 记忆系统组件
  private memoryManager: MemoryManager | null = null;
  
  // 技能系统组件
  private skillRegistry: SkillRegistry | null = null;
  
  // 编排器组件
  private orchestrator: AgentOrchestrator | null = null;
  
  // 技能配置
  private skillConfigs: Array<{
    name: string;
    description?: string;
    enabled?: boolean;
    path?: string;
    always?: boolean;
    allowedTools?: string[];
  }> = [];

  constructor(config: Partial<AgentServiceConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.isIPCMode = process.env.BUN_IPC === '1' || !!process.send;
  }

  async start(): Promise<void> {
    if (this.running) {
      log.info('Agent Service 已在运行');
      return;
    }

    // 初始化日志系统
    await initLogging({
      console: true,
      file: true,
      level: this.config.logLevel ?? 'info',
    });

    logServiceLifecycle('start', { mode: this.isIPCMode ? 'ipc' : 'standalone' });

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
    logServiceLifecycle('ready', { mode: this.isIPCMode ? 'ipc' : 'standalone' });
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
      log.error('配置加载失败，使用默认配置', { error: (error as Error).message });
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
    this.initializeLLMProvider();
    this.initializeToolRegistry();
    this.initializeSkillRegistry();
    this.initializeOrchestrator();
    this.systemPrompt = this.buildSystemPrompt();
  }
  
  /**
   * 初始化 Orchestrator
   */
  private initializeOrchestrator(): void {
    if (!this.llmProvider || !this.toolRegistry) {
      log.warn('无法初始化 Orchestrator: 缺少 LLM Provider 或 Tool Registry');
      return;
    }

    const orchestratorConfig: OrchestratorConfig = {
      llmProvider: this.llmProvider,
      defaultModel: this.defaultModel,
      maxIterations: 5,
      systemPrompt: this.systemPrompt,
      workspace: this.config.workspace ?? process.cwd(),
    };

    this.orchestrator = new AgentOrchestrator(
      orchestratorConfig,
      this.toolRegistry,
      this.memoryManager ?? undefined,
      undefined, // SessionStore 可选
      this.knowledgeRetriever ?? undefined
    );

    log.info('AgentOrchestrator 已初始化');
  }

  /**
   * 更新 Orchestrator（在组件配置变更后调用）
   */
  private updateOrchestrator(): void {
    if (!this.llmProvider || !this.toolRegistry) {
      log.warn('无法更新 Orchestrator: 缺少必要组件');
      return;
    }

    const orchestratorConfig: OrchestratorConfig = {
      llmProvider: this.llmProvider,
      defaultModel: this.defaultModel,
      maxIterations: 5,
      systemPrompt: this.systemPrompt,
      workspace: this.config.workspace ?? process.cwd(),
    };

    this.orchestrator = new AgentOrchestrator(
      orchestratorConfig,
      this.toolRegistry,
      this.memoryManager ?? undefined,
      undefined, // SessionStore 可选
      this.knowledgeRetriever ?? undefined
    );

    log.info('Orchestrator 已更新', {
      hasMemory: !!this.memoryManager,
      hasKnowledge: !!this.knowledgeRetriever,
    });
  }
  
  /**
   * 获取内置技能路径
   */
  private getBuiltinSkillsPath(): string {
    const currentDir = dirname(fileURLToPath(import.meta.url));
    // 从 agent-service/src 向上到达项目根目录，然后进入 extensions/skills
    return resolve(currentDir, '../../../extensions/skills');
  }
  
  /**
   * 初始化 Skill Registry
   */
  private initializeSkillRegistry(): void {
    this.skillRegistry = new SkillRegistry({
      workspace: this.config.workspace,
    });
    
    // 加载内置技能
    this.loadBuiltinSkills();
    
    // 加载用户技能
    this.loadUserSkills();
    
    // 加载工作区技能
    this.loadWorkspaceSkills();

    log.info('Skill Registry 已初始化', { skillCount: this.skillRegistry.size });
  }
  
  /**
   * 加载内置技能
   */
  private loadBuiltinSkills(): void {
    const builtinPath = this.getBuiltinSkillsPath();
    this.loadSkillsFromDir(builtinPath, 'builtin');
  }
  
  /**
   * 加载用户技能
   */
  private loadUserSkills(): void {
    const userSkillsPath = resolve(homedir(), '.micro-agent/skills');
    this.loadSkillsFromDir(userSkillsPath, 'user');
  }
  
  /**
   * 加载工作区技能
   */
  private loadWorkspaceSkills(): void {
    if (!this.config.workspace) return;
    const projectSkillsPath = join(this.config.workspace, 'skills');
    this.loadSkillsFromDir(projectSkillsPath, 'workspace');
  }
  
  /**
   * 从目录加载技能
   */
  private loadSkillsFromDir(dir: string, source: string): void {
    if (!existsSync(dir)) return;
    
    const entries = readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      
      const skillDir = join(dir, entry.name);
      const skillMdPath = join(skillDir, 'SKILL.md');
      
      if (!existsSync(skillMdPath)) continue;
      
      // 检查文件大小
      try {
        const stats = statSync(skillMdPath);
        if (stats.size > 256000) { // 256KB 限制
          continue;
        }
      } catch {
        continue;
      }
      
      try {
        const skill = this.parseSkill(skillMdPath, skillDir);
        this.skillRegistry?.register(skill, source);
        log.debug('技能已加载', { name: skill.name, source });
      } catch (error) {
        log.warn('加载技能失败', { name: entry.name, error: (error as Error).message });
      }
    }
  }
  
  /**
   * 解析技能文件
   */
  private parseSkill(path: string, skillDir: string): SkillDefinition {
    const fileContent = readFileSync(path, 'utf-8');
    const { data, content } = matter(fileContent);
    
    // 提取场景关键词
    const scenarios = this.extractScenarios(data, content);
    
    return {
      name: data.name ?? basename(skillDir),
      description: data.description ?? '',
      scenarios,
      tools: data['allowed-tools'] ?? [],
      promptTemplate: content.trim(),
    };
  }
  
  /**
   * 从技能内容提取场景关键词
   */
  private extractScenarios(data: Record<string, unknown>, content: string): string[] {
    const scenarios: string[] = [];
    
    // 从名称推断场景
    if (data.name && typeof data.name === 'string') {
      scenarios.push(data.name);
    }
    
    // 从描述推断场景关键词
    if (data.description && typeof data.description === 'string') {
      const keywords = data.description.toLowerCase().match(/\b[a-z\u4e00-\u9fa5]+\b/g);
      if (keywords) {
        scenarios.push(...keywords.slice(0, 5));
      }
    }
    
    // 从内容标题推断场景
    const headings = content.match(/^##\s+(.+)$/gm);
    if (headings) {
      for (const h of headings.slice(0, 3)) {
        const title = h.replace(/^##\s+/, '').toLowerCase();
        scenarios.push(title);
      }
    }
    
    return [...new Set(scenarios)];
  }

  /**
   * 初始化 LLM Provider
   */
  private initializeLLMProvider(): void {
    const providers = this.appConfig?.providers || {};
    const agentConfig = this.appConfig?.agents;

    const chatModelConfig = agentConfig?.models?.chat || '';
    const slashIndex = chatModelConfig.indexOf('/');
    const defaultProviderName = slashIndex > 0 ? chatModelConfig.slice(0, slashIndex) : null;
    const defaultModelId = slashIndex > 0 ? chatModelConfig.slice(slashIndex + 1) : chatModelConfig;

    if (defaultProviderName) {
      const providerConfig = providers[defaultProviderName];
      if (providerConfig?.baseUrl) {
        this.defaultModel = defaultModelId;
        
        this.llmProvider = new OpenAICompatibleProvider({
          baseUrl: providerConfig.baseUrl,
          apiKey: providerConfig.apiKey,
          defaultModel: defaultModelId,
          defaultGenerationConfig: {
            maxTokens: agentConfig?.maxTokens ?? 512,
            temperature: agentConfig?.temperature ?? 0.7,
            topK: agentConfig?.topK ?? 50,
            topP: agentConfig?.topP ?? 0.7,
            frequencyPenalty: agentConfig?.frequencyPenalty ?? 0.5,
          },
        }, defaultProviderName);

        log.info('LLM Provider 已初始化', { 
          _type: 'llm_call',
          provider: defaultProviderName, 
          model: defaultModelId,
          success: true,
        });
        return;
      }
    }

    // 回退：查找第一个可用的 provider
    for (const [name, providerConfig] of Object.entries(providers)) {
      if (providerConfig.baseUrl) {
        const models = providerConfig.models || [];
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

        log.info('LLM Provider 已初始化（回退）', { provider: name, model: modelId });
        return;
      }
    }

    log.info('未配置 LLM Provider，使用模拟响应模式');
  }

  /**
   * 初始化 Tool Registry
   */
  private initializeToolRegistry(): void {
    this.toolRegistry = new ToolRegistry({
      workspace: this.config.workspace,
    });

    this.registerBuiltinTools();

    log.info('Tool Registry 已初始化', { toolCount: this.toolRegistry.size });
  }

  /**
   * 注册内置工具
   */
  private registerBuiltinTools(): void {
    if (!this.toolRegistry) return;

    // 注册文件系统工具
    this.toolRegistry.register(ReadFileTool, 'builtin');
    this.toolRegistry.register(WriteFileTool, 'builtin');
    this.toolRegistry.register(ListDirTool, 'builtin');

    // 注册 Shell 工具（需要工作目录）
    this.toolRegistry.register(
      createExecTool(this.config.workspace ?? process.cwd()),
      'builtin'
    );

    // 注册 Web 工具
    this.toolRegistry.register(WebFetchTool, 'builtin');

    // 注册消息工具
    this.toolRegistry.register(MessageTool, 'builtin');

    log.info('内置工具注册完成', { toolCount: this.toolRegistry.size });
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

    logIPCMessage('in', method, { requestId: id });

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
            logIPCMessage('out', 'execute', { requestId: id });
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

        // 配置相关方法
        case 'config.update':
          this.handleConfigUpdate(params, id);
          break;

        case 'config.setSystemPrompt':
          this.handleSetSystemPrompt(params, id);
          break;

        case 'config.registerTools':
          this.handleRegisterTools(params, id);
          break;

        case 'config.loadSkills':
          this.handleLoadSkills(params, id);
          break;

        case 'config.configureMemory':
          this.handleConfigureMemory(params, id).catch((error) => {
            process.send?.({
              jsonrpc: '2.0',
              id,
              error: { code: -32004, message: error.message },
            });
          });
          break;

        case 'config.configureKnowledge':
          this.handleConfigureKnowledge(params, id).catch((error) => {
            process.send?.({
              jsonrpc: '2.0',
              id,
              error: { code: -32003, message: error.message },
            });
          });
          break;

        case 'config.reload':
          this.handleConfigReload(id);
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

    const shutdown = async () => {
      logServiceLifecycle('stop');
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

    logSessionLifecycle('create', sessionId);

    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, { messages: [] });
    }
    const session = this.sessions.get(sessionId)!;
    session.messages.push({ role: 'user', content: content.text });

    // 如果 Orchestrator 已初始化，使用它进行流式处理
    if (this.orchestrator) {
      try {
        await this.streamWithOrchestrator(sessionId, content.text, requestId);
        return;
      } catch (error) {
        log.error('Orchestrator 处理失败', { error: (error as Error).message });
        // 回退到旧的流式处理
      }
    }

    // 回退：直接使用 LLM Provider
    if (this.llmProvider) {
      try {
        await this.streamFromLLM(session, content.text, requestId);
        return;
      } catch (error) {
        log.error('LLM 调用失败', { error: (error as Error).message });
      }
    }

    await this.streamMockResponse(content.text, requestId);
  }

  /**
   * 使用 Orchestrator 进行流式处理
   */
  private async streamWithOrchestrator(
    sessionId: string,
    userMessage: string,
    requestId: string
  ): Promise<void> {
    if (!this.orchestrator) return;

    // 构建入站消息
    const msg: InboundMessage = {
      channel: 'ipc',
      senderId: requestId,
      chatId: sessionId,
      content: userMessage,
      timestamp: new Date(),
      media: [],
      metadata: {},
    };

    // 构建流式回调
    const callbacks: StreamCallbacks = {
      onChunk: async (chunk: string) => {
        process.send?.({
          jsonrpc: '2.0',
          id: requestId,
          method: 'stream',
          params: { delta: chunk, done: false },
        });
      },
      onComplete: async () => {
        process.send?.({
          jsonrpc: '2.0',
          id: requestId,
          method: 'stream',
          params: { done: true },
        });
      },
      onError: async (error: Error) => {
        log.error('流式处理错误', { error: error.message });
        process.send?.({
          jsonrpc: '2.0',
          id: requestId,
          error: { code: -32005, message: error.message },
        });
      },
    };

    // 更新 Orchestrator 的系统提示词（包含技能上下文）
    const skillContext = this.buildSkillContext(userMessage);
    const updatedSystemPrompt = this.systemPrompt + skillContext;
    
    // 重新初始化 Orchestrator 以使用更新后的系统提示词
    if (this.llmProvider && this.toolRegistry) {
      const orchestratorConfig: OrchestratorConfig = {
        llmProvider: this.llmProvider,
        defaultModel: this.defaultModel,
        maxIterations: 5,
        systemPrompt: updatedSystemPrompt,
        workspace: this.config.workspace ?? process.cwd(),
      };

      const updatedOrchestrator = new AgentOrchestrator(
        orchestratorConfig,
        this.toolRegistry,
        this.memoryManager ?? undefined,
        undefined,
        this.knowledgeRetriever ?? undefined
      );

      await updatedOrchestrator.processMessageStream(msg, callbacks, {
        currentDir: this.config.workspace,
      });
    } else {
      await this.orchestrator.processMessageStream(msg, callbacks, {
        currentDir: this.config.workspace,
      });
    }

    log.info('Orchestrator 流式处理完成', { sessionId });
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

    const startTime = Date.now();

    // 构建包含技能上下文的系统提示词
    const skillContext = this.buildSkillContext(userMessage);
    const systemPromptWithSkills = this.systemPrompt + skillContext;

    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: systemPromptWithSkills },
    ];

    const recentMessages = session.messages.slice(-10);
    for (const msg of recentMessages) {
      messages.push({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      });
    }

    const tools = this.toolRegistry?.getDefinitions() || [];

    try {
      const response = await this.llmProvider.chat(messages, tools.length > 0 ? tools : undefined);
      const elapsed = Date.now() - startTime;

      // 记录 LLM 调用
      tracer.logLLMCall(
        this.defaultModel,
        this.llmProvider.name,
        messages.length,
        tools.length,
        elapsed,
        true,
        undefined,
        undefined,
        response.content?.slice(0, 100),
        response.hasToolCalls
      );

      if (response.hasToolCalls && response.toolCalls && this.toolRegistry) {
        await this.handleToolCalls(response.toolCalls, messages, requestId);
        return;
      }

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
    } catch (error) {
      const elapsed = Date.now() - startTime;
      tracer.logLLMCall(
        this.defaultModel,
        this.llmProvider.name,
        messages.length,
        tools.length,
        elapsed,
        false,
        undefined,
        error instanceof Error ? error.message : String(error)
      );
      throw error;
    }
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

    messages.push({
      role: 'assistant',
      content: '',
    });

    for (const tc of toolCalls) {
      const startTime = Date.now();
      
      try {
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
        const elapsed = Date.now() - startTime;

        tracer.logToolCall(tc.name, tc.arguments, resultContent, elapsed, true);

        messages.push({
          role: 'user' as const,
          content: `工具 ${tc.name} 结果: ${resultContent}`,
        });
      } catch (error) {
        const elapsed = Date.now() - startTime;
        tracer.logToolCall(
          tc.name, 
          tc.arguments, 
          '', 
          elapsed, 
          false, 
          error instanceof Error ? error.message : String(error)
        );
        throw error;
      }
    }

    const finalResponse = await this.llmProvider.chat(messages);
    const fullContent = finalResponse.content || '';

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

    logSessionLifecycle('create', sessionId);

    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, { messages: [] });
    }
    const session = this.sessions.get(sessionId)!;
    session.messages.push({ role: 'user', content: content.text });

    if (this.llmProvider) {
      try {
        // 构建包含技能上下文的系统提示词
        const skillContext = this.buildSkillContext(content.text);
        const systemPromptWithSkills = this.systemPrompt + skillContext;

        const messages = [
          { role: 'system' as const, content: systemPromptWithSkills },
          { role: 'user' as const, content: content.text },
        ];
        const response = await this.llmProvider.chat(messages);
        
        sendChunk({ delta: response.content || '', done: false });
        sendChunk({ done: true });
        session.messages.push({ role: 'assistant', content: response.content || '' });
        return;
      } catch (error) {
        log.error('LLM 调用失败', { error: (error as Error).message });
      }
    }

    const response = `收到消息: "${content.text}"。Agent Service 正在运行。`;
    sendChunk({ delta: response, done: false });
    sendChunk({ done: true });
    session.messages.push({ role: 'assistant', content: response });
  }

  /**
   * 处理配置重载
   */
  private handleConfigReload(requestId: string): void {
    log.info('正在重新加载配置...');

    try {
      // 重新加载配置
      this.appConfig = loadConfig({
        workspace: this.config.workspace,
      });
      log.info('配置已重新加载');

      // 重新初始化 LLM Provider
      this.llmProvider = null;
      this.defaultModel = '';
      this.initializeLLMProvider();

      // 更新 Orchestrator
      if (this.orchestrator && this.llmProvider) {
        this.updateOrchestrator();
        log.info('Orchestrator 已更新');
      } else if (!this.llmProvider) {
        log.warn('无法更新 Orchestrator: LLM Provider 未初始化');
      }

      process.send?.({
        jsonrpc: '2.0',
        id: requestId,
        result: { 
          success: true, 
          hasProvider: !!this.llmProvider,
          defaultModel: this.defaultModel,
        },
      });
    } catch (error) {
      log.error('配置重载失败', { error: (error as Error).message });
      process.send?.({
        jsonrpc: '2.0',
        id: requestId,
        error: { code: -32005, message: (error as Error).message },
      });
    }
  }

  /**
   * 处理配置更新
   */
  private handleConfigUpdate(params: unknown, requestId: string): void {
    const { config } = params as { config: Record<string, unknown> };
    
    if (config.workspace) {
      this.config.workspace = config.workspace as string;
    }
    if (config.systemPrompt) {
      this.systemPrompt = config.systemPrompt as string;
    }
    if (config.models) {
      // 更新模型配置
      log.info('模型配置已更新', { models: config.models });
    }
    
    process.send?.({
      jsonrpc: '2.0',
      id: requestId,
      result: { success: true },
    });
    
    log.info('配置已更新', { keys: Object.keys(config) });
  }

  /**
   * 处理设置系统提示词
   */
  private handleSetSystemPrompt(params: unknown, requestId: string): void {
    const { prompt } = params as { prompt: string };
    
    this.systemPrompt = prompt;
    
    process.send?.({
      jsonrpc: '2.0',
      id: requestId,
      result: { success: true },
    });
    
    log.info('系统提示词已设置', { length: prompt.length });
  }

  /**
   * 处理注册工具
   */
  private handleRegisterTools(params: unknown, requestId: string): void {
    const { tools } = params as { tools: Array<{
      name: string;
      description?: string;
      enabled?: boolean;
      inputSchema?: Record<string, unknown>;
      metadata?: Record<string, unknown>;
    }> };
    
    if (!this.toolRegistry) {
      process.send?.({
        jsonrpc: '2.0',
        id: requestId,
        error: { code: -32002, message: 'Tool Registry 未初始化' },
      });
      return;
    }
    
    const registeredTools: string[] = [];
    const skippedTools: string[] = [];
    
    for (const toolConfig of tools) {
      // 跳过禁用的工具
      if (toolConfig.enabled === false) {
        skippedTools.push(toolConfig.name);
        continue;
      }
      
      // 检查工具是否已存在
      if (this.toolRegistry.has(toolConfig.name)) {
        log.debug('工具已存在，跳过注册', { name: toolConfig.name });
        registeredTools.push(toolConfig.name);
        continue;
      }
      
      // 动态创建工具
      try {
        const dynamicTool = this.createDynamicTool(toolConfig);
        if (dynamicTool) {
          this.toolRegistry.register(dynamicTool, 'dynamic');
          registeredTools.push(toolConfig.name);
          log.info('动态工具已注册', { 
            name: toolConfig.name, 
            description: toolConfig.description 
          });
        } else {
          skippedTools.push(toolConfig.name);
          log.warn('无法创建动态工具', { name: toolConfig.name });
        }
      } catch (error) {
        skippedTools.push(toolConfig.name);
        log.error('动态工具注册失败', { 
          name: toolConfig.name, 
          error: (error as Error).message 
        });
      }
    }
    
    process.send?.({
      jsonrpc: '2.0',
      id: requestId,
      result: { 
        success: true, 
        count: registeredTools.length,
        tools: registeredTools,
        skipped: skippedTools,
        totalInRegistry: this.toolRegistry.size,
      },
    });
    
    log.info('工具注册完成', { 
      registered: registeredTools.length, 
      skipped: skippedTools.length,
      totalInRegistry: this.toolRegistry.size,
    });
  }
  
  /**
   * 创建动态工具
   */
  private createDynamicTool(config: {
    name: string;
    description?: string;
    inputSchema?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }): Tool | null {
    // 如果没有 inputSchema，使用默认的空 schema
    const schema = config.inputSchema ?? {
      type: 'object',
      properties: {},
    };
    
    return {
      name: config.name,
      description: config.description ?? `动态工具: ${config.name}`,
      inputSchema: schema as any,
      execute: async (input: unknown, ctx: ToolContext) => {
        // 动态工具的默认执行逻辑：记录并返回
        log.debug('执行动态工具', { 
          name: config.name, 
          input: JSON.stringify(input).slice(0, 200) 
        });
        
        return {
          content: [{
            type: 'text' as const,
            text: `动态工具 ${config.name} 已收到请求。此工具需要具体实现。`,
          }],
        };
      },
    };
  }

  /**
   * 处理加载技能
   */
  private handleLoadSkills(params: unknown, requestId: string): void {
    const { skills } = params as { skills: Array<{
      name: string;
      description?: string;
      enabled?: boolean;
      path?: string;
      always?: boolean;
      allowedTools?: string[];
    }> };
    
    // 如果 SkillRegistry 未初始化，先初始化
    if (!this.skillRegistry) {
      this.initializeSkillRegistry();
    }
    
    // 存储技能配置并注册启用的技能
    const loadedSkills: string[] = [];
    const matchedSkills: Array<{ name: string; source: string }> = [];
    
    for (const skillConfig of skills) {
      if (skillConfig.enabled !== false) {
        // 存储配置
        this.skillConfigs.push(skillConfig);
        loadedSkills.push(skillConfig.name);
        
        // 检查 SkillRegistry 中是否已有此技能
        if (this.skillRegistry?.has(skillConfig.name)) {
          matchedSkills.push({ name: skillConfig.name, source: 'registry' });
        } else if (skillConfig.path) {
          // 如果提供了路径，尝试从路径加载
          try {
            const skill = this.loadSkillFromPath(skillConfig.path, skillConfig.name, skillConfig.description);
            if (skill) {
              this.skillRegistry?.register(skill, 'dynamic');
              matchedSkills.push({ name: skillConfig.name, source: 'dynamic' });
            }
          } catch (error) {
            log.warn('动态加载技能失败', { 
              name: skillConfig.name, 
              path: skillConfig.path, 
              error: (error as Error).message 
            });
          }
        }
        
        log.info('技能配置已记录', { 
          name: skillConfig.name, 
          description: skillConfig.description, 
          path: skillConfig.path,
          always: skillConfig.always 
        });
      }
    }
    
    process.send?.({
      jsonrpc: '2.0',
      id: requestId,
      result: { 
        success: true, 
        count: loadedSkills.length,
        skills: loadedSkills,
        totalInRegistry: this.skillRegistry?.size ?? 0,
      },
    });
    
    log.info('技能加载完成', { 
      count: loadedSkills.length, 
      totalInRegistry: this.skillRegistry?.size ?? 0 
    });
  }
  
  /**
   * 从路径加载技能
   */
  private loadSkillFromPath(
    skillPath: string, 
    name: string, 
    description?: string
  ): SkillDefinition | null {
    const skillMdPath = join(skillPath, 'SKILL.md');
    
    if (!existsSync(skillMdPath)) {
      log.warn('技能文件不存在', { path: skillMdPath });
      return null;
    }
    
    try {
      return this.parseSkill(skillMdPath, skillPath);
    } catch (error) {
      log.error('解析技能文件失败', { path: skillMdPath, error: (error as Error).message });
      return null;
    }
  }
  
  /**
   * 根据场景匹配技能
   */
  private matchSkillsByScenario(scenario: string): Array<{ skill: SkillDefinition; score: number; reason: string }> {
    if (!this.skillRegistry) return [];
    return this.skillRegistry.matchByScenario(scenario);
  }
  
  /**
   * 构建技能上下文提示
   */
  private buildSkillContext(userMessage: string): string {
    if (!this.skillRegistry || this.skillRegistry.size === 0) return '';
    
    // 匹配相关技能
    const matches = this.matchSkillsByScenario(userMessage);
    
    if (matches.length === 0) return '';
    
    // 取前3个最相关的技能
    const topMatches = matches.slice(0, 3);
    
    const skillContexts = topMatches.map(m => {
      const skill = m.skill;
      let context = `### 技能: ${skill.name}\n${skill.description}\n`;
      if (skill.promptTemplate) {
        context += `\n${skill.promptTemplate.slice(0, 500)}...\n`;
      }
      return context;
    });
    
    return `\n\n# 相关技能\n\n${skillContexts.join('\n---\n\n')}\n`;
  }

  /**
   * 处理配置记忆系统
   */
  private async handleConfigureMemory(params: unknown, requestId: string): Promise<void> {
    const { config } = params as { config: {
      enabled?: boolean;
      storagePath?: string;
      embedModel?: string;
      embedBaseUrl?: string;
      embedApiKey?: string;
      mode?: string;
      searchLimit?: number;
      autoSummarize?: boolean;
      summarizeThreshold?: number;
    } };
    
    // 记忆系统未启用
    if (config.enabled === false) {
      this.memoryManager = null;
      process.send?.({
        jsonrpc: '2.0',
        id: requestId,
        result: { 
          success: true, 
          config: { enabled: false },
        },
      });
      log.info('记忆系统已禁用');
      return;
    }

    try {
      // 确定存储路径
      const storagePath = config.storagePath ?? join(homedir(), '.micro-agent', 'memory');
      
      // 创建嵌入服务（如果提供了配置）
      let embeddingService: EmbeddingService | undefined;
      if (config.embedModel && config.embedBaseUrl && config.embedApiKey) {
        const slashIndex = config.embedModel.indexOf('/');
        const modelId = slashIndex > 0 ? config.embedModel.slice(slashIndex + 1) : config.embedModel;
        
        embeddingService = createEmbeddingService(
          modelId,
          config.embedBaseUrl,
          config.embedApiKey
        );
        
        // 同时存储到实例变量供知识库等复用
        this.embeddingService = embeddingService;
        
        log.info('记忆系统嵌入服务已创建', { 
          model: config.embedModel, 
          available: embeddingService.isAvailable() 
        });
      }

      // 创建记忆管理器配置
      const memoryConfig: MemoryManagerConfig = {
        storagePath,
        enabled: true,
        autoSummarize: config.autoSummarize ?? true,
        summarizeThreshold: config.summarizeThreshold ?? 20,
        searchLimit: config.searchLimit ?? 10,
        embedding: embeddingService && config.embedBaseUrl && config.embedApiKey ? {
          modelId: config.embedModel?.split('/').pop() ?? config.embedModel ?? '',
          baseUrl: config.embedBaseUrl,
          apiKey: config.embedApiKey,
        } : undefined,
        llmProvider: this.llmProvider ?? undefined,
      };

      // 创建并初始化记忆管理器
      this.memoryManager = new MemoryManager(memoryConfig);
      await this.memoryManager.initialize();

      // 获取统计信息
      const stats = await this.memoryManager.getStats();
      
      process.send?.({
        jsonrpc: '2.0',
        id: requestId,
        result: { 
          success: true, 
          config: {
            enabled: true,
            mode: config.mode ?? 'auto',
            embedModel: config.embedModel,
            storagePath,
          },
          stats: {
            totalEntries: stats.totalEntries,
            totalSessions: stats.totalSessions,
            hasEmbedding: embeddingService?.isAvailable() ?? false,
          },
        },
      });
      
      log.info('记忆系统初始化完成', { 
        storagePath,
        totalEntries: stats.totalEntries,
        hasEmbedding: embeddingService?.isAvailable() ?? false,
      });
      
      // 更新 Orchestrator 以使用新的 MemoryManager
      this.updateOrchestrator();
    } catch (error) {
      log.error('记忆系统初始化失败', { error: (error as Error).message });
      
      process.send?.({
        jsonrpc: '2.0',
        id: requestId,
        error: { 
          code: -32004, 
          message: `记忆系统初始化失败: ${(error as Error).message}` 
        },
      });
    }
  }

  /**
   * 处理配置知识库
   */
  private async handleConfigureKnowledge(params: unknown, requestId: string): Promise<void> {
    const { config } = params as { config: {
      enabled?: boolean;
      basePath?: string;
      embedModel?: string;
      chunkSize?: number;
      chunkOverlap?: number;
      maxSearchResults?: number;
      minSimilarityScore?: number;
      backgroundBuild?: {
        enabled?: boolean;
        interval?: number;
        batchSize?: number;
        idleDelay?: number;
      };
      // 嵌入服务配置
      embedBaseUrl?: string;
      embedApiKey?: string;
    } };

    // 知识库未启用
    if (config.enabled === false) {
      this.knowledgeBaseManager = null;
      this.knowledgeRetriever = null;
      this.knowledgeConfig = null;
      process.send?.({
        jsonrpc: '2.0',
        id: requestId,
        result: { 
          success: true, 
          config: { enabled: false },
        },
      });
      log.info('知识库已禁用');
      return;
    }

    try {
      // 构建知识库配置
      const knowledgeConfig: KnowledgeBaseConfig = {
        basePath: config.basePath ?? join(homedir(), '.micro-agent', 'knowledge'),
        embedModel: config.embedModel,
        chunkSize: config.chunkSize ?? 1000,
        chunkOverlap: config.chunkOverlap ?? 200,
        maxSearchResults: config.maxSearchResults ?? 5,
        minSimilarityScore: config.minSimilarityScore ?? 0.6,
        backgroundBuild: {
          enabled: config.backgroundBuild?.enabled ?? true,
          interval: config.backgroundBuild?.interval ?? 60000,
          batchSize: config.backgroundBuild?.batchSize ?? 3,
          idleDelay: config.backgroundBuild?.idleDelay ?? 5000,
        },
      };

      // 复用或创建嵌入服务
      // 优先复用已有的嵌入服务（来自记忆系统初始化）
      let effectiveEmbeddingService = this.embeddingService;
      
      // 如果提供了新的嵌入服务配置，检查是否需要创建新服务
      if (config.embedModel && config.embedBaseUrl && config.embedApiKey) {
        const needsNewService = !this.embeddingService || !this.embeddingService.isAvailable();
        
        if (needsNewService) {
          const slashIndex = config.embedModel.indexOf('/');
          const modelId = slashIndex > 0 ? config.embedModel.slice(slashIndex + 1) : config.embedModel;
          
          this.embeddingService = createEmbeddingService(
            modelId,
            config.embedBaseUrl,
            config.embedApiKey
          );
          effectiveEmbeddingService = this.embeddingService;
          
          log.info('知识库嵌入服务已创建', { 
            model: config.embedModel, 
            available: this.embeddingService.isAvailable() 
          });
        } else {
          log.info('复用已有嵌入服务', { 
            available: this.embeddingService.isAvailable() 
          });
        }
      }

      // 创建知识库管理器
      this.knowledgeBaseManager = new KnowledgeBaseManager(
        knowledgeConfig,
        effectiveEmbeddingService ?? undefined
      );

      // 初始化知识库（加载数据库和索引）
      await this.knowledgeBaseManager.initialize();

      // 设置全局实例
      setKnowledgeBase(this.knowledgeBaseManager);

      // 扫描文档目录
      const scanner = createDocumentScanner(
        this.knowledgeBaseManager.getDocumentMap(),
        knowledgeConfig.basePath,
        (type, doc) => {
          log.debug('文档变更', { type, path: doc.path });
        }
      );

      await scanner.scanDocuments();

      // 创建索引构建器并处理待索引文档
      const indexer = createDocumentIndexer(
        {
          chunkSize: knowledgeConfig.chunkSize,
          chunkOverlap: knowledgeConfig.chunkOverlap,
        },
        this.embeddingService ?? undefined,
        (doc, chunkCount) => {
          log.info('文档索引完成', { path: doc.path, chunkCount });
        },
        (doc, error) => {
          log.error('文档索引失败', { path: doc.path, error: String(error) });
        }
      );

      // 处理待索引文档
      const pendingDocs = this.knowledgeBaseManager.getDocuments()
        .filter(d => d.status === 'pending');
      
      for (const doc of pendingDocs) {
        await indexer.buildDocumentIndex(doc);
        this.knowledgeBaseManager.setDocument(doc.path, doc);
      }

      // 存储配置
      this.knowledgeConfig = knowledgeConfig;

      // 创建知识库检索器
      const retrieverConfig: RetrieverConfig = {
        maxResults: knowledgeConfig.maxSearchResults,
        minScore: knowledgeConfig.minSimilarityScore,
      };
      
      this.knowledgeRetriever = createRetriever(
        this.knowledgeBaseManager.getDocumentMap(),
        effectiveEmbeddingService ?? undefined,
        retrieverConfig
      );
      
      log.info('知识库检索器已创建', {
        maxResults: retrieverConfig.maxResults,
        minScore: retrieverConfig.minScore,
        hasEmbedding: effectiveEmbeddingService?.isAvailable() ?? false,
      });

      const stats = this.knowledgeBaseManager.getStats();
      
      process.send?.({
        jsonrpc: '2.0',
        id: requestId,
        result: { 
          success: true, 
          config: {
            enabled: true,
            basePath: knowledgeConfig.basePath,
            embedModel: knowledgeConfig.embedModel,
          },
          stats: {
            totalDocuments: stats.totalDocuments,
            indexedDocuments: stats.indexedDocuments,
            pendingDocuments: stats.pendingDocuments,
            hasRetriever: this.knowledgeRetriever !== null,
          },
        },
      });
      
      log.info('知识库初始化完成', { 
        basePath: knowledgeConfig.basePath,
        totalDocs: stats.totalDocuments,
        indexedDocs: stats.indexedDocuments,
        hasEmbedding: this.embeddingService?.isAvailable() ?? false,
      });
      
      // 更新 Orchestrator 以使用新的 KnowledgeRetriever
      this.updateOrchestrator();
    } catch (error) {
      log.error('知识库初始化失败', { error: (error as Error).message });
      
      process.send?.({
        jsonrpc: '2.0',
        id: requestId,
        error: { 
          code: -32003, 
          message: `知识库初始化失败: ${(error as Error).message}` 
        },
      });
    }
  }

  stop(): void {
    this.running = false;
    this.sessions.clear();
    logServiceLifecycle('stop');
  }
}

// 启动服务
async function main(): Promise<void> {
  const service = new AgentServiceImpl({
    logLevel: process.env.LOG_LEVEL as 'debug' | 'info' | 'warn' | undefined,
  });

  try {
    await service.start();

    if (!process.env.BUN_IPC) {
      await new Promise(() => {});
    }
  } catch (error) {
    console.error('启动失败:', error);
    process.exit(1);
  }
}

if (import.meta.main) {
  main();
}

export { AgentServiceImpl };