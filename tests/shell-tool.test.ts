import { describe, it, expect, beforeEach } from 'bun:test';
import { createExecTool } from '../extensions/tool';
import { ToolRegistry } from '@microbot/sdk';
import type { ToolContext } from '@microbot/types';

const defaultCtx: ToolContext = {
  channel: 'test',
  chatId: '123',
  workspace: process.cwd(),
  currentDir: process.cwd(),
  sendToBus: async () => {},
};

describe('ShellTool', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
    registry.register(createExecTool(process.cwd()));
  });

  describe('命令执行', () => {
    it('should execute echo command', async () => {
      // Windows 使用 cmd.exe，echo 不需要引号
      const result = await registry.execute('exec', { command: 'echo Hello' }, defaultCtx);
      expect(result.trim()).toBe('Hello');
    });

    it('should execute dir command on Windows', async () => {
      const result = await registry.execute('exec', { command: 'dir' }, defaultCtx);
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('错误处理', () => {
    it('should handle invalid command', async () => {
      const result = await registry.execute('exec', { command: 'nonexistent_command_xyz' }, defaultCtx);
      expect(result).toBeDefined();
    });
  });
});
