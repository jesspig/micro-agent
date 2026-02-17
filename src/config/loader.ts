import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { load } from 'js-yaml';
import { resolve, dirname, basename } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';
import { ConfigSchema, type Config } from './schema';

/** 配置层级（优先级从低到高） */
export enum ConfigLevel {
  SYSTEM = 0,   // 系统级：src/defaults/
  USER = 1,     // 用户级：~/.microbot/
  PROJECT = 2,  // 项目级：[workspace]/.microbot/
  DIRECTORY = 3, // 目录级：[workspace]//[path]/.microbot/
}

/** 配置层级路径信息 */
interface ConfigPath {
  level: ConfigLevel;
  dir: string;
  settingsPath: string | null;
}

/** 系统级默认目录 */
const SYSTEM_DEFAULTS_DIR = getSystemDefaultsDir();

/** 用户配置目录 */
const USER_CONFIG_DIR = '~/.microbot';

/** 用户配置文件名 */
const CONFIG_FILE_NAMES = ['settings.yaml', 'settings.yml', 'settings.json'];

/** 模板文件名列表 */
const TEMPLATE_FILE_NAMES = ['SOUL.md', 'AGENTS.md', 'USER.md', 'IDENTITY.md', 'TOOLS.md', 'HEARTBEAT.md'];

/** 获取系统级默认目录 */
function getSystemDefaultsDir(): string {
  // 获取当前模块所在目录，向上查找到 src/defaults
  const currentDir = dirname(fileURLToPath(import.meta.url));
  return resolve(currentDir, '../defaults');
}

/** 配置加载选项 */
export interface LoadConfigOptions {
  /** 指定配置文件路径（跳过层级合并） */
  configPath?: string;
  /** 工作目录（项目级） */
  workspace?: string;
  /** 当前目录（目录级） */
  currentDir?: string;
}

/**
 * 加载配置
 * 
 * 按优先级合并：系统级 < 用户级 < 项目级 < 目录级
 * 
 * @param options - 配置加载选项
 * - configPath: 指定配置文件路径时，直接加载该文件
 * - workspace: 工作目录，用于加载项目级配置
 * - currentDir: 当前目录，用于加载目录级配置
 */
export function loadConfig(options: LoadConfigOptions = {}): Config {
  const { configPath, workspace, currentDir } = options;
  
  // 如果指定了配置文件路径
  if (configPath) {
    // 文件存在则加载，否则返回系统级配置
    if (existsSync(configPath)) {
      const config = loadConfigFile(configPath);
      return ConfigSchema.parse(deepMerge(loadSystemConfig(), config));
    }
    return ConfigSchema.parse(loadSystemConfig());
  }
  
  // 收集所有配置路径
  const configPaths = collectConfigPaths(workspace, currentDir);
  
  // 从系统级加载基础配置
  const systemConfig = loadSystemConfig();
  let mergedConfig = systemConfig;
  
  // 按优先级合并配置
  for (const cp of configPaths) {
    if (cp.settingsPath && existsSync(cp.settingsPath)) {
      const layerConfig = loadConfigFile(cp.settingsPath);
      mergedConfig = deepMerge(mergedConfig, layerConfig);
    }
  }
  
  // 验证并返回
  return ConfigSchema.parse(mergedConfig);
}

/**
 * 收集配置路径（按优先级排序，低到高）
 * 
 * 目录级会向上递归查找所有父目录的 .microbot/
 * 例如在 workspace/A/B/C 中执行任务：
 * - 系统级 < 用户级 < 项目级 < A/.microbot < B/.microbot < C/.microbot
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
    const normalizedCurrent = resolve(currentDir);
    const normalizedWorkspace = resolve(workspace);
    
    // currentDir 必须在 workspace 内
    if (normalizedCurrent.startsWith(normalizedWorkspace)) {
      // 从 workspace 向上遍历到 currentDir，收集所有 .microbot/
      const dirConfigs = collectDirectoryConfigs(normalizedWorkspace, normalizedCurrent);
      paths.push(...dirConfigs);
    }
  }
  
  return paths;
}

/**
 * 收集目录级配置路径
 * 
 * 从 workspace 开始，遍历到 currentDir，收集所有 .microbot/
 * 越接近 currentDir 的优先级越高（放在数组后面）
 */
