/**
 * MicroAgent 错误类型定义
 *
 * 提供统一的错误类型体系，便于错误处理和追踪
 */

// ============================================================================
// 基础错误类
// ============================================================================

/**
 * MicroAgent 基础错误类
 *
 * 所有自定义错误的基类
 */
export class MicroAgentError extends Error {
  /** 错误代码 */
  readonly code: string;

  /** 错误发生的模块 */
  readonly module: string;

  /** 原始错误（如果有） */
  readonly cause?: Error;

  constructor(
    message: string,
    code: string,
    module: string,
    cause?: Error
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.module = module;
    this.cause = cause;

    // 保持正确的堆栈跟踪
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * 转换为可序列化的对象
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      module: this.module,
      cause: this.cause ? {
        name: this.cause.name,
        message: this.cause.message,
      } : undefined,
    };
  }
}

// ============================================================================
// Provider 错误
// ============================================================================

/**
 * Provider 错误
 *
 * 用于表示服务提供者相关的错误
 */
export class ProviderError extends MicroAgentError {
  constructor(
    message: string,
    code: string = "PROVIDER_ERROR",
    public readonly provider?: string,
    cause?: Error
  ) {
    super(message, code, "Provider", cause);
    this.name = "ProviderError";
  }
}

/**
 * Provider 配置错误
 */
export class ProviderConfigError extends ProviderError {
  constructor(
    message: string,
    provider?: string,
    cause?: Error
  ) {
    super(message, "PROVIDER_CONFIG_ERROR", provider, cause);
    this.name = "ProviderConfigError";
  }
}

/**
 * Provider 连接错误
 */
export class ProviderConnectionError extends ProviderError {
  constructor(
    message: string,
    provider?: string,
    cause?: Error
  ) {
    super(message, "PROVIDER_CONNECTION_ERROR", provider, cause);
    this.name = "ProviderConnectionError";
  }
}

/**
 * Provider API 错误
 */
export class ProviderAPIError extends ProviderError {
  constructor(
    message: string,
    public readonly statusCode?: number,
    provider?: string,
    cause?: Error
  ) {
    super(message, "PROVIDER_API_ERROR", provider, cause);
    this.name = "ProviderAPIError";
  }
}

// ============================================================================
// Tool 错误
// ============================================================================

/**
 * 工具错误
 *
 * 用于表示工具执行相关的错误
 */
export class ToolError extends MicroAgentError {
  constructor(
    message: string,
    code: string = "TOOL_ERROR",
    public readonly tool?: string,
    cause?: Error
  ) {
    super(message, code, "Tool", cause);
    this.name = "ToolError";
  }
}

/**
 * 工具参数错误
 *
 * 用于表示工具输入参数验证失败
 */
export class ToolInputError extends ToolError {
  constructor(
    message: string,
    tool?: string
  ) {
    super(message, "TOOL_INPUT_ERROR", tool);
    this.name = "ToolInputError";
  }
}

/**
 * Tool 未找到错误
 */
export class ToolNotFoundError extends ToolError {
  constructor(toolName: string) {
    super(`Tool 未找到: ${toolName}`, "TOOL_NOT_FOUND", toolName);
    this.name = "ToolNotFoundError";
  }
}

/**
 * Tool 执行错误
 */
export class ToolExecutionError extends ToolError {
  constructor(
    toolName: string,
    message: string,
    cause?: Error
  ) {
    super(`Tool 执行失败 [${toolName}]: ${message}`, "TOOL_EXECUTION_ERROR", toolName, cause);
    this.name = "ToolExecutionError";
  }
}

/**
 * Tool 参数错误（新版本，替代 ToolInputError）
 */
export class ToolParameterError extends ToolError {
  constructor(
    toolName: string,
    parameter: string,
    reason: string
  ) {
    super(
      `Tool 参数错误 [${toolName}]: ${parameter} - ${reason}`,
      "TOOL_PARAMETER_ERROR",
      toolName
    );
    this.name = "ToolParameterError";
  }
}

