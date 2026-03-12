/**
 * status 命令实现
 *
 * 显示当前配置和运行信息
 * - 显示当前配置
 * - 显示 Provider 状态
 * - 显示已注册的工具
 * - 显示已加载的技能
 */

import {
  MICRO_AGENT_DIR,
  WORKSPACE_DIR,
  AGENT_DIR,
  SESSIONS_DIR,
  LOGS_DIR,
  SETTINGS_FILE,
  AGENTS_FILE,
  SOUL_FILE,
  USER_FILE,
  MEMORY_FILE,
} from "../../shared/constants.js";
import { loadSettings } from "../../config/loader.js";
import { getAllToolDefinitions } from "../../tools/index.js";
import { FilesystemSkillLoader } from "../../skills/index.js";

// ============================================================================
// 类型定义
// ============================================================================

/**
 * status 命令选项
 */
export interface StatusOptions {
  /** 显示详细配置 */
  verbose?: boolean;
  /** JSON 格式输出 */
  json?: boolean;
}

/**
 * status 命令结果
 */
export interface StatusResult {
  /** 配置状态 */
  config: {
    /** 是否已初始化 */
    initialized: boolean;
    /** 配置文件路径 */
    configPath: string;
    /** 当前 Provider */
    provider?: string;
    /** 当前模型 */
    model?: string;
    /** 最大迭代次数 */
    maxIterations?: number;
  };
  /** 目录状态 */
  directories: {
    name: string;
    path: string;
    exists: boolean;
  }[];
  /** 文件状态 */
  files: {
    name: string;
    path: string;
    exists: boolean;
    size?: number;
  }[];
  /** Provider 状态 */
  providers: {
    name: string;
    available: boolean;
    hasApiKey: boolean;
  }[];
  /** 工具列表 */
  tools: {
    name: string;
    description: string;
    enabled: boolean;
  }[];
  /** 技能列表 */
  skills: {
    name: string;
    description: string;
    loaded: boolean;
  }[];
}

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 检查路径是否存在
 */
async function pathExists(path: string): Promise<boolean> {
  const file = Bun.file(path);
  return await file.exists();
}

/**
 * 获取文件大小
 */
async function getFileSize(path: string): Promise<number | undefined> {
  const file = Bun.file(path);
  const exists = await file.exists();
  if (!exists) return undefined;
  const stat = await file.arrayBuffer();
  return stat.byteLength;
}

/**
 * 格式化文件大小
 */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * 检查 API Key 是否已配置
 */
function hasApiKey(envVar: string): boolean {
  return !!process.env[envVar];
}

// ============================================================================
// status 命令实现
// ============================================================================

/**
 * 执行 status 命令
 *
 * @param options - 命令选项
 * @returns 执行结果
 */
export async function statusCommand(
  options: StatusOptions = {}
): Promise<StatusResult> {
  const result: StatusResult = {
    config: {
      initialized: false,
      configPath: SETTINGS_FILE,
    },
    directories: [],
    files: [],
    providers: [],
    tools: [],
    skills: [],
  };

  // 1. 检查目录状态
  const directories = [
    { name: "根目录", path: MICRO_AGENT_DIR },
    { name: "工作目录", path: WORKSPACE_DIR },
    { name: "Agent 配置", path: AGENT_DIR },
    { name: "会话存储", path: SESSIONS_DIR },
    { name: "日志目录", path: LOGS_DIR },
  ];

  for (const dir of directories) {
    result.directories.push({
      name: dir.name,
      path: dir.path,
      exists: await pathExists(dir.path),
    });
  }

  // 2. 检查文件状态
  const files = [
    { name: "配置文件", path: SETTINGS_FILE },
    { name: "Agent 角色", path: AGENTS_FILE },
    { name: "个性设置", path: SOUL_FILE },
    { name: "用户偏好", path: USER_FILE },
    { name: "长期记忆", path: MEMORY_FILE },
  ];

  for (const file of files) {
    const exists = await pathExists(file.path);
    const size = exists ? await getFileSize(file.path) : undefined;

    // 构建文件状态对象
    const fileStatus: { name: string; path: string; exists: boolean; size?: number } = {
      name: file.name,
      path: file.path,
      exists,
    };
    if (size !== undefined) {
      fileStatus.size = size;
    }
    result.files.push(fileStatus);
  }

  // 3. 检查配置状态
  let settings: Awaited<ReturnType<typeof loadSettings>> | null = null;
  try {
    settings = await loadSettings();
    result.config.initialized = true;

    // 获取启用的 Provider 名称
    const providers = settings.providers ?? {};
    const enabledProviderName = Object.entries(providers).find(
      ([_, config]) => config?.enabled === true
    )?.[0];
    if (enabledProviderName) {
      result.config.provider = enabledProviderName;
    }

    if (settings.agents.defaults.model) {
      result.config.model = settings.agents.defaults.model;
    }
    if (settings.agents.defaults.maxToolIterations) {
      result.config.maxIterations = settings.agents.defaults.maxToolIterations;
    }
  } catch {
    result.config.initialized = false;
  }

  // 4. 检查 Provider 状态
  // Provider 环境变量映射
  const providerEnvVars: Record<string, string> = {
    openai: "OPENAI_API_KEY",
    anthropic: "ANTHROPIC_API_KEY",
    openrouter: "OPENROUTER_API_KEY",
    bigmodel: "BIGMODEL_API_KEY",
    dashscope: "DASHSCOPE_API_KEY",
    deepseek: "DEEPSEEK_API_KEY",
    iflow: "IFLOW_API_KEY",
    kimi: "KIMI_API_KEY",
    lmstudio: "LMSTUDIO_BASE_URL",
    minimax: "MINIMAX_API_KEY",
    modelscope: "MODELSCOPE_API_KEY",
    ollama: "OLLAMA_BASE_URL",
    siliconflow: "SILICONFLOW_API_KEY",
  };

  // 收集所有配置的 provider 名称
  const configuredProviders = settings?.providers
    ? Object.keys(settings.providers)
    : [];

  // 遍历所有可能的环境变量
  for (const [name, envVar] of Object.entries(providerEnvVars)) {
    const hasKey = hasApiKey(envVar);
    const isConfigured = configuredProviders.includes(name);
    const isEnabled = settings?.providers?.[name as keyof typeof settings.providers]?.enabled === true;

    result.providers.push({
      name,
      available: hasKey && isConfigured && isEnabled,
      hasApiKey: hasKey,
    });
  }

  // 5. 检查工具状态
  const toolDefinitions = getAllToolDefinitions();
  for (const tool of toolDefinitions) {
    result.tools.push({
      name: tool.name,
      description: tool.description,
      enabled: true,
    });
  }

  // 6. 检查技能状态
  try {
    const skillLoader = new FilesystemSkillLoader();
    const skills = await skillLoader.listSkills();
    for (const skill of skills) {
      result.skills.push({
        name: skill.meta.name,
        description: skill.meta.description,
        loaded: true,
      });
    }
  } catch {
    // 技能加载失败，忽略
  }

  // 7. 输出结果
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printStatus(result, options.verbose);
  }

  return result;
}

