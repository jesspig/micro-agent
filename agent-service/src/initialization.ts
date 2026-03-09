/**
 * Agent Service 组件初始化
 *
 * 负责 LLM Provider、Tool Registry、Skill Registry、Orchestrator 等组件的初始化
 */

import { getLogger } from '../runtime/infrastructure/logging/logger';
import { loadConfig, type Config } from '../runtime/infrastructure/config';
import { createLLMProvider, type LLMProvider } from '../runtime/provider/llm/openai';
import { ToolRegistry } from '../runtime/capability/tool-system/registry';
import { SkillRegistry } from '../runtime/capability/skill-system/registry';
import { AgentOrchestrator, type OrchestratorConfig } from '../runtime/kernel/orchestrator';
import { getBuiltinToolProvider } from '../runtime/capability/tool-system/builtin-registry';
import { getBuiltinSkillProvider } from '../runtime/capability/skill-system/builtin-registry';
import { SessionStore } from '../runtime/infrastructure/database/session/store';
import { loadSkillFromPath } from './skill-loader';
import { existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import type { AgentServiceConfig, ServiceComponents } from './types';
import {
  USER_WORKSPACE_DIR,
  USER_KNOWLEDGE_DIR,
  USER_SKILLS_DIR,
  USER_SESSIONS_DIR,
  DEFAULT_GENERATION_CONFIG,
} from '../runtime/infrastructure/config';

const log = getLogger(['agent-service', 'initialization']);

/**
 * 加载应用配置
 */
export async function loadAppConfig(config: AgentServiceConfig): Promise<Config> {
  try {
    const appConfig = loadConfig({ workspace: config.workspace });
    log.info('配置加载成功');
    return appConfig;
  } catch (error) {
    log.error('配置加载失败，使用默认配置', { error: (error as Error).message });
    return createDefaultConfig(config);
  }
}

/**
 * 创建默认配置
 */
function createDefaultConfig(config: AgentServiceConfig): Config {
  return {
    agents: {
      workspace: config.workspace ?? USER_WORKSPACE_DIR,
      ...DEFAULT_GENERATION_CONFIG,
    },
    providers: {},
    channels: {},
    workspaces: [],
  };
}

/**
 * 初始化 LLM Provider
 */
export async function initializeLLMProvider(
  appConfig: Config,
  _config: AgentServiceConfig
): Promise<{ provider: LLMProvider; defaultModel: string }> {
  const providers = appConfig?.providers || {};
  const agentConfig = appConfig?.agents;

  // 必须配置 agents.models.chat
  const chatModelConfig = agentConfig?.models?.chat;
  if (!chatModelConfig) {
    throw new Error('未配置 agents.models.chat，请在 settings.yaml 中配置模型，格式：provider/model-id');
  }

  const slashIndex = chatModelConfig.indexOf('/');
  if (slashIndex <= 0) {
    throw new Error(`agents.models.chat 格式错误: "${chatModelConfig}"，正确格式：provider/model-id`);
  }

  const providerName = chatModelConfig.slice(0, slashIndex);
  const modelId = chatModelConfig.slice(slashIndex + 1);

  const result = tryCreateProvider(providers, providerName, agentConfig, modelId);
  if (!result) {
    throw new Error(`Provider "${providerName}" 未找到或配置无效，请检查 providers.${providerName}.baseUrl`);
  }

  return result;
}

/**
 * 尝试创建 Provider
 */
function tryCreateProvider(
  providers: Record<string, { baseUrl?: string; apiKey?: string; models?: string[] }>,
  name: string,
  agentConfig: Config['agents'],
  defaultModelId: string
): { provider: LLMProvider; defaultModel: string } | null {
  const providerConfig = providers[name];
  if (!providerConfig?.baseUrl) return null;

  const models = providerConfig.models || [];
  let modelId: string;

  // 优先使用 agents.models.chat 指定的模型
  if (defaultModelId) {
    modelId = defaultModelId;
  } else if (models.length > 0) {
    // 只有未指定时，才使用 provider.models[0]
    const firstModel = models[0];
    const modelSlashIndex = firstModel.indexOf('/');
    modelId = modelSlashIndex > 0 ? firstModel.slice(modelSlashIndex + 1) : firstModel;
  } else {
    modelId = 'gpt-4';
  }

  const provider = createLLMProvider({
    baseUrl: providerConfig.baseUrl,
    apiKey: providerConfig.apiKey,
    defaultGenerationConfig: {
      maxTokens: agentConfig?.maxTokens ?? DEFAULT_GENERATION_CONFIG.maxTokens,
      temperature: agentConfig?.temperature ?? DEFAULT_GENERATION_CONFIG.temperature,
      topK: agentConfig?.topK ?? DEFAULT_GENERATION_CONFIG.topK,
      topP: agentConfig?.topP ?? DEFAULT_GENERATION_CONFIG.topP,
      frequencyPenalty: agentConfig?.frequencyPenalty ?? DEFAULT_GENERATION_CONFIG.frequencyPenalty,
    },
  }, name);

  log.info('LLM Provider 已初始化', { provider: name, model: modelId });
  return { provider, defaultModel: modelId };
}

/**
 * 初始化 Tool Registry
 */
export async function initializeToolRegistry(config: AgentServiceConfig): Promise<ToolRegistry> {
  const toolRegistry = new ToolRegistry({ workspace: config.workspace });
  await registerBuiltinTools(toolRegistry, config);
  log.info('Tool Registry 已初始化', { toolCount: toolRegistry.size });
  return toolRegistry;
}

/**
 * 注册内置工具
 */
async function registerBuiltinTools(toolRegistry: ToolRegistry, config: AgentServiceConfig): Promise<void> {
  const provider = getBuiltinToolProvider();
  if (!provider) {
    log.info('未注册 BuiltinToolProvider，跳过内置工具加载');
    return;
  }

  // 嵌入式模式：直接获取工具实例
  const workspace = config.workspace ?? process.cwd();
  const tools = provider.getTools(workspace);
  if (tools.length > 0) {
    for (const tool of tools) {
      toolRegistry.register(tool, 'builtin');
    }
    log.info('内置工具注册完成（通过 Provider 实例）', { toolCount: toolRegistry.size });
    return;
  }

  // IPC 模式：从工具路径动态加载
  if (provider.getToolsPath) {
    const toolsPath = provider.getToolsPath();
    if (toolsPath && existsSync(toolsPath)) {
      await loadToolsFromPath(toolRegistry, toolsPath);
    }
  }
}

/**
 * 从路径加载工具模块
 */
async function loadToolsFromPath(toolRegistry: ToolRegistry, toolsPath: string): Promise<void> {
  try {
    const module = await import(toolsPath);
    const tools = module.coreTools || module.tools || [];

    for (const tool of tools) {
      if (tool && tool.name) {
        toolRegistry.register(tool, 'builtin');
      }
    }

    log.info('内置工具注册完成（从路径加载）', { toolCount: toolRegistry.size, path: toolsPath });
  } catch (error) {
    log.error('加载内置工具失败', { path: toolsPath, error: (error as Error).message });
  }
}

/**
 * 初始化 Skill Registry
 */
export function initializeSkillRegistry(config: AgentServiceConfig): SkillRegistry {
  const skillRegistry = new SkillRegistry({ workspace: config.workspace });

  // 加载内置技能
  const builtinProvider = getBuiltinSkillProvider();
  if (builtinProvider) {
    const builtinPath = builtinProvider.getSkillsPath();
    if (builtinPath) {
      loadSkillsFromDir(skillRegistry, builtinPath, 'builtin');
    }
  }

  // 加载用户技能
  loadSkillsFromDir(skillRegistry, USER_SKILLS_DIR, 'user');

  // 加载工作区技能
  if (config.workspace) {
    loadSkillsFromDir(skillRegistry, join(config.workspace, 'skills'), 'workspace');
  }

  log.info('Skill Registry 已初始化', { skillCount: skillRegistry.size });
  return skillRegistry;
}

/**
 * 从目录加载技能
 */
function loadSkillsFromDir(skillRegistry: SkillRegistry, dir: string, source: string): void {
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
      if (stats.size > 256000) continue; // 256KB 限制
    } catch {
      continue;
    }

    try {
      const skill = loadSkillFromPath(skillDir);
      if (skill) {
        skillRegistry.register(skill, source);
        log.debug('技能已加载', { name: skill.name, source });
      }
    } catch (error) {
      log.warn('加载技能失败', { name: entry.name, error: (error as Error).message });
    }
  }
}

