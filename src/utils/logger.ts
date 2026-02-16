import pino from 'pino';
import type { Logger } from '../types/interfaces';

/**
 * 创建日志实例
 * @param name - 日志名称
 * @param level - 日志级别，默认 'info'
 */
export function createLogger(name: string, level: string = 'info'): Logger {
  return pino({
    name,
    level,
    transport: level === 'debug' ? {
      target: 'pino-pretty',
      options: { colorize: true },
    } : undefined,
  });
}

/** 默认日志实例 */
export const logger = createLogger('microbot');
