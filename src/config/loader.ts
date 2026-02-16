import { readFileSync, existsSync } from 'fs';
import { load } from 'js-yaml';
import { resolve } from 'path';
import { homedir } from 'os';
import { ConfigSchema, type Config, type AgentConfig } from './schema';

/** 配置文件查找路径 */
const CONFIG_FILES = ['config.yaml', 'config.yml', '.microbot/config.yaml'];

/** 默认 Agent 配置 */
const DEFAULT_AGENT_CONFIG: AgentConfig = {
  workspace: '~/.microbot/workspace',
  model: 'qwen3',
  maxTokens: 8192,
  temperature: 0.7,
  maxToolIterations: 20,
};

/**
 * 加载配置文件
 * @param configPath - 配置文件路径，默认自动查找
 */
export function loadConfig(configPath?: string): Config {
  const defaultConfig: Config = {
    agents: { defaults: DEFAULT_AGENT_CONFIG },
    providers: {},
    channels: {},
  };

  const filePath = configPath ?? findConfigFile();

  if (!filePath || !existsSync(filePath)) {
    return defaultConfig;
  }

  const content = readFileSync(filePath, 'utf-8');
  const rawConfig = load(content) as Record<string, unknown> | undefined;
  
  if (!rawConfig) {
    return defaultConfig;
  }

  const resolvedConfig = resolveEnvVars(rawConfig) as Record<string, unknown>;

  return ConfigSchema.parse({
    ...defaultConfig,
    ...resolvedConfig,
    agents: {
      defaults: {
        ...DEFAULT_AGENT_CONFIG,
        ...((resolvedConfig.agents as Record<string, unknown>)?.defaults as Record<string, unknown>),
      },
    },
  });
}

/** 查找配置文件 */
function findConfigFile(): string | null {
  for (const file of CONFIG_FILES) {
    const path = resolve(file);
    if (existsSync(path)) return path;
  }
  return null;
}

/** 递归替换环境变量 ${VAR_NAME} */
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
 * @param path - 路径
 */
export function expandPath(path: string): string {
  if (path.startsWith('~/')) {
    return resolve(homedir(), path.slice(2));
  }
  return resolve(path);
}
