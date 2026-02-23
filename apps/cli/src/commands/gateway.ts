/**
 * Gateway 命令
 *
 * 启动 HTTP Gateway 服务器，提供 OpenAI 兼容 API。
 */

import { getLogger } from '@logtape/logtape';
import { createHTTPServer, createChatCompletionsHandler, createModelsHandler, type ModelProvider } from '@microbot/server';
import type { LLMProvider } from '@microbot/providers';

const log = getLogger(['cli', 'gateway']);

/** Gateway 命令配置 */
export interface GatewayCommandConfig {
  /** 监听地址 */
  hostname?: string;
  /** 监听端口 */
  port?: number;
  /** 认证令牌 */
  authToken?: string;
  /** LLM Provider */
  provider: LLMProvider;
  /** 可用模型列表 */
  models: ModelProvider[];
}

/**
 * 运行 Gateway 命令
 */
export async function runGatewayCommand(config: GatewayCommandConfig): Promise<void> {
  const hostname = config.hostname ?? '127.0.0.1';
  const port = config.port ?? 3000;

  log.info('启动 Gateway 服务器: {hostname}:{port}', { hostname, port });

  // 创建路由处理器
  const chatHandler = createChatCompletionsHandler(config.provider);
  const modelsHandler = createModelsHandler(config.models);

  // 创建主处理器
  async function handler(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // 路由
    if (url.pathname === '/v1/chat/completions' && request.method === 'POST') {
      return chatHandler(request);
    }

    if (url.pathname === '/v1/models' && request.method === 'GET') {
      return modelsHandler(request);
    }

    // 健康检查
    if (url.pathname === '/health' || url.pathname === '/') {
      return new Response(JSON.stringify({ status: 'ok', version: '0.2.0' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 404
    return new Response(JSON.stringify({ error: 'Not Found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 创建服务器
  const server = createHTTPServer(
    {
      hostname,
      port,
      authToken: config.authToken,
    },
    handler
  );

  log.info('Gateway 服务器已启动: {url}', { url: server.url });
  log.info('端点:');
  log.info('  POST {url}/v1/chat/completions', { url: server.url });
  log.info('  GET  {url}/v1/models', { url: server.url });
  log.info('  GET  {url}/health', { url: server.url });

  // 等待终止信号
  await new Promise<void>((resolve) => {
    process.on('SIGINT', () => {
      log.info('收到 SIGINT，关闭服务器');
      resolve();
    });
    process.on('SIGTERM', () => {
      log.info('收到 SIGTERM，关闭服务器');
      resolve();
    });
  });

  await server.close();
}

/** Yargs 命令定义类型 */
interface YargsCommand {
  command: string;
  describe: string;
  builder: (yargs: unknown) => unknown;
  handler: (args: unknown) => Promise<void>;
}

/** Yargs 链式接口 */
interface YargsLike {
  option: (name: string, config: unknown) => YargsLike;
}

/**
 * Gateway 命令定义
 */
export const gatewayCommand: YargsCommand = {
  command: 'gateway',
  describe: '启动 HTTP Gateway 服务器（OpenAI 兼容 API）',
  builder: (yargs: unknown) => {
    const y = yargs as YargsLike;
    return y
      .option('hostname', {
        describe: '监听地址',
        type: 'string',
        default: '127.0.0.1',
      })
      .option('port', {
        describe: '监听端口',
        type: 'number',
        default: 3000,
      })
      .option('token', {
        describe: '认证令牌',
        type: 'string',
      });
  },
  handler: async (args: unknown) => {
    console.log('Gateway 命令需要 LLM Provider 和模型配置');
    console.log('请通过程序化方式调用 runGatewayCommand');
  },
};
