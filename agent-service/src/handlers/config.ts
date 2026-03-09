/**
 * 配置处理器
 *
 * 处理配置更新、工具注册、技能加载等配置相关的 IPC 消息
 */

import { getLogger } from '../../runtime/infrastructure/logging/logger';
import { existsSync } from 'fs';
import type { AgentServiceConfig, ServiceComponents, SkillConfig } from '../types';
import type { SkillDefinition } from '../../runtime/capability/skill-system/registry';

const log = getLogger(['agent-service', 'handlers', 'config']);

/**
 * 处理配置更新
 */
export function handleConfigUpdate(
  params: unknown,
  requestId: string,
  config: AgentServiceConfig,
  components: ServiceComponents,
  updateOrchestrator: () => void
): void {
  const { config: newConfig } = params as { config: Record<string, unknown> };

  let needsOrchestratorUpdate = false;

  if (newConfig.workspace) {
    config.workspace = newConfig.workspace as string;
    needsOrchestratorUpdate = true;
  }
  if (newConfig.systemPrompt) {
    components.systemPrompt = newConfig.systemPrompt as string;
  }
  if (newConfig.models) {
    log.info('模型配置已更新', { models: newConfig.models });
  }

  if (needsOrchestratorUpdate) {
    updateOrchestrator();
  }

  process.send?.({
    jsonrpc: '2.0',
    id: requestId,
    result: { success: true },
  });

  log.info('配置已更新', { keys: Object.keys(newConfig) });
}

/**
 * 处理设置系统提示词
 */
export function handleSetSystemPrompt(
  params: unknown,
  requestId: string,
  components: ServiceComponents
): void {
  const { prompt } = params as { prompt: string };

  components.systemPrompt = prompt;

  process.send?.({
    jsonrpc: '2.0',
    id: requestId,
    result: { success: true },
  });

  log.info('系统提示词已设置', { length: prompt.length });
}

/**
 * 处理配置重载
 */
export function handleConfigReload(
  requestId: string,
  components: ServiceComponents,
  _config: AgentServiceConfig,
  reloadConfig: () => Promise<void>,
  updateOrchestrator: () => void
): void {
  log.info('正在重新加载配置...');

  try {
    reloadConfig().then(() => {
      if (components.orchestrator && components.llmProvider) {
        updateOrchestrator();
        log.info('Orchestrator 已更新');
      } else if (!components.llmProvider) {
        log.warn('无法更新 Orchestrator: LLM Provider 未初始化');
      }

      process.send?.({
        jsonrpc: '2.0',
        id: requestId,
        result: {
          success: true,
          hasProvider: !!components.llmProvider,
          defaultModel: components.defaultModel,
        },
      });
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
 * 处理注册工具
 */
export async function handleRegisterTools(
  params: unknown,
  requestId: string,
  components: ServiceComponents,
  loadToolsFromPath: (path: string) => Promise<void>
): Promise<void> {
  const { tools, toolsPath } = params as {
    tools?: Array<{
      name: string;
      description?: string;
      enabled?: boolean;
      inputSchema?: Record<string, unknown>;
      metadata?: Record<string, unknown>;
    }>;
    toolsPath?: string;
  };

  if (!components.toolRegistry) {
    process.send?.({
      jsonrpc: '2.0',
      id: requestId,
      error: { code: -32002, message: 'Tool Registry 未初始化' },
    });
    return;
  }

  // IPC 模式：从工具路径动态加载
  if (toolsPath && existsSync(toolsPath)) {
    await loadToolsFromPath(toolsPath);

    process.send?.({
      jsonrpc: '2.0',
      id: requestId,
      result: {
        success: true,
        count: components.toolRegistry.size,
        loadedFromPath: toolsPath,
      },
    });

    log.info('工具注册完成（从路径加载）', {
      toolCount: components.toolRegistry.size,
      path: toolsPath
    });
    return;
  }

  // 确认模式：检查已注册工具
  const registeredTools: string[] = [];
  const skippedTools: string[] = [];

  if (tools) {
    for (const toolConfig of tools) {
      if (toolConfig.enabled === false) {
        skippedTools.push(toolConfig.name);
        continue;
      }

      if (components.toolRegistry.has(toolConfig.name)) {
        registeredTools.push(toolConfig.name);
        continue;
      }

      skippedTools.push(toolConfig.name);
      log.warn('工具未注册', { name: toolConfig.name });
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
      totalInRegistry: components.toolRegistry.size,
    },
  });

  log.info('工具注册完成', {
    registered: registeredTools.length,
    skipped: skippedTools.length,
    totalInRegistry: components.toolRegistry.size,
  });
}

/**
 * 处理加载技能
 */
export function handleLoadSkills(
  params: unknown,
  requestId: string,
  components: ServiceComponents,
  skillConfigs: SkillConfig[],
  loadSkillFromPath: (path: string, name: string, description?: string) => SkillDefinition | null
): void {
  const { skills } = params as { skills: SkillConfig[] };

  // 如果 SkillRegistry 未初始化，记录警告
  if (!components.skillRegistry) {
    process.send?.({
      jsonrpc: '2.0',
      id: requestId,
      error: { code: -32002, message: 'Skill Registry 未初始化' },
    });
    return;
  }

  const loadedSkills: string[] = [];

  for (const skillConfig of skills) {
    if (skillConfig.enabled !== false) {
      skillConfigs.push(skillConfig);
      loadedSkills.push(skillConfig.name);

      if (components.skillRegistry.has(skillConfig.name)) {
        // 已存在于注册表中
      } else if (skillConfig.path) {
        try {
          const skill = loadSkillFromPath(skillConfig.path, skillConfig.name, skillConfig.description);
          if (skill) {
            components.skillRegistry.register(skill, 'dynamic');
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
      totalInRegistry: components.skillRegistry?.size ?? 0,
    },
  });

  log.info('技能加载完成', {
    count: loadedSkills.length,
    totalInRegistry: components.skillRegistry?.size ?? 0
  });
}
