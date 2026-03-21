/**
 * 日志接口定义
 *
 * Runtime 层使用此接口，Applications 层提供具体实现
 */

export interface ILogger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warning(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

export interface ILoggerFactory {
  (category?: string[]): ILogger;
}

export interface ILogHelper {
  logMethodCall(logger: ILogger, data: {
    method: string;
    module: string;
    params?: Record<string, unknown>;
    caller?: string;
  }): void;
  logMethodReturn(logger: ILogger, data: {
    method: string;
    module: string;
    result?: unknown;
    duration?: number;
  }): void;
  logMethodError(logger: ILogger, data: {
    method: string;
    module: string;
    error: { name: string; message: string; stack?: string };
    params?: Record<string, unknown>;
    duration?: number;
  }): void;
}

export interface ISanitize {
  (obj: unknown, maxDepth?: number): unknown;
}

export interface ITruncateText {
  (text: string, maxLength?: number): string;
}
