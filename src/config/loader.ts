import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { load } from 'js-yaml';
import { resolve, dirname, basename } from 'path';
import { homedir } from 'os';
import { ConfigSchema, type Config, type AgentConfig } from './schema';

/** 用户配置目录 */
const USER_CONFIG_DIR = '~/.microbot';

/** 用户配置文件名（按优先级） */
const USER_CONFIG_FILES = ['settings.yaml', 'settings.yml', 'settings.json', 'settings.toml'];

/** 项目配置文件名 */
const PROJECT_CONFIG_FILES = ['config.yaml', 'config.yml', '.microbot/config.yaml'];

/** 默认 Agent 配置 */
const DEFAULT_AGENT_CONFIG: AgentConfig = {
  workspace: '~/.microbot/workspace',
  model: 'ollama/qwen3',
  maxTokens: 8192,
  temperature: 0.7,
  maxToolIterations: 20,
};

/**
 * 加载配置文件
 * 
 * 优先级：命令行指定 > 用户配置 > 项目配置 > 默认配置
 * 如果没有任何配置文件，自动创建默认用户配置。
 * @param configPath - 配置文件路径，默认自动查找
 */
export function loadConfig(configPath?: string): Config {
  const defaultConfig: Config = {
    agents: { defaults: DEFAULT_AGENT_CONFIG },
    providers: {},
    channels: {},
  };

  // 1. 命令行指定
  if (configPath) {
    return loadFromFile(configPath, defaultConfig);
  }

  // 2. 用户配置 ~/.microbot/settings.*
  const userConfig = findUserConfig();
  if (userConfig) {
    return loadFromFile(userConfig, defaultConfig);
  }

  // 3. 项目配置
  const projectConfig = findProjectConfig();
  if (projectConfig) {
    return loadFromFile(projectConfig, defaultConfig);
  }

  // 4. 没有任何配置，创建默认用户配置
  console.log('未找到配置文件，创建默认配置...');
  createDefaultUserConfig();
  
  return defaultConfig;
}

/** 从文件加载配置 */
function loadFromFile(filePath: string, defaultConfig: Config): Config {
  if (!existsSync(filePath)) {
    return defaultConfig;
  }

  const content = readFileSync(filePath, 'utf-8');
  const ext = basename(filePath).split('.').pop()?.toLowerCase();
  
  let rawConfig: Record<string, unknown> | undefined;
  
  switch (ext) {
    case 'yaml':
    case 'yml':
      rawConfig = load(content) as Record<string, unknown> | undefined;
      break;
    case 'json':
      rawConfig = JSON.parse(content);
      break;
    case 'toml':
      // TOML 解析需要额外依赖，暂不支持
      console.warn('TOML 格式暂不支持，请使用 YAML 或 JSON');
      return defaultConfig;
    default:
      rawConfig = load(content) as Record<string, unknown> | undefined;
  }
  
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

/** 查找用户配置文件 */
function findUserConfig(): string | null {
  const userDir = expandPath(USER_CONFIG_DIR);
  for (const file of USER_CONFIG_FILES) {
    const path = resolve(userDir, file);
    if (existsSync(path)) return path;
  }
  return null;
}

/** 查找项目配置文件 */
function findProjectConfig(): string | null {
  for (const file of PROJECT_CONFIG_FILES) {
    const path = resolve(file);
    if (existsSync(path)) return path;
  }
  return null;
}

/** 获取用户配置文件路径 */
export function getUserConfigPath(): string {
  const userDir = expandPath(USER_CONFIG_DIR);
  // 优先返回已存在的配置文件
  for (const file of USER_CONFIG_FILES) {
    const path = resolve(userDir, file);
    if (existsSync(path)) return path;
  }
  // 默认返回 settings.yaml
  return resolve(userDir, 'settings.yaml');
}

/** 创建默认用户配置 */
function createDefaultUserConfig(): void {
  const configPath = getUserConfigPath();
  const configDir = dirname(configPath);
  
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }
  
  const yamlContent = generateDefaultConfigYaml();
  writeFileSync(configPath, yamlContent, 'utf-8');
  console.log(`已创建默认配置: ${configPath}`);
  
  // 创建默认身份文件
  createDefaultSoulFile();
}

