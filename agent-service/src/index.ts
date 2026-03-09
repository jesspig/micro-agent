#!/usr/bin/env bun

/**
 * Agent Service 入口
 *
 * 纯 Agent 运行时服务，支持两种通信模式：
 * 1. IPC 模式：作为 CLI 子进程运行，通过 process.send/on('message') 通信
 * 2. 独立模式：作为独立服务运行，通过 TCP/Unix Socket 通信
 */

import { getLogger, initLogging } from '../runtime/infrastructure/logging/logger';
import { logServiceLifecycle } from './logger';
import {
  loadAppConfig,
  initializeLLMProvider,
  initializeToolRegistry,
  initializeSkillRegistry,
  initializeOrchestrator,
  initializeSessionStore,
  buildSystemPrompt,
} from './initialization';
import {
  SessionManager,
  handleStatus,
  handleExecute,
  handleChatStream,
  handleConfigUpdate,
  handleSetSystemPrompt,
  handleRegisterTools,
  handleLoadSkills,
  handleConfigureKnowledge,
  handleConfigureMemory,
  startStandaloneMode,
} from './handlers';
import { loadSkillFromPath } from './skill-loader';
import type { AgentServiceConfig, ServiceComponents, SkillConfig } from './types';
import { USER_KNOWLEDGE_DIR, DEFAULT_EXECUTOR_CONFIG } from '../runtime/infrastructure/config';

const log = getLogger(['agent-service']);

/** 默认配置 */
const DEFAULT_CONFIG: AgentServiceConfig = {
  logLevel: 'info',
  workspace: process.cwd(),
  knowledgeBase: USER_KNOWLEDGE_DIR,
  maxIterations: DEFAULT_EXECUTOR_CONFIG.maxIterations,
};

/**
 * Agent Service 实现
 */
class AgentServiceImpl {
  private config: AgentServiceConfig;
  private running = false;
  private isIPCMode = false;
  private sessionManager = new SessionManager();

  // 服务组件
  private components: ServiceComponents = {
    appConfig: null,
    llmProvider: null,
    toolRegistry: null,
    skillRegistry: null,
    orchestrator: null,
    memoryManager: null,
    knowledgeBaseManager: null,
    knowledgeRetriever: null,
    embeddingService: null,
    knowledgeConfig: null,
    sessionStore: null,
    defaultModel: 'gpt-4',
    systemPrompt: '',
  };

  private skillConfigs: SkillConfig[] = [];

  constructor(config: Partial<AgentServiceConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.isIPCMode = process.env.BUN_IPC === '1' || !!process.send;
  }

  async start(): Promise<void> {
    if (this.running) {
      log.info('Agent Service 已在运行');
      return;
    }

    await initLogging({
      console: true,
      file: true,
      level: this.config.logLevel ?? 'info',
    });

    logServiceLifecycle('start', { mode: this.isIPCMode ? 'ipc' : 'standalone' });
    await this.initializeComponents();

    if (this.isIPCMode) {
      this.startIPCMode();
    } else {
      await this.startStandaloneMode();
    }

    this.running = true;
    logServiceLifecycle('ready', { mode: this.isIPCMode ? 'ipc' : 'standalone' });
  }

  private async initializeComponents(): Promise<void> {
    this.components.appConfig = await loadAppConfig(this.config);

    const { provider, defaultModel } = await initializeLLMProvider(this.components.appConfig, this.config);
    this.components.llmProvider = provider;
    this.components.defaultModel = defaultModel;

    this.components.toolRegistry = await initializeToolRegistry(this.config);
    this.components.skillRegistry = initializeSkillRegistry(this.config);
    this.components.systemPrompt = buildSystemPrompt(this.config.workspace);
    this.components.sessionStore = initializeSessionStore(this.config);
    this.components.orchestrator = initializeOrchestrator(this.config, this.components);
  }

  private updateOrchestrator(): void {
    this.components.orchestrator = initializeOrchestrator(this.config, this.components);
    log.info('Orchestrator 已更新', {
      hasMemory: !!this.components.memoryManager,
      hasKnowledge: !!this.components.knowledgeRetriever,
    });
  }

  private startIPCMode(): void {
    process.on('message', (message: unknown) => this.handleIPCMessage(message));
    process.on('disconnect', () => {
      log.info('父进程断开连接');
      this.stop();
    });
    process.send?.({ type: 'ready', jsonrpc: '2.0' });
  }

