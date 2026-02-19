import { describe, it, expect, beforeEach } from 'bun:test';
import { z } from 'zod';
import { ToolRegistry, type Tool, type ToolContext } from '../../src/core/tool';

// 测试用工具
class TestTool implements Tool {
  readonly name = 'test_tool';
  readonly description = '测试工具';
  readonly inputSchema = z.object({
    message: z.string(),
  });

  async execute(input: { message: string }): Promise<string> {
    return `收到: ${input.message}`;
  }
}

class EchoTool implements Tool {
  readonly name = 'echo';
  readonly description = '回显工具';
  readonly inputSchema = z.object({
    text: z.string(),
  });

  async execute(input: { text: string }): Promise<string> {
    return input.text;
  }
}

// 默认上下文
const defaultCtx: ToolContext = {
  channel: 'test',
  chatId: '123',
  workspace: '/tmp',
  sendToBus: async () => {},
};

describe('ToolRegistry', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  describe('工具注册', () => {
    it('should register tool', () => {
      registry.register(new TestTool());
      expect(registry.has('test_tool')).toBe(true);
    });

    it('should throw error for duplicate tool', () => {
      registry.register(new TestTool());
      expect(() => registry.register(new TestTool())).toThrow('工具已存在: test_tool');
    });

    it('should get registered tool', () => {
      const tool = new TestTool();
      registry.register(tool);
      expect(registry.get('test_tool')).toBe(tool);
    });

    it('should return undefined for non-existent tool', () => {
      expect(registry.get('nonexistent')).toBeUndefined();
    });
  });

  describe('工具执行', () => {
    it('should execute tool successfully', async () => {
      registry.register(new TestTool());
      const result = await registry.execute('test_tool', { message: 'hello' }, defaultCtx);
      expect(result).toBe('收到: hello');
    });

    it('should return error for non-existent tool', async () => {
      const result = await registry.execute('nonexistent', {}, defaultCtx);
      expect(result).toBe('错误: 未找到工具 nonexistent');
    });

    it('should execute multiple tools', async () => {
      registry.register(new TestTool());
      registry.register(new EchoTool());
      
      const result1 = await registry.execute('test_tool', { message: 'test' }, defaultCtx);
      const result2 = await registry.execute('echo', { text: 'echo test' }, defaultCtx);
      
      expect(result1).toBe('收到: test');
      expect(result2).toBe('echo test');
    });
  });

  describe('参数验证', () => {
    it('should validate input with zod schema', async () => {
      registry.register(new TestTool());
      const result = await registry.execute('test_tool', { message: 123 }, defaultCtx);
      expect(result).toContain('参数错误');
    });

    it('should accept valid input', async () => {
      registry.register(new TestTool());
      const result = await registry.execute('test_tool', { message: 'valid' }, defaultCtx);
      expect(result).toBe('收到: valid');
    });
  });

  describe('工具定义', () => {
    it('should return all tool definitions', () => {
      registry.register(new TestTool());
      registry.register(new EchoTool());
      
      const definitions = registry.getDefinitions();
      expect(definitions).toHaveLength(2);
      expect(definitions.map(d => d.name)).toEqual(['test_tool', 'echo']);
    });

    it('should return empty array when no tools registered', () => {
      const definitions = registry.getDefinitions();
      expect(definitions).toHaveLength(0);
    });
  });
});
