/**
 * MicroAgent 错误类型定义
 * 提供统一的错误类型体系，便于错误处理和追踪
 */

/**
 * MicroAgent 基础错误类
 * 所有自定义错误的基类
 */
export class MicroAgentError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "MicroAgentError";
  }
}

/**
 * Provider 错误
 * 用于表示服务提供者相关的错误
 */
export class ProviderError extends MicroAgentError {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly cause?: Error,
  ) {
    super(message, "PROVIDER_ERROR");
    this.name = "ProviderError";
  }
}

/**
 * 工具错误
 * 用于表示工具执行相关的错误
 */
export class ToolError extends MicroAgentError {
  constructor(
    message: string,
    public readonly tool: string,
    public readonly cause?: Error,
  ) {
    super(message, "TOOL_ERROR");
    this.name = "ToolError";
  }
}

/**
 * 工具参数错误
 * 用于表示工具输入参数验证失败
 */
export class ToolInputError extends ToolError {
  constructor(message: string, tool: string) {
    super(message, tool);
    this.name = "ToolInputError";
  }
}

/**
 * Channel 错误
 * 用于表示通道相关的错误
 */
export class ChannelError extends MicroAgentError {
  constructor(
    message: string,
    public readonly channel: string,
    public readonly cause?: Error,
  ) {
    super(message, "CHANNEL_ERROR");
    this.name = "ChannelError";
  }
}

/**
 * 配置错误
 * 用于表示配置相关的错误
 */
export class ConfigError extends MicroAgentError {
  constructor(
    message: string,
    public readonly field?: string,
  ) {
    super(message, "CONFIG_ERROR");
    this.name = "ConfigError";
  }
}

/**
 * 会话错误
 * 用于表示会话相关的错误
 */
export class SessionError extends MicroAgentError {
  constructor(
    message: string,
    public readonly sessionKey: string,
  ) {
    super(message, "SESSION_ERROR");
    this.name = "SessionError";
  }
}

/**
 * 内存错误
 * 用于表示内存存储相关的错误
 */
export class MemoryError extends MicroAgentError {
  constructor(
    message: string,
    public readonly cause?: Error,
  ) {
    super(message, "MEMORY_ERROR");
    this.name = "MemoryError";
  }
}

/**
 * 超时错误
 * 用于表示操作超时
 */
export class TimeoutError extends MicroAgentError {
  constructor(
    message: string,
    public readonly timeoutMs: number,
  ) {
    super(message, "TIMEOUT_ERROR");
    this.name = "TimeoutError";
  }
}

/**
 * 迭代次数超限错误
 * 用于表示 Agent 执行达到最大迭代次数
 */
export class MaxIterationsError extends MicroAgentError {
  constructor(maxIterations: number) {
    super(`达到最大迭代次数: ${maxIterations}`, "MAX_ITERATIONS_ERROR");
    this.name = "MaxIterationsError";
  }
}

/**
 * 注册表错误
 * 用于表示注册表操作相关的错误
 */
export class RegistryError extends MicroAgentError {
  constructor(
    message: string,
    public readonly itemType: string,
    public readonly itemName: string,
  ) {
    super(message, "REGISTRY_ERROR");
    this.name = "RegistryError";
  }
}
