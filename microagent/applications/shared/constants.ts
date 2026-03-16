/**
 * 常量定义
 * 
 * 定义 MicroAgent 应用层的常量配置
 */

import { join } from "node:path";
import { homedir } from "node:os";

// ============================================================================
// 路径常量
// ============================================================================

/** MicroAgent 根目录 */
export const MICRO_AGENT_DIR = join(homedir(), ".micro-agent");

/** 工作目录 */
export const WORKSPACE_DIR = join(MICRO_AGENT_DIR, "workspace");

/** Agent 配置目录 */
export const AGENT_DIR = join(WORKSPACE_DIR, ".agent");

/** 会话存储目录 */
export const SESSIONS_DIR = join(MICRO_AGENT_DIR, "sessions");

/** 日志目录 */
export const LOGS_DIR = join(MICRO_AGENT_DIR, "logs");

/** 每日记录目录 */
export const HISTORY_DIR = join(AGENT_DIR, "history");

/** 技能目录 */
export const SKILLS_DIR = join(AGENT_DIR, "skills");

// ============================================================================
// 配置文件路径
// ============================================================================

/** 用户配置文件（放在根目录） */
export const SETTINGS_FILE = join(MICRO_AGENT_DIR, "settings.yaml");

/** MCP 配置文件 */
export const MCP_CONFIG_FILE = join(AGENT_DIR, "mcp.json");

/** Agent 角色定义文件 */
export const AGENTS_FILE = join(AGENT_DIR, "AGENTS.md");

/** 个性/价值观文件 */
export const SOUL_FILE = join(AGENT_DIR, "SOUL.md");

/** 用户偏好文件 */
export const USER_FILE = join(AGENT_DIR, "USER.md");

/** 工具使用指南文件 */
export const TOOLS_FILE = join(AGENT_DIR, "TOOLS.md");

/** 心跳任务文件 */
export const HEARTBEAT_FILE = join(AGENT_DIR, "HEARTBEAT.md");

/** 长期记忆文件 */
export const MEMORY_FILE = join(AGENT_DIR, "MEMORY.md");

// ============================================================================
// 默认配置
// ============================================================================

/** 默认日志级别 */
export const DEFAULT_LOG_LEVEL = "info";

/** 默认最大迭代次数 */
export const DEFAULT_MAX_ITERATIONS = 20;

/** 默认请求超时（毫秒） */
export const DEFAULT_TIMEOUT_MS = 60000;

/** 默认温度参数 */
export const DEFAULT_TEMPERATURE = 0.7;

/** 默认最大输出 token 数 */
export const DEFAULT_MAX_TOKENS = 4096;

// ============================================================================
// 日志配置常量
// ============================================================================

/** 默认日志文件最大大小（MB） */
export const DEFAULT_LOG_MAX_FILE_SIZE_MB = 10;

/** 日志文件最小大小（MB） */
export const MIN_LOG_FILE_SIZE_MB = 1;

/** 日志文件最大大小（MB） */
export const MAX_LOG_FILE_SIZE_MB = 200;

/** 默认日志颗粒度 */
export const DEFAULT_LOG_GRANULARITY = "1H";

/** 日志颗粒度最小值（分钟）- 过小会导致频繁轮转增加 I/O 开销 */
export const MIN_LOG_GRANULARITY_MINUTES = 30;

/** 日志颗粒度最大值（分钟）= 7 天 - 过大不利于快速检索和传输 */
export const MAX_LOG_GRANULARITY_MINUTES = 7 * 24 * 60;

/** 日志保留天数 */
export const LOG_RETENTION_DAYS = 7;

/** 默认开启敏感信息脱敏 */
export const DEFAULT_LOG_SANITIZE = true;

// ============================================================================
// Agent 执行参数
// ============================================================================

/** 子 Agent 并发限制 */
export const SUBAGENT_MAX_CONCURRENCY = 5;

/** 工具执行超时（毫秒） */
export const TOOL_EXECUTION_TIMEOUT = 30000;

/** 消息发送超时（毫秒） */
export const MESSAGE_SEND_TIMEOUT = 10000;

// ============================================================================
// 文件扩展名
// ============================================================================

/** Markdown 文件扩展名 */
export const MD_EXTENSION = ".md";

/** YAML 文件扩展名 */
export const YAML_EXTENSION = ".yaml";

/** JSON 文件扩展名 */
export const JSON_EXTENSION = ".json";

/** JSONL 文件扩展名 */
export const JSONL_EXTENSION = ".jsonl";

// ============================================================================
// 环境变量名称
// ============================================================================

/** OpenAI API Key 环境变量 */
export const ENV_OPENAI_API_KEY = "OPENAI_API_KEY";

/** Anthropic API Key 环境变量 */
export const ENV_ANTHROPIC_API_KEY = "ANTHROPIC_API_KEY";

/** OpenRouter API Key 环境变量 */
export const ENV_OPENROUTER_API_KEY = "OPENROUTER_API_KEY";

/** 默认 Provider 环境变量 */
export const ENV_DEFAULT_PROVIDER = "MICRO_AGENT_PROVIDER";

/** 默认模型环境变量 */
export const ENV_DEFAULT_MODEL = "MICRO_AGENT_MODEL";

/** 日志级别环境变量 */
export const ENV_LOG_LEVEL = "MICRO_AGENT_LOG_LEVEL";

// ============================================================================
// 消息角色
// ============================================================================

/** 系统角色 */
export const ROLE_SYSTEM = "system";

/** 用户角色 */
export const ROLE_USER = "user";

/** 助手角色 */
export const ROLE_ASSISTANT = "assistant";

/** 工具角色 */
export const ROLE_TOOL = "tool";

// ============================================================================
// 正则表达式
// ============================================================================

/** 环境变量替换正则 */
export const ENV_VAR_PATTERN = /\$\{[^{}]+\}/g;

/** 日期格式正则 */
export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;