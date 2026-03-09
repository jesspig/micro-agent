/**
 * IPC 消息处理器
 *
 * 处理 IPC 通信相关的消息分发和路由
 */

import { getLogger } from '../../runtime/infrastructure/logging/logger';
import { logIPCMessage } from '../logger';
import type { ServiceComponents } from '../types';

const log = getLogger(['agent-service', 'handlers', 'ipc']);

/** IPC 方法处理器类型 */
export type IPCMethodHandler = (
  params: unknown,
  requestId: string,
  _components: ServiceComponents,
  sendResponse: (response: unknown) => void
) => void | Promise<void>;

/** IPC 方法映射 */
export type IPCMethodMap = Map<string, IPCMethodHandler>;

/**
 * 创建 IPC 方法映射
 */
export function createIPCMethodMap(): IPCMethodMap {
  const methods = new Map<string, IPCMethodHandler>();

  methods.set('ping', async (_params, requestId, _components, sendResponse) => {
    sendResponse({ jsonrpc: '2.0', id: requestId, result: { pong: true } });
  });

  return methods;
}

/**
 * 分发 IPC 消息到对应的处理器
 */
export async function dispatchIPCMessage(
  message: unknown,
  _components: ServiceComponents,
  handlers: Map<string, (params: unknown, requestId: string) => Promise<void> | void>
): Promise<void> {
  const request = typeof message === 'string' ? JSON.parse(message) : message;
  const { id, method, params } = request;

  logIPCMessage('in', method, { requestId: id });

  const _sendResponse = (response: unknown) => {
    process.send?.(response);
    logIPCMessage('out', method, { requestId: id });
  };

  const sendError = (code: number, message: string) => {
    process.send?.({
      jsonrpc: '2.0',
      id,
      error: { code, message },
    });
  };

  try {
    const handler = handlers.get(method);
    if (handler) {
      await handler(params, id);
    } else {
      sendError(-32601, 'Method not found');
    }
  } catch (error) {
    sendError(-32603, 'Internal error');
    log.error('IPC 处理错误', { method, error: (error as Error).message });
  }
}

/**
 * 创建基础 IPC 处理器
 */
export function createBaseIPCHandlers(
  _components: ServiceComponents,
  handleStatus: () => Record<string, unknown>,
  handleExecute: (params: unknown) => Promise<unknown>
): Map<string, (params: unknown, requestId: string) => Promise<void> | void> {
  const handlers = new Map<string, (params: unknown, requestId: string) => Promise<void> | void>();

  handlers.set('ping', async (_params, requestId) => {
    process.send?.({ jsonrpc: '2.0', id: requestId, result: { pong: true } });
  });

  handlers.set('status', async (_params, requestId) => {
    process.send?.({
      jsonrpc: '2.0',
      id: requestId,
      result: handleStatus(),
    });
  });

  handlers.set('execute', async (params, requestId) => {
    try {
      const result = await handleExecute(params);
      process.send?.({ jsonrpc: '2.0', id: requestId, result });
      logIPCMessage('out', 'execute', { requestId });
    } catch (error) {
      process.send?.({
        jsonrpc: '2.0',
        id: requestId,
        error: { code: -32001, message: (error as Error).message },
      });
    }
  });

  return handlers;
}
