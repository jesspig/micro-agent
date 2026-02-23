/**
 * 日志系统配置
 *
 * 双输出模式:
 * 1. CLI: logtape/pretty 格式，显示关键信息
 * 2. 文件: JSONL 结构化日志，包含完整调试信息
 */

import { configure, type LogRecord } from '@logtape/logtape';
import { prettyFormatter } from '@logtape/pretty';
import { appendFileSync, mkdirSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import { homedir } from 'os';

/** 日志目录 */
const LOG_DIR = resolve(homedir(), '.microbot', 'logs');

/** 格式化日期为 YYYY-MM-DD */
function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** 当前日志文件路径 */
function getLogFilePath(): string {
  const date = formatDate(new Date());
  return join(LOG_DIR, `microbot-${date}.log`);
}

/** 确保日志目录存在 */
function ensureLogDir(): void {
  if (!existsSync(LOG_DIR)) {
    mkdirSync(LOG_DIR, { recursive: true });
  }
}

/**
 * CLI 格式化器 - 使用 logtape/pretty 并添加关键信息
 */
function cliFormatter(record: LogRecord): string {
  // 使用 pretty 基础格式
  let output = prettyFormatter(record);

  // 添加 properties
  if (record.properties && Object.keys(record.properties).length > 0) {
    const props = Object.entries(record.properties)
      .map(([k, v]) => {
        if (k === 'content') {
          const str = String(v);
          return `${k}=${str.length > 100 ? str.slice(0, 100) + '...' : str}`;
        }
        return `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`;
      })
      .join(' ');
    output += ` \x1b[2m[${props}]\x1b[0m`;
  }

  return output;
}

/**
 * 文件格式化器 - JSONL 结构化日志
 */
function jsonlFormatter(record: LogRecord): string {
  const entry: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    level: record.level,
    category: record.category.join('.'),
    message: record.message.join(''),
  };

  if (record.properties && Object.keys(record.properties).length > 0) {
    entry.properties = record.properties;
  }

  return JSON.stringify(entry);
}

/** CLI sink */
function cliSink(record: LogRecord): void {
  console.log(cliFormatter(record));
}

/** 文件 sink */
function fileSink(record: LogRecord): void {
  ensureLogDir();
  const line = jsonlFormatter(record) + '\n';
  appendFileSync(getLogFilePath(), line, 'utf-8');
}

export interface LogConfig {
  /** 详细模式（显示 debug 级别） */
  verbose?: boolean;
  /** 是否输出到文件 */
  file?: boolean;
}

/**
 * 初始化日志系统
 */
export async function initLogger(config: LogConfig = {}): Promise<void> {
  const { verbose = false, file = true } = config;

  const sinks: Record<string, (record: LogRecord) => void> = {
    cli: cliSink,
  };

  const loggerSinks = ['cli'];

  if (file) {
    sinks.file = fileSink;
    loggerSinks.push('file');
  }

  await configure({
    sinks,
    loggers: [
      {
        category: [],
        sinks: loggerSinks,
        lowestLevel: verbose ? 'debug' : 'info'
      },
      {
        category: ['logtape', 'meta'],
        sinks: ['cli'],
        lowestLevel: 'warning'
      },
    ],
    reset: true,
  });
}

/** 获取日志目录路径 */
export function getLogDir(): string {
  return LOG_DIR;
}
