/**
 * 应用层共享模块
 * 
 * 导出日志工具和常量定义
 */

// ============================================================================
// 日志工具 (LogTape)
// ============================================================================

// 日志配置
export {
  initLogger,
  getModuleLogger,
  isLoggerInitialized,
  getDefaultLevel,
  kernelLogger,
  providerLogger,
  toolLogger,
  sessionLogger,
  busLogger,
  channelLogger,
  memoryLogger,
  skillLogger,
  builderLogger,
  configLogger,
  cliLogger,
  providersLogger,
  channelsLogger,
  toolsLogger,
  mcpLogger,
  skillsLogger,
  promptsLogger,
  sharedLogger,
} from "./logger";

// 日志辅助函数
export {
  logMethodCall,
  logMethodReturn,
  logMethodError,
  createTimer,
  sanitize,
} from "./logger";

// 日志类型
export type {
  LoggerConfig,
  MethodCallLogData,
  MethodReturnLogData,
  MethodErrorLogData,
} from "./logger";

// ============================================================================
// 安全工具
// ============================================================================

// 常量
export { MAX_MESSAGE_LENGTH } from "./security";

// 消息长度限制
export { truncateMessage, getMessageLimit } from "./security";

// Token 脱敏
export { maskToken } from "./security";

// 日志脱敏
export { sanitizeLog, sanitizeLogMessage, sanitizeObject } from "./security";

// URL 验证
export {
  isSafeWebhookUrl,
  isSafeWebhookUrlForPlatform,
  isAllowedDomain,
  isUrlSafe,
  isUrlDomainAllowed,
} from "./security";

// 消息 ID 验证
export { isValidMessageId, parseMessageId } from "./security";

// Markdown 安全处理
export { sanitizeMarkdown } from "./security";

// 响应数据脱敏
export { sanitizeResponse, type SanitizeOptions } from "./security";

// 错误信息脱敏
export { sanitizeError } from "./security";

// ============================================================================
// 常量定义
// ============================================================================

// 路径常量
export {
  MICRO_AGENT_DIR,
  WORKSPACE_DIR,
  AGENT_DIR,
  SESSIONS_DIR,
  LOGS_DIR,
  HISTORY_DIR,
  SKILLS_DIR,
} from "./constants";

// 配置文件路径
export {
  SETTINGS_FILE,
  MCP_CONFIG_FILE,
  AGENTS_FILE,
  SOUL_FILE,
  USER_FILE,
  TOOLS_FILE,
  HEARTBEAT_FILE,
  MEMORY_FILE,
} from "./constants";

// 默认配置
export {
  DEFAULT_LOG_LEVEL,
  DEFAULT_MAX_ITERATIONS,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_TEMPERATURE,
  DEFAULT_MAX_TOKENS,
  DEFAULT_LOG_MAX_FILE_SIZE_MB,
  MIN_LOG_FILE_SIZE_MB,
  MAX_LOG_FILE_SIZE_MB,
  DEFAULT_LOG_GRANULARITY,
  MIN_LOG_GRANULARITY_MINUTES,
  MAX_LOG_GRANULARITY_MINUTES,
  LOG_RETENTION_DAYS,
  DEFAULT_LOG_SANITIZE,
} from "./constants";

// Agent 执行参数
export {
  SUBAGENT_MAX_CONCURRENCY,
  TOOL_EXECUTION_TIMEOUT,
  MESSAGE_SEND_TIMEOUT,
} from "./constants";

// 文件扩展名
export {
  MD_EXTENSION,
  YAML_EXTENSION,
  JSON_EXTENSION,
  JSONL_EXTENSION,
} from "./constants";

// 环境变量名称
export {
  ENV_OPENAI_API_KEY,
  ENV_ANTHROPIC_API_KEY,
  ENV_OPENROUTER_API_KEY,
  ENV_DEFAULT_PROVIDER,
  ENV_DEFAULT_MODEL,
  ENV_LOG_LEVEL,
} from "./constants";

// 消息角色
export {
  ROLE_SYSTEM,
  ROLE_USER,
  ROLE_ASSISTANT,
  ROLE_TOOL,
} from "./constants";

// 正则表达式
export {
  ENV_VAR_PATTERN,
  DATE_PATTERN,
} from "./constants";