/**
 * Tool 权限错误
 */
export class ToolPermissionError extends ToolError {
  constructor(
    toolName: string,
    reason: string
  ) {
    super(`Tool 权限被拒绝 [${toolName}]: ${reason}`, "TOOL_PERMISSION_ERROR", toolName);
    this.name = "ToolPermissionError";
  }
}

// ============================================================================
// Channel 错误
// ============================================================================

/**
 * Channel 错误
 *
 * 用于表示通道相关的错误
 */
export class ChannelError extends MicroAgentError {
  constructor(
    message: string,
    code: string = "CHANNEL_ERROR",
    public readonly channel?: string,
    cause?: Error
  ) {
    super(message, code, "Channel", cause);
    this.name = "ChannelError";
  }
}

/**
 * Channel 配置错误
 */
export class ChannelConfigError extends ChannelError {
  constructor(
    message: string,
    channel?: string,
    cause?: Error
  ) {
    super(message, "CHANNEL_CONFIG_ERROR", channel, cause);
    this.name = "ChannelConfigError";
  }
}

/**
 * Channel 连接错误
 */
export class ChannelConnectionError extends ChannelError {
  constructor(
    message: string,
    channel?: string,
    cause?: Error
  ) {
    super(message, "CHANNEL_CONNECTION_ERROR", channel, cause);
    this.name = "ChannelConnectionError";
  }
}

/**
 * Channel 消息发送错误
 */
export class ChannelSendError extends ChannelError {
  constructor(
    message: string,
    channel?: string,
    cause?: Error
  ) {
    super(message, "CHANNEL_SEND_ERROR", channel, cause);
    this.name = "ChannelSendError";
  }
}

// ============================================================================
// 配置错误
// ============================================================================

/**
 * 配置错误
 *
 * 用于表示配置相关的错误
 */
export class ConfigError extends MicroAgentError {
  constructor(
    message: string,
    code: string = "CONFIG_ERROR",
    public readonly field?: string,
    cause?: Error
  ) {
    super(message, code, "Config", cause);
    this.name = "ConfigError";
  }
}

/**
 * 配置文件未找到错误
 */
export class ConfigNotFoundError extends ConfigError {
  constructor(path: string) {
    super(`配置文件未找到: ${path}`, "CONFIG_NOT_FOUND", path);
    this.name = "ConfigNotFoundError";
  }
}

/**
 * 配置验证错误
 */
export class ConfigValidationError extends ConfigError {
  constructor(
    message: string,
    public readonly validationErrors: string[],
    field?: string,
    cause?: Error
  ) {
    super(message, "CONFIG_VALIDATION_ERROR", field, cause);
    this.name = "ConfigValidationError";
  }
}

// ============================================================================
// Session 错误
// ============================================================================

/**
 * 会话错误
 *
 * 用于表示会话相关的错误
 */
export class SessionError extends MicroAgentError {
  constructor(
    message: string,
    code: string = "SESSION_ERROR",
    public readonly sessionKey?: string,
    cause?: Error
  ) {
    super(message, code, "Session", cause);
    this.name = "SessionError";
  }
}

/**
 * Session 未找到错误
 */
export class SessionNotFoundError extends SessionError {
  constructor(sessionKey: string) {
    super(`Session 未找到: ${sessionKey}`, "SESSION_NOT_FOUND", sessionKey);
    this.name = "SessionNotFoundError";
  }
}

/**
 * Session 加载错误
 */
export class SessionLoadError extends SessionError {
  constructor(
    message: string,
    sessionKey?: string,
    cause?: Error
  ) {
    super(message, "SESSION_LOAD_ERROR", sessionKey, cause);
    this.name = "SessionLoadError";
  }
}

/**
 * Session 持久化错误
 */
export class SessionPersistenceError extends SessionError {
  constructor(
    message: string,
    sessionKey?: string,
    cause?: Error
  ) {
    super(message, "SESSION_PERSISTENCE_ERROR", sessionKey, cause);
    this.name = "SessionPersistenceError";
  }
}

