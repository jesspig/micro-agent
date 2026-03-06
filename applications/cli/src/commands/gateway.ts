/**
 * gateway 命令实现
 *
 * 启动 HTTP Gateway 服务器，提供 OpenAI 兼容 API。
 */

import { createHTTPServer, jsonResponse } from '@micro-agent/server';

/** Gateway 命令配置 */
export interface GatewayCommandConfig {
  /** 监听地址 */
  host?: string;
  /** 监听端口 */
  port?: number;
}

/**
 * 显示帮助信息
 */
function showHelp(): void {
  console.log(`
网关服务命令

用法:
  micro-agent gateway [选项]

选项:
  --port <port>    监听端口（默认 3000）
  --host <host>    监听地址（默认 0.0.0.0）

API 端点:
  POST /v1/chat/completions    聊天补全接口
  GET  /v1/models              模型列表接口

示例:
  micro-agent gateway
  micro-agent gateway --port 8080
  micro-agent gateway --host 127.0.0.1 --port 3001
`);
}

/**
 * 解析命令行参数
 */
function parseArgs(args: string[]): GatewayCommandConfig {
  const config: GatewayCommandConfig = {
    host: '0.0.0.0',
    port: 3000,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--port' || arg === '-p') {
      const value = args[++i];
      if (value) {
        const port = parseInt(value, 10);
        if (!isNaN(port) && port > 0 && port < 65536) {
          config.port = port;
        } else {
          console.log(`\x1b[33m警告: 无效的端口号 "${value}"，使用默认值 3000\x1b[0m`);
        }
      }
    } else if (arg === '--host' || arg === '-h') {
      const value = args[++i];
      if (value) {
        config.host = value;
      }
    } else if (arg === '--help') {
      showHelp();
      process.exit(0);
    }
  }

  return config;
}

/**
 * 创建默认请求处理器
 *
 * 提供基本的健康检查和 404 响应
 */
function createDefaultHandler() {
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);

    // 健康检查
    if (url.pathname === '/health' || url.pathname === '/') {
      return jsonResponse({
        status: 'ok',
        version: '0.2.1',
        service: 'MicroAgent Gateway',
      });
    }

    // OpenAI 兼容端点 - 暂未实现
    if (url.pathname === '/v1/chat/completions') {
      return jsonResponse(
        {
          error: 'Not Implemented',
          message: '聊天补全接口暂未实现，请等待后续版本',
        },
        501
      );
    }

    if (url.pathname === '/v1/models') {
      return jsonResponse(
        {
          error: 'Not Implemented',
          message: '模型列表接口暂未实现，请等待后续版本',
        },
        501
      );
    }

    // 404
    return jsonResponse({ error: 'Not Found' }, 404);
  };
}

/**
 * 执行 gateway 命令
 * @param args - 命令参数
 */
export async function runGatewayCommand(args: string[]): Promise<void> {
  // 解析参数
  const config = parseArgs(args);
  const host = config.host ?? '0.0.0.0';
  const port = config.port ?? 3000;

  // 显示启动信息
  console.log();
  console.log('\x1b[1m\x1b[36m启动 HTTP 网关服务...\x1b[0m');
  console.log('─'.repeat(50));
  console.log();
  console.log(`  \x1b[2m端口:\x1b[0m ${port}`);
  console.log(`  \x1b[2m地址:\x1b[0m http://${host}:${port}`);
  console.log();
  console.log('\x1b[1mAPI 端点:\x1b[0m');
  console.log(`  POST http://${host}:${port}/v1/chat/completions`);
  console.log(`  GET  http://${host}:${port}/v1/models`);
  console.log();

  // 创建服务器
  const handler = createDefaultHandler();
  const server = createHTTPServer(
    {
      hostname: host,
      port,
    },
    handler
  );

  console.log('\x1b[33m  [提示] 完整服务暂未实现，当前仅提供健康检查端点\x1b[0m');
  console.log();
  console.log('\x1b[2m按 Ctrl+C 停止服务\x1b[0m');
  console.log('─'.repeat(50));

  // 等待终止信号
  await new Promise<void>((resolve) => {
    process.on('SIGINT', () => {
      console.log();
      console.log('\x1b[2m收到中断信号，正在关闭服务器...\x1b[0m');
      resolve();
    });
    process.on('SIGTERM', () => {
      console.log();
      console.log('\x1b[2m收到终止信号，正在关闭服务器...\x1b[0m');
      resolve();
    });
  });

  // 关闭服务器
  await server.close();
  console.log('\x1b[32m服务已停止\x1b[0m');
}