function collectDirectoryConfigs(workspace: string, currentDir: string): ConfigPath[] {
  const paths: ConfigPath[] = [];
  
  // 获取从 workspace 到 currentDir 的路径链
  const pathChain: string[] = [];
  let dir = currentDir;
  
  while (dir.length >= workspace.length) {
    pathChain.push(dir);
    if (dir === workspace) break;
    
    const parent = dirname(dir);
    if (parent === dir) break; // 已到根目录
    dir = parent;
  }
  
  // 反转：从 workspace 开始到 currentDir（优先级从低到高）
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
    // 如果系统级配置不存在，返回最小默认值
    return {
      agents: {
        defaults: {
          workspace: '~/.microbot/workspace',
          model: 'ollama/qwen3',
          maxTokens: 8192,
          temperature: 0.7,
          maxToolIterations: 20,
        },
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
  
  // 解析环境变量
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
 * 
 * 规则：
 * - 对象：深度合并（高优先级覆盖同名键）
 * - 数组：完全替换
 * - 基本类型：覆盖
 */
function deepMerge<T extends Record<string, unknown>>(
  target: T,
  source: Partial<T>
): T {
  const result = { ...target };
  
  for (const key of Object.keys(source) as (keyof T)[]) {
    const sourceValue = source[key];
    const targetValue = result[key];
    
    if (
      sourceValue !== undefined &&
      sourceValue !== null &&
      typeof sourceValue === 'object' &&
      !Array.isArray(sourceValue) &&
      targetValue !== undefined &&
      targetValue !== null &&
      typeof targetValue === 'object' &&
      !Array.isArray(targetValue)
    ) {
      // 两者都是对象，深度合并
      result[key] = deepMerge(
        targetValue as Record<string, unknown>,
        sourceValue as Record<string, unknown>
      ) as T[keyof T];
    } else if (sourceValue !== undefined) {
      // 其他情况直接覆盖
      result[key] = sourceValue as T[keyof T];
    }
  }
  
  return result;
}

/**
 * 递归解析环境变量 ${VAR_NAME}
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

/**
 * 展开路径（支持 ~ 前缀）
 */
export function expandPath(path: string): string {
  if (path.startsWith('~/')) {
    return resolve(homedir(), path.slice(2));
  }
  return resolve(path);
}

/**
 * 查找模板文件
 * 
 * 按优先级查找：目录级（向上递归）> 项目级 > 用户级 > 系统级
 * 越接近 currentDir 的优先级越高，返回第一个存在的文件
 * 
 * @param fileName - 文件名（如 SOUL.md）
 * @param workspace - 工作目录
 * @param currentDir - 当前目录
 */
export function findTemplateFile(
  fileName: string,
  workspace?: string,
  currentDir?: string
): string | null {
  const searchPaths: string[] = [];
  
  // 目录级（向上递归，越近优先级越高）
  if (currentDir && workspace) {
    const normalizedCurrent = resolve(currentDir);
    const normalizedWorkspace = resolve(workspace);
    
    if (normalizedCurrent.startsWith(normalizedWorkspace)) {
      // 获取从 currentDir 向上到 workspace 的路径链
      const pathChain: string[] = [];
      let dir = normalizedCurrent;
      
      while (dir.length >= normalizedWorkspace.length) {
        pathChain.push(dir);
        if (dir === normalizedWorkspace) break;
        
        const parent = dirname(dir);
        if (parent === dir) break;
        dir = parent;
      }
      
      // 从 currentDir 开始搜索（优先级从高到低）
      for (const d of pathChain) {
        searchPaths.push(resolve(d, '.microbot', fileName));
        searchPaths.push(resolve(d, fileName));
      }
    }
  }
  
  // 项目级
  if (workspace) {
    searchPaths.push(resolve(workspace, '.microbot', fileName));
    searchPaths.push(resolve(workspace, fileName));
  }
  
  // 用户级
  searchPaths.push(resolve(expandPath(USER_CONFIG_DIR), fileName));
  searchPaths.push(resolve(expandPath(USER_CONFIG_DIR), 'workspace', fileName));
  
  // 系统级（优先级最低）
  searchPaths.push(resolve(SYSTEM_DEFAULTS_DIR, fileName));
  
  // 返回第一个存在的文件
  for (const p of searchPaths) {
    if (existsSync(p)) return p;
  }
  
  return null;
}

/**
 * 加载模板文件内容
 */
export function loadTemplateFile(
  fileName: string,
  workspace?: string,
  currentDir?: string
): string | null {
  const filePath = findTemplateFile(fileName, workspace, currentDir);
  if (!filePath) return null;
  
  return readFileSync(filePath, 'utf-8');
}

/**
 * 加载所有模板文件
 */
export function loadAllTemplateFiles(
  workspace?: string,
  currentDir?: string
): Map<string, string> {
  const templates = new Map<string, string>();
  
  for (const fileName of TEMPLATE_FILE_NAMES) {
    const content = loadTemplateFile(fileName, workspace, currentDir);
    if (content) {
      templates.set(fileName, content);
    }
  }
  
  return templates;
}

/**
 * 获取用户配置文件路径
 */
export function getUserConfigPath(): string {
  const userDir = expandPath(USER_CONFIG_DIR);
  const existing = findConfigFile(userDir);
  if (existing) return existing;
  return resolve(userDir, 'settings.yaml');
}

/**
 * 创建默认用户配置
 * 
 * 仅创建用户级配置文件，模板文件保留在系统级
 */
export function createDefaultUserConfig(): void {
  const configPath = getUserConfigPath();
  
  if (existsSync(configPath)) return;
  
  const configDir = dirname(configPath);
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }
  
  // 创建最小的用户配置（仅覆盖必要项）
  const minimalConfig = `# microbot 用户配置
# 系统默认配置在 src/defaults/settings.yaml

# agents:
#   defaults:
#     model: ollama/qwen3

# providers:
#   deepseek:
#     baseUrl: https://api.deepseek.com/v1
#     apiKey: \${DEEPSEEK_API_KEY}
#     models: [deepseek-chat]

# channels:
#   feishu:
#     enabled: true
#     appId: your-app-id
#     appSecret: your-app-secret
`;
  
  writeFileSync(configPath, minimalConfig, 'utf-8');
  console.log(`已创建用户配置: ${configPath}`);
}

/**
 * 获取系统级默认目录
 */
export function getSystemDefaultsPath(): string {
  return SYSTEM_DEFAULTS_DIR;
}