/** 创建默认身份文件 */
function createDefaultSoulFile(): void {
  const workspaceDir = expandPath(DEFAULT_AGENT_CONFIG.workspace);
  const soulPath = resolve(workspaceDir, 'SOUL.md');
  
  if (existsSync(soulPath)) return;
  
  if (!existsSync(workspaceDir)) {
    mkdirSync(workspaceDir, { recursive: true });
  }
  
  const soulContent = `# Soul

我是 microbot，一个轻量级个人 AI 助手。

## 性格

- 简洁高效，直奔主题
- 技术导向，乐于助人
- 好奇心强，持续学习

## 价值观

- 准确性优先
- 用户隐私和安全
- 行动透明

## 沟通风格

- 清晰直接
- 必要时解释推理过程
- 需要时询问澄清问题
`;
  
  writeFileSync(soulPath, soulContent, 'utf-8');
  console.log(`已创建默认身份: ${soulPath}`);
}

/** 生成默认配置 YAML */
function generateDefaultConfigYaml(): string {
  return `# microbot 用户配置
# 配置优先级: CLI -c > ~/.microbot/settings.yaml > 项目 config.yaml
# 模型格式: provider/model（如 ollama/qwen3）

agents:
  defaults:
    workspace: ~/.microbot/workspace
    model: ollama/qwen3
    maxTokens: 8192
    temperature: 0.7
    maxToolIterations: 20

providers:
  # 本地 Ollama（默认）
  ollama:
    baseUrl: http://localhost:11434/v1
    models: [qwen3]

  # 云服务示例（自定义名称）
  # deepseek:
  #   baseUrl: https://api.deepseek.com/v1
  #   apiKey: \${DEEPSEEK_API_KEY}
  #   models: [deepseek-chat]
  
  # openai:
  #   baseUrl: https://api.openai.com/v1
  #   apiKey: \${OPENAI_API_KEY}
  #   models: [gpt-4o, gpt-4o-mini]

channels:
  # 飞书通道
  feishu:
    enabled: false
    appId: your-app-id
    appSecret: your-app-secret
    allowFrom: []

  # 其他通道（待实现）
  # qq:
  #   enabled: false
  # dingtalk:
  #   enabled: false
  # wecom:
  #   enabled: false
`;
}

/** 保存用户配置 */
export function saveUserConfig(config: Config): void {
  const configPath = getUserConfigPath();
  const configDir = dirname(configPath);
  
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }
  
  // 转换为 YAML 格式保存
  const yamlContent = configToYaml(config);
  writeFileSync(configPath, yamlContent, 'utf-8');
}

/** 简单的配置转 YAML（避免依赖 js-yaml 的 dump） */
function configToYaml(config: Config): string {
  const lines: string[] = ['# microbot 用户配置', ''];
  
  // agents
  lines.push('agents:');
  lines.push('  defaults:');
  const agent = config.agents.defaults;
  lines.push(`    workspace: ${agent.workspace}`);
  lines.push(`    model: ${agent.model}`);
  lines.push(`    maxTokens: ${agent.maxTokens}`);
  lines.push(`    temperature: ${agent.temperature}`);
  lines.push(`    maxToolIterations: ${agent.maxToolIterations}`);
  lines.push('');
  
  // providers
  if (Object.keys(config.providers).length > 0) {
    lines.push('providers:');
    for (const [name, provider] of Object.entries(config.providers)) {
      if (provider) {
        lines.push(`  ${name}:`);
        lines.push(`    baseUrl: ${provider.baseUrl}`);
        if (provider.models) {
          lines.push(`    models: [${provider.models.map(m => `"${m}"`).join(', ')}]`);
        }
      }
    }
    lines.push('');
  }
  
  // channels
  if (Object.keys(config.channels).length > 0) {
    lines.push('channels:');
    for (const [name, channel] of Object.entries(config.channels)) {
      if (channel) {
        lines.push(`  ${name}:`);
        lines.push(`    enabled: ${channel.enabled}`);
      }
    }
  }
  
  return lines.join('\n');
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