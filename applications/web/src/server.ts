/**
 * Web 服务器
 *
 * 基于 Bun.serve() 提供 Web API 和前端页面。
 */

import { getConfig } from '../../config/settings';
import { registerRoutes } from './routes';

const log = {
  debug: (...args: unknown[]) => console.debug('[web:server]', ...args),
  info: (...args: unknown[]) => console.info('[web:server]', ...args),
  error: (...args: unknown[]) => console.error('[web:server]', ...args),
};

/** 服务器配置 */
export interface ServerConfig {
  /** 端口 */
  port: number;
  /** 主机 */
  hostname: string;
  /** 是否启用 CORS */
  enableCors?: boolean;
}

/** 默认配置 */
const DEFAULT_CONFIG: ServerConfig = {
  port: 3000,
  hostname: 'localhost',
  enableCors: true,
};

/**
 * 创建 Web 服务器
 */
export function createServer(config?: Partial<ServerConfig>): Bun.Server {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };
  const appConfig = getConfig().getConfig();

  const server = Bun.serve({
    port: fullConfig.port,
    hostname: fullConfig.hostname,

    async fetch(req) {
      const url = new URL(req.url);
      const method = req.method;

      log.debug('[Server] 收到请求', { method, url: url.pathname });

      // 处理 CORS
      if (fullConfig.enableCors && method === 'OPTIONS') {
        return new Response(null, {
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          },
        });
      }

      // 路由
      const response = await handleRequest(req, url);

      // 添加 CORS 头
      if (fullConfig.enableCors) {
        response.headers.set('Access-Control-Allow-Origin', '*');
      }

      return response;
    },

    error(error) {
      log.error('[Server] 服务器错误', { error: error.message });
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    },
  });

  log.info('[Server] 服务器已启动', {
    url: `http://${fullConfig.hostname}:${fullConfig.port}`,
    port: fullConfig.port,
  });

  return server;
}

/**
 * 处理请求
 */
async function handleRequest(req: Request, url: URL): Promise<Response> {
  // API 路由
  if (url.pathname.startsWith('/api/')) {
    return registerRoutes(req, url);
  }

  // 静态文件和前端路由
  if (url.pathname === '/') {
    return new Response(renderIndex(), {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  // 404
  return new Response(JSON.stringify({ error: 'Not Found' }), {
    status: 404,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * 渲染首页
 */
function renderIndex(): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MicroAgent</title>
</head>
<body>
  <div id="app">
    <h1>MicroAgent Web</h1>
    <p>API 端点:</p>
    <ul>
      <li>GET /api/health - 健康检查</li>
      <li>POST /api/chat - 聊天接口</li>
      <li>GET/POST /api/sessions - 会话管理</li>
    </ul>
  </div>
</body>
</html>`;
}

// 启动服务器
createServer();