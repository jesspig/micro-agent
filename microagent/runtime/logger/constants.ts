/**
 * 日志常量定义
 */

import { join } from "node:path";
import { homedir } from "node:os";

/** MicroAgent 根目录 */
export const MICRO_AGENT_DIR = join(homedir(), ".micro-agent");

/** 日志目录 */
export const LOGS_DIR = join(MICRO_AGENT_DIR, "logs");

/** 默认日志级别 */
export const DEFAULT_LOG_LEVEL = "info" as const;

/** 默认日志文件最大大小（MB） */
export const DEFAULT_LOG_MAX_FILE_SIZE_MB = 10;

/** 日志文件最小大小（MB） */
export const MIN_LOG_FILE_SIZE_MB = 1;

/** 日志文件最大大小（MB） */
export const MAX_LOG_FILE_SIZE_MB = 200;

/** 默认日志颗粒度 */
export const DEFAULT_LOG_GRANULARITY = "1H";

/** 日志保留天数 */
export const LOG_RETENTION_DAYS = 7;

/** 默认开启敏感信息脱敏 */
export const DEFAULT_LOG_SANITIZE = true;