/**
 * 打印状态信息
 */
function printStatus(result: StatusResult, verbose?: boolean): void {
  console.log("\n" + "=".repeat(50));
  console.log("📊 MicroAgent 状态");
  console.log("=".repeat(50));

  // 配置状态
  console.log("\n🔧 配置状态");
  console.log("-".repeat(30));
  if (result.config.initialized) {
    console.log(`   状态: ✅ 已初始化`);
    console.log(`   Provider: ${result.config.provider ?? "未设置"}`);
    console.log(`   模型: ${result.config.model ?? "默认"}`);
    console.log(`   最大迭代: ${result.config.maxIterations ?? "默认"}`);
  } else {
    console.log(`   状态: ⚠️  未初始化`);
    console.log(`   运行 'micro-agent config' 初始化配置`);
  }

  // 目录状态
  console.log("\n📁 目录状态");
  console.log("-".repeat(30));
  for (const dir of result.directories) {
    const status = dir.exists ? "✅" : "❌";
    console.log(`   ${status} ${dir.name}`);
    if (verbose) {
      console.log(`      ${dir.path}`);
    }
  }

  // 文件状态
  console.log("\n📄 文件状态");
  console.log("-".repeat(30));
  for (const file of result.files) {
    const status = file.exists ? "✅" : "❌";
    const size = file.size ? ` (${formatSize(file.size)})` : "";
    console.log(`   ${status} ${file.name}${size}`);
    if (verbose) {
      console.log(`      ${file.path}`);
    }
  }

  // Provider 状态
  console.log("\n🤖 Provider 状态");
  console.log("-".repeat(30));
  for (const provider of result.providers) {
    if (provider.hasApiKey) {
      const status = provider.available ? "✅" : "⚠️";
      const statusText = provider.available ? "可用" : "已配置但未启用";
      console.log(`   ${status} ${provider.name} - ${statusText}`);
    }
  }

  // 显示未配置 API Key 的 provider（仅在 verbose 模式下）
  if (verbose) {
    const notConfigured = result.providers.filter(p => !p.hasApiKey);
    if (notConfigured.length > 0) {
      console.log("\n   未配置的 Provider:");
      for (const provider of notConfigured) {
        console.log(`      ${provider.name}`);
      }
    }
  }

  // 工具状态
  console.log("\n🛠️  已注册工具");
  console.log("-".repeat(30));
  if (result.tools.length > 0) {
    for (const tool of result.tools) {
      const status = tool.enabled ? "✅" : "❌";
      console.log(`   ${status} ${tool.name}`);
      if (verbose) {
        console.log(`      ${tool.description}`);
      }
    }
  } else {
    console.log("   暂无已注册工具");
  }

  // 技能状态
  console.log("\n📚 已加载技能");
  console.log("-".repeat(30));
  if (result.skills.length > 0) {
    for (const skill of result.skills) {
      const status = skill.loaded ? "✅" : "❌";
      console.log(`   ${status} ${skill.name}`);
      if (verbose) {
        console.log(`      ${skill.description}`);
      }
    }
  } else {
    console.log("   暂无已加载技能");
  }

  console.log("\n" + "=".repeat(50));
  console.log("");
}

/**
 * 显示 status 命令帮助信息
 */
export function showStatusHelp(): void {
  console.log(`
micro-agent status - 显示配置和运行信息

用法:
  micro-agent status [选项]

选项:
  --verbose, -v   显示详细信息
  --json          JSON 格式输出
  --help, -h      显示帮助信息

示例:
  micro-agent status           # 显示状态
  micro-agent status --verbose # 显示详细信息
  micro-agent status --json    # JSON 格式输出
`);
}
