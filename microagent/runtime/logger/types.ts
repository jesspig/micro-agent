/**
 * 日志级别
 */
export type LogLevel = "debug" | "info" | "warning" | "error";

/**
 * 方法调用日志数据
 */
export interface MethodCallLogData {
  method: string;
  module: string;
  params?: Record<string, unknown>;
  caller?: string;
}

/**
 * 方法返回日志数据
 */
export interface MethodReturnLogData {
  method: string;
  module: string;
  result?: unknown;
  duration?: number;
}

/**
 * 方法错误日志数据
 */
export interface MethodErrorLogData {
  method: string;
  module: string;
  error: {
    name: string;
    message: string;
    stack?: string | undefined;
  };
  params?: Record<string, unknown>;
  duration?: number;
}

/**
 * 创建计时器
 */
export function createTimer(): () => number {
  const start = Date.now();
  return () => Date.now() - start;
}
