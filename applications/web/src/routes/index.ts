/**
 * API 路由
 */

const log = {
  debug: (...args: unknown[]) => console.debug('[web:routes]', ...args),
};

/**
 * 路由处理器
 */
export type RouteHandler = (req: Request, url: URL) => Promise<Response>;

/** 路由表 */
const routes = new Map<string, RouteHandler>();

/**
 * 注册路由
 */
export function registerRoute(path: string, handler: RouteHandler): void {
  routes.set(path, handler);
  log.debug('[Routes] 路由已注册', { path });
}

/**
 * 处理路由
 */
export async function registerRoutes(req: Request, url: URL): Promise<Response> {
  const pathname = url.pathname.replace('/api', '');

  // 查找匹配的路由
  for (const [path, handler] of routes) {
    if (matchPath(path, pathname)) {
      return handler(req, url);
    }
  }

  // 404
  return new Response(JSON.stringify({ error: 'Not Found' }), {
    status: 404,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * 匹配路径
 */
function matchPath(route: string, pathname: string): boolean {
  // 简化实现：精确匹配
  return route === pathname;
}

// 注册默认路由

// 健康检查
registerRoute('/health', async () => {
  return new Response(JSON.stringify({ status: 'ok' }), {
    headers: { 'Content-Type': 'application/json' },
  });
});

// 聊天接口
registerRoute('/chat', async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const body = await req.json() as { message: string };

  // TODO: 实际调用 Agent
  return new Response(JSON.stringify({ response: `Echo: ${body.message}` }), {
    headers: { 'Content-Type': 'application/json' },
  });
});

// 会话管理
registerRoute('/sessions', async (req) => {
  if (req.method === 'GET') {
    // 获取会话列表
    return new Response(JSON.stringify({ sessions: [] }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (req.method === 'POST') {
    // 创建会话
    return new Response(JSON.stringify({ sessionId: crypto.randomUUID() }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ error: 'Method not allowed' }), {
    status: 405,
    headers: { 'Content-Type': 'application/json' },
  });
});

export { routes };