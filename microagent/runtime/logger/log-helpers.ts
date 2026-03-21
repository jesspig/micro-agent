/**
 * 日志辅助函数
 */

import type { ILogger } from "./contracts.js";
import type { MethodCallLogData, MethodReturnLogData, MethodErrorLogData } from "./types.js";

/**
 * 记录方法调用开始
 */
export function logMethodCall(logger: ILogger, data: MethodCallLogData): void {
  logger.debug("方法调用开始", {
    ...data,
    timestamp: Date.now(),
  });
}

/**
 * 记录方法调用返回
 */
export function logMethodReturn(logger: ILogger, data: MethodReturnLogData): void {
  logger.debug("方法调用返回", {
    ...data,
    timestamp: Date.now(),
  });
}

/**
 * 记录方法调用错误
 */
export function logMethodError(logger: ILogger, data: MethodErrorLogData): void {
  logger.error("方法调用错误", {
    ...data,
    timestamp: Date.now(),
  });
}
