/**
 * HTTP 调试服务
 * 
 * 提供可选的 HTTP 调试接口。
 */

import { getLogger } from '@logtape/logtape';
import type { EventBus } from '../../runtime/infrastructure/event-bus';

const log = getLogger(['http-server']);

export interface HTTPServerConfig {
  port?: number;
  host?: string;
  debug?: boolean;
}

export class HTTPServer {
  private config: HTTPServerConfig;
  private eventBus: EventBus;
  private server: Bun.Server<undefined> | null = null;

  constructor(config: HTTPServerConfig, eventBus: EventBus) {
    this.config = config;
    this.eventBus = eventBus;
  }

  async start(): Promise<void> {
    const port = this.config.port ?? 3000;
    const host = this.config.host ?? '127.0.0.1';

    this.server = Bun.serve({
      port,
      hostname: host,
      fetch: async (request) => {
        const url = new URL(request.url);

        // CORS 处理
        if (request.method === 'OPTIONS') {
          return new Response(null, {
            headers: this.corsHeaders(),
          });
        }

        // 路由处理
        try {
          const response = await this.route(url.pathname, request);
          return this.addCorsHeaders(response);
        } catch (error) {
          return Response.json(
            { success: false, error: String(error) },
            { status: 500 }
          );
        }
      },
    });

    log.info(`HTTP 服务启动: http://${host}:${port}`);
  }

  async stop(): Promise<void> {
    if (this.server) {
      this.server.stop();
      this.server = null;
    }
  }

  private async route(pathname: string, request: Request): Promise<Response> {
    // 健康检查
    if (pathname === '/health') {
      return Response.json({ status: 'ok', timestamp: new Date().toISOString() });
    }

    // RPC 端点
    if (pathname === '/rpc' && request.method === 'POST') {
      return this.handleRPC(request);
    }

    // 流式端点
    if (pathname === '/stream' && request.method === 'POST') {
      return this.handleStream(request);
    }

    // 工具列表
    if (pathname === '/tools' && request.method === 'GET') {
      return this.handleListTools();
    }

    return Response.json({ error: 'Not Found' }, { status: 404 });
  }

  private async handleRPC(request: Request): Promise<Response> {
    const body = await request.text();
    const message = JSON.parse(body);

    let result: unknown;
    this.eventBus.emit('http:rpc', {
      message,
      reply: (res: unknown) => {
        result = res;
      },
    });

    return Response.json({ success: true, data: result });
  }

  private async handleStream(request: Request): Promise<Response> {
    const body = await request.text();
    const message = JSON.parse(body);

    // 创建 SSE 流
    const stream = new ReadableStream({
      start: (controller) => {
        const encoder = new TextEncoder();

        this.eventBus.emit('http:stream', {
          message,
          send: (chunk: unknown) => {
            const data = `data: ${JSON.stringify(chunk)}\n\n`;
            controller.enqueue(encoder.encode(data));
          },
          close: () => {
            controller.close();
          },
        });
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  }

  private async handleListTools(): Promise<Response> {
    let tools: unknown[] = [];
    this.eventBus.emit('http:listTools', {
      reply: (list: unknown[]) => {
        tools = list;
      },
    });

    return Response.json({ tools });
  }

  private corsHeaders(): Record<string, string> {
    return {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };
  }

  private addCorsHeaders(response: Response): Response {
    const headers = new Headers(response.headers);
    for (const [key, value] of Object.entries(this.corsHeaders())) {
      headers.set(key, value);
    }
    return new Response(response.body, { ...response, headers });
  }
}
