import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { HeartbeatService } from '../../src/core/service/heartbeat/service';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('HeartbeatService', () => {
  let workspace: string;
  let service: HeartbeatService;
  let heartbeatCalled = false;
  let lastPrompt = '';

  beforeEach(() => {
    workspace = join(tmpdir(), `heartbeat-test-${Date.now()}`);
    mkdirSync(workspace, { recursive: true });

    heartbeatCalled = false;
    lastPrompt = '';

    service = new HeartbeatService(
      async (prompt) => {
        heartbeatCalled = true;
        lastPrompt = prompt;
        return 'HEARTBEAT_OK';
      },
      {
        intervalMs: 100, // 测试用短间隔
        workspace,
      }
    );
  });

  afterEach(() => {
    service.stop();
    if (existsSync(workspace)) {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  describe('基础功能', () => {
    it('should start and stop', () => {
      expect(service.isRunning).toBe(false);
      service.start();
      expect(service.isRunning).toBe(true);
      service.stop();
      expect(service.isRunning).toBe(false);
    });
  });

  describe('心跳检测', () => {
    it('should not trigger when HEARTBEAT.md does not exist', async () => {
      service.start();
      await new Promise(r => setTimeout(r, 200));

      expect(heartbeatCalled).toBe(false);
    });

    it('should trigger when HEARTBEAT.md has tasks', async () => {
      const heartbeatPath = join(workspace, 'HEARTBEAT.md');
      writeFileSync(heartbeatPath, '# 待办\n\n- [ ] 任务1\n');

      service.start();
      await new Promise(r => setTimeout(r, 250));

      expect(heartbeatCalled).toBe(true);
      expect(lastPrompt).toContain('HEARTBEAT.md');
    });

    it('should not trigger when HEARTBEAT.md is empty', async () => {
      const heartbeatPath = join(workspace, 'HEARTBEAT.md');
      writeFileSync(heartbeatPath, '# 标题\n\n<!-- 注释 -->\n');

      service.start();
      await new Promise(r => setTimeout(r, 200));

      expect(heartbeatCalled).toBe(false);
    });
  });
});
