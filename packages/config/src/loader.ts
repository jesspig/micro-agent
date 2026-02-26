/**
 * 配置加载器
 */

import { existsSync } from 'fs';
import { resolve } from 'path';
import { ConfigSchema, type Config } from './schema';
import { expandPath } from './workspace';
import {
  deepMerge,
  findConfigFile,
  loadConfigFile,
  buildPathChain,
  getBuiltinDefaults,
} from './utils';

/** 配置层级（优先级从低到高） */
export enum ConfigLevel {
  USER = 0,
  PROJECT = 1,
  DIRECTORY = 2,
}

/** 配置层级路径信息 */
interface ConfigPath {
  level: ConfigLevel;
  dir: string;
  settingsPath: string | null;
}

/** 用户配置目录 */
const USER_CONFIG_DIR = '~/.micro-agent';

/** 配置加载选项 */
export interface LoadConfigOptions {
  configPath?: string;
  workspace?: string;
  currentDir?: string;
}

/**
 * 加载配置
 */
export function loadConfig(options: LoadConfigOptions = {}): Config {
  const { configPath, workspace, currentDir } = options;

  // 指定配置文件路径
  if (configPath) {
    if (existsSync(configPath)) {
      const config = loadConfigFile(configPath);
      return ConfigSchema.parse(deepMerge(getBuiltinDefaults(), config));
    }
    return ConfigSchema.parse(getBuiltinDefaults());
  }

  // 三级配置合并
  const configPaths = collectConfigPaths(workspace, currentDir);
  let mergedConfig = getBuiltinDefaults();

  for (const cp of configPaths) {
    if (cp.settingsPath && existsSync(cp.settingsPath)) {
      const layerConfig = loadConfigFile(cp.settingsPath);
      mergedConfig = deepMerge(mergedConfig, layerConfig);
    }
  }

  return ConfigSchema.parse(mergedConfig);
}

/**
 * 收集配置路径（按优先级排序）
 */
function collectConfigPaths(workspace?: string, currentDir?: string): ConfigPath[] {
  const paths: ConfigPath[] = [];

  // 用户级
  const userDir = expandPath(USER_CONFIG_DIR);
  paths.push({
    level: ConfigLevel.USER,
    dir: userDir,
    settingsPath: findConfigFile(userDir),
  });

  // 项目级
  if (workspace) {
    const projectDir = resolve(workspace, '.micro-agent');
    paths.push({
      level: ConfigLevel.PROJECT,
      dir: projectDir,
      settingsPath: findConfigFile(projectDir),
    });
  }

  // 目录级（向上递归查找）
  if (currentDir && workspace) {
    const dirConfigs = collectDirectoryConfigs(workspace, currentDir);
    paths.push(...dirConfigs);
  }

  return paths;
}

/**
 * 收集目录级配置路径
 */
function collectDirectoryConfigs(workspace: string, currentDir: string): ConfigPath[] {
  const paths: ConfigPath[] = [];
  const normalizedCurrent = resolve(currentDir);
  const normalizedWorkspace = resolve(workspace);

  if (!normalizedCurrent.startsWith(normalizedWorkspace)) return paths;

  const pathChain = buildPathChain(normalizedWorkspace, normalizedCurrent);
  pathChain.reverse();

  for (const d of pathChain) {
    const configDir = resolve(d, '.micro-agent');
    paths.push({
      level: ConfigLevel.DIRECTORY,
      dir: configDir,
      settingsPath: findConfigFile(configDir),
    });
  }

  return paths;
}

/** 配置状态 */
export interface ConfigStatus {
  /** 是否有可用的 provider */
  hasProviders: boolean;
  /** 是否有启用的 channel */
  hasChannels: boolean;
  /** 是否配置了 chat 模型 */
  hasChatModel: boolean;
  /** 缺失的必填项 */
  missingRequired: string[];
  /** 是否需要设置（向后兼容） */
  needsSetup: boolean;
}

/**
 * 获取配置状态
 */
export function getConfigStatus(config: Config): ConfigStatus {
  const missingRequired: string[] = [];
  
  // 检查 chat 模型
  const hasChatModel = Boolean(config.agents?.models?.chat);
  if (!hasChatModel) {
    missingRequired.push('agents.models.chat');
  }
  
  // 检查 provider
  const hasProviders = Object.keys(config.providers || {}).length > 0;
  if (!hasProviders) {
    missingRequired.push('providers');
  }
  
  // 检查 channel
  const hasChannels = Object.values(config.channels || {}).some(
    (ch: unknown) => ch && typeof ch === 'object' && 'enabled' in ch && (ch as { enabled?: boolean }).enabled
  );
  
  return {
    hasProviders,
    hasChannels,
    hasChatModel,
    missingRequired,
    needsSetup: missingRequired.length > 0,
  };
}