  private handleIPCMessage(message: unknown): void {
    const request = typeof message === 'string' ? JSON.parse(message) : message;
    const { id, method, params } = request;

    try {
      switch (method) {
        case 'ping':
          process.send?.({ jsonrpc: '2.0', id, result: { pong: true } });
          break;

        case 'status':
          process.send?.({ jsonrpc: '2.0', id, result: handleStatus(this.components, this.sessionManager) });
          break;

        case 'execute':
          handleExecute(params, this.components, this.config)
            .then((result) => process.send?.({ jsonrpc: '2.0', id, result }))
            .catch((error) => process.send?.({ jsonrpc: '2.0', id, error: { code: -32001, message: error.message } }));
          break;

        case 'chat':
          handleChatStream(params, id, this.components, this.config, this.sessionManager.sessions);
          break;

        case 'config.update':
          handleConfigUpdate(params, id, this.config, this.components, () => this.updateOrchestrator());
          break;

        case 'config.setSystemPrompt':
          handleSetSystemPrompt(params, id, this.components);
          break;

        case 'config.registerTools':
          handleRegisterTools(params, id, this.components, (path) => this.loadToolsFromPath(path));
          break;

        case 'config.loadSkills':
          handleLoadSkills(params, id, this.components, this.skillConfigs, (path, name, desc) => loadSkillFromPath(path, name, desc));
          break;

        case 'config.configureMemory':
          this.handleConfigureMemory(params, id);
          break;

        case 'config.configureKnowledge':
          this.handleConfigureKnowledge(params, id);
          break;

        case 'config.reload':
          this.handleConfigReload(id);
          break;

        default:
          process.send?.({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found' } });
      }
    } catch (error) {
      process.send?.({ jsonrpc: '2.0', id, error: { code: -32603, message: 'Internal error' } });
    }
  }

  private async handleConfigReload(requestId: string): Promise<void> {
    log.info('正在重新加载配置...');

    try {
      this.components.appConfig = await loadAppConfig(this.config);
      const { provider, defaultModel } = await initializeLLMProvider(this.components.appConfig, this.config);
      this.components.llmProvider = provider;
      this.components.defaultModel = defaultModel;
      this.updateOrchestrator();

      process.send?.({
        jsonrpc: '2.0',
        id: requestId,
        result: { success: true, hasProvider: !!this.components.llmProvider, defaultModel: this.components.defaultModel },
      });
    } catch (error) {
      log.error('配置重载失败', { error: (error as Error).message });
      process.send?.({ jsonrpc: '2.0', id: requestId, error: { code: -32005, message: (error as Error).message } });
    }
  }

  private async handleConfigureMemory(params: unknown, requestId: string): Promise<void> {
    const { config } = params as { config: Record<string, unknown> };
    await handleConfigureMemory({ config }, requestId, config, this.components, () => this.updateOrchestrator());
  }

  private async handleConfigureKnowledge(params: unknown, requestId: string): Promise<void> {
    const { config } = params as { config: Record<string, unknown> };
    const { createEmbeddingService } = await import('../runtime/capability/memory');
    await handleConfigureKnowledge(
      { config },
      requestId,
      config,
      this.components,
      (model, baseUrl, apiKey) => createEmbeddingService(model, baseUrl, apiKey),
      () => this.updateOrchestrator()
    );
  }

  private async loadToolsFromPath(toolsPath: string): Promise<void> {
    if (!this.components.toolRegistry) return;

    try {
      const module = await import(toolsPath);
      const tools = module.coreTools || module.tools || [];

      for (const tool of tools) {
        if (tool && tool.name) {
          this.components.toolRegistry.register(tool, 'builtin');
        }
      }

      log.info('工具加载完成', { toolCount: this.components.toolRegistry.size, path: toolsPath });
    } catch (error) {
      log.error('加载工具失败', { path: toolsPath, error: (error as Error).message });
    }
  }

  private async startStandaloneMode(): Promise<void> {
    const ipcConfig = {
      type: (process.platform === 'win32' ? 'tcp-loopback' : 'unix-socket') as 'tcp-loopback' | 'unix-socket',
      path: '/tmp/micro-agent.sock',
      port: 3927,
    };

    const server = await startStandaloneMode(this.components, this.sessionManager, ipcConfig, this.config.workspace);

    const shutdown = async () => {
      logServiceLifecycle('stop');
      await server.stop();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  }

  stop(): void {
    this.running = false;
    this.sessionManager.clear();
    logServiceLifecycle('stop');
  }
}

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
