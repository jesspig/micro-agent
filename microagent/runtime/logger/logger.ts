/**
 * 默认 Logger 实现
 *
 * Runtime 层使用的简单 Logger 实现，不依赖外部库。
 * 日志输出通过 LogSink 回调传递给 Applications 层。
 */

const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warning: 2,
  error: 3,
} as const;

export type LogLevel = keyof typeof LOG_LEVELS;

export interface LogSink {
  (level: LogLevel, message: string, context?: Record<string, unknown>): void;
}

let currentSink: LogSink = () => {};

export function setRuntimeLogSink(sink: LogSink): void {
  currentSink = sink;
}

export function getRuntimeLogSink(): LogSink {
  return currentSink;
}

export type Logger = {
  debug: (message: string, context?: Record<string, unknown>) => void;
  info: (message: string, context?: Record<string, unknown>) => void;
  warn: (message: string, context?: Record<string, unknown>) => void;
  warning: (message: string, context?: Record<string, unknown>) => void;
  error: (message: string, context?: Record<string, unknown>) => void;
};

export function createDefaultLogger(
  minLevel: LogLevel = "debug",
  prefix?: string[]
): Logger {
  const minLevelValue = LOG_LEVELS[minLevel];

  const createLog = (level: LogLevel) => (
    message: string,
    context?: Record<string, unknown>
  ) => {
    if (LOG_LEVELS[level] < minLevelValue) return;
    const prefixStr = prefix ? prefix.join(":") : "runtime";
    currentSink(level, `[${prefixStr}] ${message}`, context);
  };

  return {
    debug: createLog("debug"),
    info: createLog("info"),
    warn: createLog("warning"),
    warning: createLog("warning"),
    error: createLog("error"),
  };
}
