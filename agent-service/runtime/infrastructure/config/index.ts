/**
 * Config 模块入口
 *
 * Agent Service 内部配置模块，提供路径常量和配置类型定义
 */

// ============================================================
// Paths - 路径常量
// ============================================================
export {
  USER_CONFIG_DIR_NAME,
  USER_CONFIG_DIR,
  USER_DATA_DIR,
  USER_LOGS_DIR,
  USER_KNOWLEDGE_DIR,
  USER_MEMORY_DIR,
  USER_WORKSPACE_DIR,
  USER_SESSIONS_DIR,
  USER_SKILLS_DIR,
  USER_EXTENSIONS_DIR,
  KNOWLEDGE_VECTORS_PATH,
  KNOWLEDGE_FTS_DB_PATH,
  SESSIONS_DB_PATH,
  MEMORY_DB_PATH,
  TODO_STORAGE_PATH,
  MEMORY_LOGS_DIR,
} from './paths';

// ============================================================
// Defaults - 默认配置值
// ============================================================
export {
  DEFAULT_GENERATION_CONFIG,
  DEFAULT_EXECUTOR_CONFIG,
  DEFAULT_MEMORY_CONFIG,
  DEFAULT_CONTEXT_BUDGET,
} from './defaults';

// ============================================================
// Schema - 配置类型定义
// ============================================================
export {
  ConfigSchema,
  AgentConfigSchema,
  ModelsConfigSchema,
  ModelConfigSchema,
  ProviderConfigSchema,
  ChannelConfigSchema,
  WorkspaceConfigSchema,
  MemoryConfigSchema,
  ExecutorConfigSchema,
  LoopDetectionConfigSchema,
  CitationConfigSchema,
  parseModelConfigs,
  parseWorkspaces,
} from './schema';

export type {
  Config,
  AgentConfig,
  ModelsConfig,
  ModelConfig,
  ProviderConfig,
  ProviderEntry,
  WorkspaceConfig,
  MemoryConfig,
  ExecutorConfig,
  LoopDetectionConfig,
  CitationConfig,
} from './schema';

// ============================================================
// 基础配置加载功能
// ============================================================

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { parse as parseYaml } from 'yaml';
import { ConfigSchema, type Config } from './schema';
import { USER_CONFIG_DIR } from './paths';

/** 配置加载选项 */
export interface LoadConfigOptions {
  /** 工作区路径（用于查找工作区配置） */
  workspace?: string;
  /** 显式指定的配置文件路径 */
  configPath?: string;
}

/** 配置级别 */
export enum ConfigLevel {
  Builtin = 'builtin',
  User = 'user',
  Workspace = 'workspace',
}

/** 配置状态 */
export interface ConfigStatus {
  level: ConfigLevel;
  path: string;
  exists: boolean;
}

/**
 * 加载配置
 *
 * 按优先级加载配置：工作区 > 用户 > 内置默认
 */
export function loadConfig(options: LoadConfigOptions = {}): Config {
  const configPaths: Array<{ path: string; level: ConfigLevel }> = [];

  // 工作区配置
  if (options.workspace) {
    configPaths.push({
      path: join(options.workspace, 'settings.yaml'),
      level: ConfigLevel.Workspace,
    });
  }

  // 用户配置
  configPaths.push({
    path: join(USER_CONFIG_DIR, 'settings.yaml'),
    level: ConfigLevel.User,
  });

  // 查找第一个存在的配置文件
  for (const { path } of configPaths) {
    if (existsSync(path)) {
      try {
        const content = readFileSync(path, 'utf-8');
        // 使用 yaml 库解析，支持完整 YAML 语法
        const config = parseYaml(content);
        return ConfigSchema.parse(config);
      } catch (error) {
        // 配置解析失败，输出错误信息继续尝试下一个
        console.error(`配置解析失败 (${path}):`, error instanceof Error ? error.message : error);
      }
    }
  }

  // 返回内置默认配置
  return ConfigSchema.parse({
    agents: {
      workspace: options.workspace ?? USER_CONFIG_DIR,
    },
    providers: {},
    channels: {},
  });
}

/**
 * 获取配置状态
 */
export function getConfigStatus(options: LoadConfigOptions = {}): ConfigStatus[] {
  const statuses: ConfigStatus[] = [];

  if (options.workspace) {
    const workspacePath = join(options.workspace, 'settings.yaml');
    statuses.push({
      level: ConfigLevel.Workspace,
      path: workspacePath,
      exists: existsSync(workspacePath),
    });
  }

  const userPath = join(USER_CONFIG_DIR, 'settings.yaml');
  statuses.push({
    level: ConfigLevel.User,
    path: userPath,
    exists: existsSync(userPath),
  });

  return statuses;
}

/**
 * 展开路径（支持 ~ 缩写）
 */
export function expandPath(path: string): string {
  if (path.startsWith('~')) {
    return join(homedir(), path.slice(1));
  }
  return path;
}

/**
 * 创建默认用户配置
 */
export function createDefaultUserConfig(workspace?: string): Config {
  return ConfigSchema.parse({
    agents: {
      workspace: workspace ?? USER_CONFIG_DIR,
    },
    providers: {},
    channels: {},
  });
}

/**
 * 查找模板文件
 */
export function findTemplateFile(
  templateName: string,
  workspace?: string
): string | null {
  const searchPaths = [
    workspace ? join(workspace, 'templates', templateName) : null,
    join(USER_CONFIG_DIR, 'templates', templateName),
  ].filter(Boolean) as string[];

  for (const path of searchPaths) {
    if (existsSync(path)) {
      return path;
    }
  }

  return null;
}