// ============================================================================
// Memory 错误
// ============================================================================

/**
 * 内存错误
 *
 * 用于表示内存存储相关的错误
 */
export class MemoryError extends MicroAgentError {
  constructor(
    message: string,
    code: string = "MEMORY_ERROR",
    cause?: Error
  ) {
    super(message, code, "Memory", cause);
    this.name = "MemoryError";
  }
}

// ============================================================================
// Agent 错误
// ============================================================================

/**
 * 超时错误
 *
 * 用于表示操作超时
 */
export class TimeoutError extends MicroAgentError {
  constructor(
    message: string,
    code: string = "TIMEOUT_ERROR",
    public readonly timeoutMs?: number
  ) {
    super(message, code, "Agent");
    this.name = "TimeoutError";
  }
}

/**
 * 迭代次数超限错误
 *
 * 用于表示 Agent 执行达到最大迭代次数
 */
export class MaxIterationsError extends MicroAgentError {
  constructor(maxIterations: number) {
    super(`达到最大迭代次数: ${maxIterations}`, "MAX_ITERATIONS_ERROR", "Agent");
    this.name = "MaxIterationsError";
  }
}

/**
 * Agent 相关错误
 */
export class AgentError extends MicroAgentError {
  constructor(
    message: string,
    code: string = "AGENT_ERROR",
    cause?: Error
  ) {
    super(message, code, "Agent", cause);
    this.name = "AgentError";
  }
}

/**
 * Agent 超时错误（新版本）
 */
export class AgentTimeoutError extends TimeoutError {
  constructor(timeout: number) {
    super(`Agent 执行超时 (${timeout}ms)`, "AGENT_TIMEOUT", timeout);
    this.name = "AgentTimeoutError";
  }
}

/**
 * Agent 迭代次数超限错误（新版本，替代 MaxIterationsError）
 */
export class AgentMaxIterationsError extends MaxIterationsError {
  // 继承自 MaxIterationsError 以保持向后兼容
}

// ============================================================================
// Registry 错误
// ============================================================================

/**
 * 注册表错误
 *
 * 用于表示注册表操作相关的错误
 */
export class RegistryError extends MicroAgentError {
  constructor(
    message: string,
    code: string = "REGISTRY_ERROR",
    public readonly itemType?: string,
    public readonly itemName?: string
  ) {
    super(message, code, "Registry");
    this.name = "RegistryError";
  }
}

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 判断错误是否为特定类型
 */
export function isMicroAgentError(error: unknown): error is MicroAgentError {
  return error instanceof MicroAgentError;
}

/**
 * 判断错误是否为 Provider 错误
 */
export function isProviderError(error: unknown): error is ProviderError {
  return error instanceof ProviderError;
}

/**
 * 判断错误是否为 Session 错误
 */
export function isSessionError(error: unknown): error is SessionError {
  return error instanceof SessionError;
}

/**
 * 判断错误是否为 Channel 错误
 */
export function isChannelError(error: unknown): error is ChannelError {
  return error instanceof ChannelError;
}

/**
 * 判断错误是否为 Tool 错误
 */
export function isToolError(error: unknown): error is ToolError {
  return error instanceof ToolError;
}

/**
 * 判断错误是否为 Agent 错误
 */
export function isAgentError(error: unknown): error is AgentError {
  return error instanceof AgentError;
}

/**
 * 判断错误是否为配置错误
 */
export function isConfigError(error: unknown): error is ConfigError {
  return error instanceof ConfigError;
}

/**
 * 将未知错误转换为 MicroAgentError
 */
export function toMicroAgentError(error: unknown, module: string = "Unknown"): MicroAgentError {
  if (error instanceof MicroAgentError) {
    return error;
  }

  if (error instanceof Error) {
    return new MicroAgentError(error.message, "UNKNOWN_ERROR", module, error);
  }

  return new MicroAgentError(String(error), "UNKNOWN_ERROR", module);
}

/**
 * 提取错误的用户友好消息
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof MicroAgentError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
