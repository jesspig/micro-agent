/**
 * Agent Service 日志辅助函数
 *
 * 提供结构化日志记录功能
 */

import { getLogger } from '../runtime/infrastructure/logging/logger';
import type { ServiceLifecycleLog, SessionLifecycleLog, IPCMessageLog } from '../runtime/infrastructure/logging/logger';

const log = getLogger(['agent-service']);

/**
 * 记录服务生命周期日志
 */
export function logServiceLifecycle(
  event: ServiceLifecycleLog['event'],
  options?: { error?: string; mode?: 'ipc' | 'standalone' }
): void {
  const entry: ServiceLifecycleLog = {
    _type: 'service_lifecycle',
    timestamp: new Date().toISOString(),
    level: event === 'error' ? 'error' : 'info',
    category: 'agent-service',
    message: event === 'start' ? 'Agent Service 启动中...'
      : event === 'ready' ? 'Agent Service 已就绪'
      : event === 'stop' ? 'Agent Service 已停止'
      : `Agent Service 错误: ${options?.error}`,
    event,
    service: {
      version: '1.0.0',
      mode: options?.mode,
      pid: process.pid,
    },
    error: options?.error,
  };

  log.info('📢 服务生命周期', entry as unknown as Record<string, unknown>);
}

/**
 * 记录会话生命周期日志
 */
export function logSessionLifecycle(
  event: SessionLifecycleLog['event'],
  sessionId: string,
  user?: { id?: string; channel?: string }
): void {
  const entry: SessionLifecycleLog = {
    _type: 'session_lifecycle',
    timestamp: new Date().toISOString(),
    level: 'info',
    category: 'session',
    message: event === 'create' ? `会话创建: ${sessionId.slice(0, 8)}`
      : event === 'destroy' ? `会话销毁: ${sessionId.slice(0, 8)}`
      : `会话${event}: ${sessionId.slice(0, 8)}`,
    event,
    sessionId,
    user,
  };

  log.info('📱 会话生命周期', entry as unknown as Record<string, unknown>);
}

/**
 * 记录 IPC 消息日志
 */
export function logIPCMessage(
  direction: 'in' | 'out',
  method: string,
  options?: { requestId?: string; sessionId?: string; size?: number }
): void {
  const entry: IPCMessageLog = {
    _type: 'ipc_message',
    timestamp: new Date().toISOString(),
    level: 'debug',
    category: 'ipc',
    message: direction === 'in' ? `收到请求: ${method}` : `发送响应: ${method}`,
    direction,
    method,
    requestId: options?.requestId,
    sessionId: options?.sessionId,
    size: options?.size,
  };

  log.debug('📨 IPC 消息', entry as unknown as Record<string, unknown>);
}

/**
 * 获取日志记录器
 */
export function getLog() {
  return log;
}
