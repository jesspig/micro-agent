/**
 * 配置加载器
 */

import { readFileSync, existsSync } from 'fs';
import { load } from 'js-yaml';
import { resolve, dirname, basename } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';
import { ConfigSchema, type Config } from './schema';

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

/** 配置文件名列表 */
const CONFIG_FILE_NAMES = ['settings.yaml', 'settings.yml', 'settings.json'];

/** 系统级默认目录 */
const SYSTEM_DEFAULTS_DIR = getSystemDefaultsDir();

/**
 * 展开路径（支持 ~ 前缀）
 */
export function expandPath(path: string): string {
  if (path.startsWith('~/')) {
    return resolve(homedir(), path.slice(2));
  }
  return resolve(path);
}

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

  if (configPath) {
    if (existsSync(configPath)) {
      const config = loadConfigFile(configPath);
      return ConfigSchema.parse(deepMerge(loadSystemConfig(), config));
    }
    return ConfigSchema.parse(loadSystemConfig());
  }

  const configPaths = collectConfigPaths(workspace, currentDir);
  const systemConfig = loadSystemConfig();
  let mergedConfig = systemConfig;

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
  const workspaceDir = resolve(currentDir, '../../../workspace');
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
 * 构建从 workspace 到 currentDir 的路径链
 */
function buildPathChain(workspace: string, currentDir: string): string[] {
  const chain: string[] = [];
  let dir = currentDir;

  while (dir.length >= workspace.length) {
    chain.push(dir);
    if (dir === workspace) break;

    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return chain;
}

/**
 * 加载系统级默认配置
 */
function loadSystemConfig(): Record<string, unknown> {
  const systemConfigPath = resolve(SYSTEM_DEFAULTS_DIR, 'settings.yaml');

  if (!existsSync(systemConfigPath)) {
    return {
      agents: {
        workspace: '~/.microbot/workspace',
        model: 'ollama/qwen3',
        maxTokens: 8192,
        temperature: 0.7,
        maxToolIterations: 20,
      },
      providers: {},
      channels: {},
    };
  }

  return loadConfigFile(systemConfigPath);
}

/**
 * 加载配置文件
 */
function loadConfigFile(filePath: string): Record<string, unknown> {
  const content = readFileSync(filePath, 'utf-8');
  const ext = basename(filePath).split('.').pop()?.toLowerCase();

  let config: Record<string, unknown> | undefined;

  switch (ext) {
    case 'yaml':
    case 'yml':
      config = load(content) as Record<string, unknown> | undefined;
      break;
    case 'json':
      config = JSON.parse(content);
      break;
    default:
      config = load(content) as Record<string, unknown> | undefined;
  }

  return resolveEnvVars(config || {}) as Record<string, unknown>;
}

/**
 * 查找配置文件
 */
function findConfigFile(dir: string): string | null {
  for (const name of CONFIG_FILE_NAMES) {
    const path = resolve(dir, name);
    if (existsSync(path)) return path;
  }
  return null;
}

/**
 * 深度合并对象
 */
function deepMerge<T extends Record<string, unknown>>(
  target: T,
  source: Partial<T>
): T {
  const result = { ...target };

  for (const key of Object.keys(source) as (keyof T)[]) {
    const sourceValue = source[key];
    const targetValue = result[key];

    if (sourceValue === undefined) continue;

    if (key === 'providers') {
      result[key] = sourceValue as T[keyof T];
      continue;
    }

    if (
      sourceValue !== null &&
      typeof sourceValue === 'object' &&
      !Array.isArray(sourceValue) &&
      targetValue !== undefined &&
      targetValue !== null &&
      typeof targetValue === 'object' &&
      !Array.isArray(targetValue)
    ) {
      result[key] = deepMerge(
        targetValue as Record<string, unknown>,
        sourceValue as Record<string, unknown>
      ) as T[keyof T];
    } else {
      result[key] = sourceValue as T[keyof T];
    }
  }

  return result;
}

/**
 * 递归解析环境变量
 */
function resolveEnvVars(obj: unknown): unknown {
  if (typeof obj === 'string') {
    return obj.replace(/\$\{(\w+)\}/g, (_, key) => process.env[key] ?? '');
  }
  if (Array.isArray(obj)) {
    return obj.map(resolveEnvVars);
  }
  if (obj && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [k, resolveEnvVars(v)])
    );
  }
  return obj;
}

// 导出工作区和模板相关函数
export {
  validateWorkspaceAccess,
  canAccessWorkspace,
  getUserConfigPath,
  createDefaultUserConfig,
} from './workspace';

export {
  TEMPLATE_FILE_NAMES,
  findTemplateFile,
  loadTemplateFile,
  loadAllTemplateFiles,
} from './template';