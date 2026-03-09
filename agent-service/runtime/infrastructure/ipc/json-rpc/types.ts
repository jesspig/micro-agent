/**
 * JSON-RPC 2.0 类型定义
 *
 * 用于 IPC 层的类型共享，避免代码重复。
 */

/** JSON-RPC 请求 */
export interface JSONRPCRequest {
  jsonrpc: '2.0';
  id: string;
  method: string;
  params: unknown;
}

/** JSON-RPC 响应 */
export interface JSONRPCResponse {
  jsonrpc: '2.0';
  id: string;
  result?: unknown;
  error?: JSONRPCError;
}

/** JSON-RPC 错误 */
export interface JSONRPCError {
  code: number;
  message: string;
  data?: unknown;
}

/** JSON-RPC 流式事件 */
export interface JSONRPCStreamEvent {
  jsonrpc: '2.0';
  id: string;
  method: 'stream';
  params: StreamEventParams;
}

/** 流式事件参数 */
export interface StreamEventParams {
  delta?: string;
  done: boolean;
  toolCalls?: Array<ToolCallInfo>;
}

/** 工具调用信息 */
export interface ToolCallInfo {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

/** Socket 上下文（泛型，由具体实现定义） */
export interface SocketContext<TSocket = unknown> {
  socket: TSocket;
  requestId: string;
}

/** 流式方法上下文 */
export interface StreamMethodContext<TSocket = unknown> extends SocketContext<TSocket> {
  sendChunk: (chunk: StreamEventParams) => void;
}

/** 方法处理器 */
export type MethodHandler<TSocket = unknown> = (
  params: unknown,
  context: SocketContext<TSocket>
) => Promise<unknown> | unknown;

/** 流式方法处理器 */
export type StreamMethodHandler<TSocket = unknown> = (
  params: unknown,
  context: StreamMethodContext<TSocket>
) => Promise<void>;

/** JSON-RPC 标准错误码 */
export const JSONRPC_ERROR_CODES = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  AGENT_ERROR: -32001,
} as const;
