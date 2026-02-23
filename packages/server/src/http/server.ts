/**
 * HTTP Server
 *
 * 提供 HTTP API 端点，默认仅监听 localhost。
 */

import { getLogger } from '@logtape/logtape';

const log = getLogger(['server', 'http']);

/** HTTP 服务器配置 */
export interface HTTPServerConfig {
  /** 监听地址（默认 127.0.0.1） */
  hostname?: string;
  /** 监听端口（默认 3000） */
  port?: number;
  /** 认证令牌（可选） */
  authToken?: string;
}

/** 服务器实例 */
export interface HTTPServerInstance {
  /** 服务器地址 */
  url: string;
  /** 关闭服务器 */
  close: () => Promise<void>;
}

/**
 * 创建 HTTP 服务器
 *
 * 使用 Bun 原生 HTTP 服务器。
 */
export function createHTTPServer(
  config: HTTPServerConfig,
  handler: (request: Request) => Promise<Response>
): HTTPServerInstance {
  const hostname = config.hostname ?? '127.0.0.1';
  const port = config.port ?? 3000;

  // 认证中间件
  const authHandler = async (request: Request): Promise<Response> => {
    // CORS 预检
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      });
    }

    // 认证检查
    if (config.authToken) {
      const authHeader = request.headers.get('Authorization');
      const token = authHeader?.replace('Bearer ', '');

      if (token !== config.authToken) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    // 调用实际处理器
    const response = await handler(request);

    // 添加 CORS 头
    response.headers.set('Access-Control-Allow-Origin', '*');
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    return response;
  };

  // 使用 Bun.serve
  const server = Bun.serve({
    hostname,
    port,
    fetch: authHandler,
  });

  log.info('HTTP 服务器已启动: {url}', { url: `http://${hostname}:${port}` });

  return {
    url: `http://${hostname}:${port}`,
    close: async () => {
      server.stop();
      log.info('HTTP 服务器已关闭');
    },
  };
}

/**
 * 创建 JSON 响应
 */
export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * 创建错误响应
 */
export function errorResponse(message: string, status = 500): Response {
  return jsonResponse({ error: message }, status);
}
