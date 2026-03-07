/**
 * IPC 集成测试
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { spawn, type Subprocess } from 'bun';
import { MicroAgentClient } from '../src/api/client';

describe('IPC Integration', () => {
  let serverProcess: Subprocess | null = null;
  let client: MicroAgentClient;

  beforeAll(async () => {
    // 启动 Agent Service
    serverProcess = spawn({
      cmd: ['bun', 'run', 'agent-service/src/index.ts'],
      stdout: 'pipe',
      stderr: 'pipe',
    });

    // 等待服务启动
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 创建客户端
    client = new MicroAgentClient({
      transport: 'ipc',
      ipc: {
        path: '/tmp/micro-agent.sock',
        timeout: 5000,
      },
    });
  });

  afterAll(async () => {
    // 断开客户端
    if (client) {
      await client.disconnect();
    }

    // 停止服务
    if (serverProcess) {
      serverProcess.kill();
      await serverProcess.exited;
    }
  });

  test('should connect to Agent Service', async () => {
    await client.connect();
    expect(client['transport']['connected']).toBe(true);
  });

  test('should get status', async () => {
    const status = await client.sendRequest('status', {}) as {
      version: string;
      uptime: number;
    };
    
    expect(status.version).toBe('1.0.0');
    expect(typeof status.uptime).toBe('number');
  });

  test('should disconnect', async () => {
    await client.disconnect();
    expect(client['transport']['connected']).toBe(false);
  });
});
