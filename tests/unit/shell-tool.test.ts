import { describe, it, expect, beforeEach } from 'bun:test';
import { ExecTool } from '../../extensions/tool';
import { ToolRegistry } from '../../src/core/tool';
import type { ToolContext } from '../../src/core/tool';

const defaultCtx: ToolContext = {
  channel: 'test',
  chatId: '123',
  workspace: process.cwd(),
  sendToBus: async () => {},
};

describe('ShellTool', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
    registry.register(new ExecTool(process.cwd()));
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