/**
 * 初始化 Session Store
 */
export function initializeSessionStore(_config: AgentServiceConfig): SessionStore {
  // 使用 ~/.micro-agent/data 目录存储会话数据库
  const sessionStore = new SessionStore({ sessionsDir: USER_SESSIONS_DIR });
  log.info('SessionStore 已初始化', { sessionsDir: USER_SESSIONS_DIR });
  return sessionStore;
}

/**
 * 初始化 Orchestrator
 */
export function initializeOrchestrator(
  _config: AgentServiceConfig,
  components: Partial<ServiceComponents>
): AgentOrchestrator | null {
  if (!components.llmProvider || !components.toolRegistry) {
    log.warn('无法初始化 Orchestrator: 缺少 LLM Provider 或 Tool Registry');
    return null;
  }

  const knowledgeBasePath = components.knowledgeConfig?.basePath
    ?? _config.knowledgeBase
    ?? USER_KNOWLEDGE_DIR;

  const orchestratorConfig: OrchestratorConfig = {
    llmProvider: components.llmProvider,
    defaultModel: components.defaultModel ?? 'gpt-4',
    maxIterations: _config.maxIterations ?? 20,
    systemPrompt: components.systemPrompt ?? '',
    workspace: _config.workspace ?? process.cwd(),
    knowledgeBase: knowledgeBasePath,
  };

  const orchestrator = new AgentOrchestrator(
    orchestratorConfig,
    components.toolRegistry,
    components.memoryManager ?? undefined,
    components.sessionStore ?? undefined,
    components.knowledgeRetriever ?? undefined
  );

  log.info('AgentOrchestrator 已初始化');
  return orchestrator;
}

/**
 * 构建系统提示词
 */
export function buildSystemPrompt(workspace?: string): string {
  return `你是一个有帮助的 AI 助手。请用中文回复用户的问题。

当前工作目录: ${workspace ?? process.cwd()}

你可以帮助用户：
- 回答问题
- 编写代码
- 分析问题
- 提供建议

请用简洁、清晰的方式回复。`;
}