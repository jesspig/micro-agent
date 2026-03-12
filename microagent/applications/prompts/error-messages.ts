/**
 * 错误消息模板
 *
 * 统一的错误消息格式，支持动态参数注入
 */

// ============================================================================
// 错误消息模板
// ============================================================================

/**
 * 配置相关错误消息
 */
export const ConfigErrors = {
  /** 配置文件不存在 */
  configFileNotFound: (filePath: string): string =>
    `配置文件不存在: ${filePath}`,

  /** 配置解析失败 */
  configParseFailed: (filePath: string, reason: string): string =>
    `配置文件解析失败: ${filePath}\n原因: ${reason}`,

  /** 配置验证失败 */
  configValidationFailed: (errors: string[]): string =>
    `配置验证失败:\n${errors.map((e) => `  - ${e}`).join("\n")}`,

  /** 缺少必需配置项 */
  missingRequiredConfig: (key: string): string =>
    `缺少必需配置项: ${key}`,

  /** 环境变量未定义 */
  envVarUndefined: (varName: string): string =>
    `环境变量未定义: ${varName}`,
} as const;

/**
 * Provider 相关错误消息
 */
export const ProviderErrors = {
  /** Provider 未注册 */
  providerNotFound: (name: string): string =>
    `Provider 未注册: ${name}`,

  /** Provider 初始化失败 */
  providerInitFailed: (name: string, reason: string): string =>
    `Provider 初始化失败: ${name}\n原因: ${reason}`,

  /** API 请求失败 */
  apiRequestFailed: (provider: string, status: number, message: string): string =>
    `API 请求失败: ${provider} 返回 ${status}\n${message}`,

  /** API 响应解析失败 */
  apiResponseParseFailed: (provider: string, reason: string): string =>
    `API 响应解析失败: ${provider}\n原因: ${reason}`,

  /** 模型不支持 */
  modelNotSupported: (provider: string, model: string): string =>
    `模型不支持: ${provider} 不支持模型 ${model}`,

  /** API Key 无效 */
  invalidApiKey: (provider: string): string =>
    `API Key 无效: ${provider}`,
} as const;

/**
 * Tool 相关错误消息
 */
export const ToolErrors = {
  /** 工具未注册 */
  toolNotFound: (name: string): string =>
    `工具未注册: ${name}`,

  /** 工具执行失败 */
  toolExecutionFailed: (name: string, reason: string): string =>
    `工具执行失败: ${name}\n原因: ${reason}`,

  /** 工具参数无效 */
  invalidToolArguments: (name: string, errors: string[]): string =>
    `工具参数无效: ${name}\n${errors.map((e) => `  - ${e}`).join("\n")}`,

  /** 工具超时 */
  toolTimeout: (name: string, timeout: number): string =>
    `工具执行超时: ${name} (${timeout}ms)`,

  /** 工具权限不足 */
  toolPermissionDenied: (name: string, action: string): string =>
    `工具权限不足: ${name} 不允许执行 ${action}`,
} as const;

/**
 * Skill 相关错误消息
 */
export const SkillErrors = {
  /** Skill 未找到 */
  skillNotFound: (name: string): string =>
    `Skill 未找到: ${name}`,

  /** Skill 加载失败 */
  skillLoadFailed: (name: string, reason: string): string =>
    `Skill 加载失败: ${name}\n原因: ${reason}`,

  /** Skill 依赖缺失 */
  skillDependencyMissing: (name: string, dependency: string): string =>
    `Skill 依赖缺失: ${name} 需要 ${dependency}`,

  /** Skill 版本不兼容 */
  skillVersionIncompatible: (name: string, expected: string, actual: string): string =>
    `Skill 版本不兼容: ${name} 期望 ${expected}，实际 ${actual}`,
} as const;

/**
 * Channel 相关错误消息
 */
export const ChannelErrors = {
  /** Channel 未注册 */
  channelNotFound: (id: string): string =>
    `Channel 未注册: ${id}`,

  /** Channel 连接失败 */
  channelConnectionFailed: (id: string, reason: string): string =>
    `Channel 连接失败: ${id}\n原因: ${reason}`,

  /** 消息发送失败 */
  messageSendFailed: (channelId: string, reason: string): string =>
    `消息发送失败: ${channelId}\n原因: ${reason}`,

  /** Webhook 验证失败 */
  webhookValidationFailed: (channelId: string): string =>
    `Webhook 验证失败: ${channelId}`,
} as const;

/**
 * Session 相关错误消息
 */
export const SessionErrors = {
  /** Session 不存在 */
  sessionNotFound: (id: string): string =>
    `Session 不存在: ${id}`,

  /** Session 创建失败 */
  sessionCreationFailed: (reason: string): string =>
    `Session 创建失败: ${reason}`,

  /** 消息历史过长 */
  messageHistoryTooLong: (count: number, max: number): string =>
    `消息历史过长: ${count} 条消息，最大允许 ${max} 条`,
} as const;

/**
 * 文件系统相关错误消息
 */
export const FileSystemErrors = {
  /** 文件不存在 */
  fileNotFound: (path: string): string =>
    `文件不存在: ${path}`,

  /** 目录不存在 */
  directoryNotFound: (path: string): string =>
    `目录不存在: ${path}`,

  /** 文件读取失败 */
  fileReadFailed: (path: string, reason: string): string =>
    `文件读取失败: ${path}\n原因: ${reason}`,

  /** 文件写入失败 */
  fileWriteFailed: (path: string, reason: string): string =>
    `文件写入失败: ${path}\n原因: ${reason}`,

  /** 权限不足 */
  permissionDenied: (path: string, action: string): string =>
    `权限不足: 无法${action} ${path}`,

  /** 路径超出工作区 */
  pathOutsideWorkspace: (path: string): string =>
    `路径超出工作区: ${path}`,
} as const;

/**
 * Agent 相关错误消息
 */
export const AgentErrors = {
  /** 达到最大迭代次数 */
  maxIterationsReached: (count: number): string =>
    `达到最大迭代次数: ${count} 次迭代`,

  /** Agent 执行失败 */
  agentExecutionFailed: (reason: string): string =>
    `Agent 执行失败: ${reason}`,

  /** 响应格式无效 */
  invalidResponseFormat: (reason: string): string =>
    `响应格式无效: ${reason}`,

  /** 子 Agent 超时 */
  subagentTimeout: (taskId: string, timeout: number): string =>
    `子 Agent 超时: ${taskId} (${timeout}ms)`,
} as const;

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 格式化错误消息
 *
 * @param prefix 错误前缀
 * @param message 错误消息
 * @param details 详细信息（可选）
 * @returns 格式化后的错误消息
 */
export function formatErrorMessage(
  prefix: string,
  message: string,
  details?: string,
): string {
  if (details) {
    return `[${prefix}] ${message}\n${details}`;
  }
  return `[${prefix}] ${message}`;
}

/**
 * 创建错误对象
 *
 * @param message 错误消息
 * @param code 错误代码（可选）
 * @returns 错误对象
 */
export function createError(message: string, code?: string): Error {
  const error = new Error(message);
  if (code) {
    (error as Error & { code: string }).code = code;
  }
  return error;
}
