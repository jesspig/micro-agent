/**
 * 错误处理器
 * 
 * 处理 SDK 中的各种错误情况。
 */

/**
 * SDK 错误类型
 */
export type SDKErrorCode =
  | 'CONNECTION_ERROR'
  | 'TIMEOUT_ERROR'
  | 'PROTOCOL_ERROR'
  | 'SESSION_NOT_FOUND'
  | 'INVALID_REQUEST'
  | 'INTERNAL_ERROR'
  | 'IPC_CONNECT_FAILED'
  | 'IPC_TIMEOUT'
  | 'IPC_DISCONNECTED';

/**
 * SDK 错误
 */
export class SDKError extends Error {
  readonly code: SDKErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: SDKErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'SDKError';
    this.code = code;
    this.details = details;
  }
}

/**
 * 错误处理器
 */
export class ErrorHandler {
  /**
   * 从 JSON-RPC 错误创建 SDK 错误
   */
  static fromRPCError(error: { code: number; message: string }): SDKError {
    const codeMap: Record<number, SDKErrorCode> = {
      [-32700]: 'PROTOCOL_ERROR', // 解析错误
      [-32600]: 'INVALID_REQUEST', // 无效请求
      [-32601]: 'INVALID_REQUEST', // 方法不存在
      [-32602]: 'INVALID_REQUEST', // 无效参数
      [-32603]: 'INTERNAL_ERROR', // 内部错误
    };

    const sdkCode = codeMap[error.code] ?? 'INTERNAL_ERROR';
    return new SDKError(sdkCode, error.message, { rpcCode: error.code });
  }

  /**
   * 处理连接错误
   */
  static connectionError(message: string, details?: Record<string, unknown>): SDKError {
    return new SDKError('CONNECTION_ERROR', message, details);
  }

  /**
   * 处理超时错误
   */
  static timeoutError(operation: string, timeout: number): SDKError {
    return new SDKError('TIMEOUT_ERROR', `操作超时: ${operation} (${timeout}ms)`, {
      operation,
      timeout,
    });
  }

  /**
   * 判断是否为可重试错误
   */
  static isRetryable(error: SDKError): boolean {
    return error.code === 'CONNECTION_ERROR' || error.code === 'TIMEOUT_ERROR';
  }
}
