/**
 * Logger 模块
 *
 * 统一导出所有日志相关功能
 */

export type { LoggerConfig } from "@logtape/logtape";
export { initLogger, setOriginalConsole, getOriginalConsole, type OriginalConsole } from "./config.js";
export { getLogger, type Logger, type LogRecord, type Sink } from "@logtape/logtape";

export {
  getModuleLogger,
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
} from "./helpers.js";

export {
  logMethodCall,
  logMethodReturn,
  logMethodError,
  createTimer,
  sanitize,
  truncateText,
  type MethodCallLogData,
  type MethodReturnLogData,
  type MethodErrorLogData,
} from "./method-logger.js";

export { isLoggerInitialized, getDefaultLevel, getLoggerConfig } from "./config.js";
