/**
 * 配置加载器
 */

import { existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { ConfigSchema, type Config } from './schema';
import { createDefaultUserConfig, expandPath } from './workspace';
import {
  deepMerge,
  findConfigFile,
  loadConfigFile,
  buildPathChain,
  getBuiltinDefaults,
} from './utils';

/** 配置层级（优先级从低到高） */
export enum ConfigLevel {
  SYSTEM = 0,
  USER = 1,
  PROJECT = 2,
  DIRECTORY = 3,
}

/** 配置层级路径信息 */
interface ConfigPath {
  level: ConfigLevel;
  dir: string;
  settingsPath: string | null;
}

/** 用户配置目录 */
const USER_CONFIG_DIR = '~/.microbot';

/** 系统级默认目录 */
const SYSTEM_DEFAULTS_DIR = getSystemDefaultsDir();

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

  createDefaultUserConfig(SYSTEM_DEFAULTS_DIR);

  if (configPath) {
    if (existsSync(configPath)) {
      const config = loadConfigFile(configPath);
      return ConfigSchema.parse(deepMerge(loadSystemConfig(), config));
    }
    return ConfigSchema.parse(loadSystemConfig());
  }

  const configPaths = collectConfigPaths(workspace, currentDir);
  let mergedConfig = loadSystemConfig();

  for (const cp of configPaths) {
    if (cp.settingsPath && existsSync(cp.settingsPath)) {
      const layerConfig = loadConfigFile(cp.settingsPath);
      mergedConfig = deepMerge(mergedConfig, layerConfig);
    }
  }

  return ConfigSchema.parse(mergedConfig);
}

/**
 * 获取系统级默认目录
 */
function getSystemDefaultsDir(): string {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const workspaceDir = resolve(currentDir, '../../../../workspace');
  if (existsSync(workspaceDir)) return workspaceDir;
  return resolve(currentDir, '../../defaults');
}

/**
 * 获取系统级默认目录路径
 */
export function getSystemDefaultsPath(): string {
  return SYSTEM_DEFAULTS_DIR;
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
    const projectDir = resolve(workspace, '.microbot');
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
    const configDir = resolve(d, '.microbot');
    paths.push({
      level: ConfigLevel.DIRECTORY,
      dir: configDir,
      settingsPath: findConfigFile(configDir),
    });
  }

  return paths;
}

/**
 * 加载系统级默认配置
 */
function loadSystemConfig(): Record<string, unknown> {
  const systemConfigPath = resolve(SYSTEM_DEFAULTS_DIR, 'settings.yaml');

  if (!existsSync(systemConfigPath)) {
    return getBuiltinDefaults();
  }

  const config = loadConfigFile(systemConfigPath);
  
  if (Object.keys(config.providers || {}).length === 0) {
    return deepMerge(getBuiltinDefaults(), config);
  }
  
  return config;
}

// 导出工作区和模板相关函数
export {
  validateWorkspaceAccess,
  canAccessWorkspace,
  getUserConfigPath,
  createDefaultUserConfig,
  expandPath,
} from './workspace';

export {
  TEMPLATE_FILE_NAMES,
  findTemplateFile,
  loadTemplateFile,
  loadAllTemplateFiles,
} from './template';

/** 配置状态 */
export interface ConfigStatus {
  hasProviders: boolean;
  hasChannels: boolean;
  needsSetup: boolean;
}

/**
 * 检查用户配置文件是否有实际配置
 */
function checkUserConfigFile(): { hasProviders: boolean; hasChannels: boolean } {
  const userDir = expandPath(USER_CONFIG_DIR);
  const userConfigPath = findConfigFile(userDir);
  
  if (!userConfigPath || !existsSync(userConfigPath)) {
    return { hasProviders: false, hasChannels: false };
  }
  
  const config = loadConfigFile(userConfigPath);
  
  return {
    hasProviders: Object.keys(config.providers || {}).length > 0,
    hasChannels: Object.values(config.channels || {}).some(
      (ch: unknown) => ch && typeof ch === 'object' && 'enabled' in ch && (ch as { enabled?: boolean }).enabled
    ),
  };
}

/**
 * 获取配置状态
 */
export function getConfigStatus(config: Config): ConfigStatus {
  const userConfig = checkUserConfigFile();
  
  return {
    hasProviders: userConfig.hasProviders,
    hasChannels: userConfig.hasChannels,
    needsSetup: !userConfig.hasProviders && !userConfig.hasChannels,
  };
}
