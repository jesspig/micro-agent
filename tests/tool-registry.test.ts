import { describe, it, expect, beforeEach } from 'bun:test';
import { z } from 'zod';
import { ToolRegistry } from '@microbot/sdk';
import type { Tool, ToolContext, ToolResult, JSONSchema } from '@microbot/types';

// 测试用工具（使用 JSONSchema）
const testToolSchema: JSONSchema = {
  type: 'object',
  properties: {
    message: { type: 'string', description: '消息内容' },
  },
  required: ['message'],
};

class TestTool implements Tool {
  readonly name = 'test_tool';
  readonly description = '测试工具';
  readonly inputSchema = testToolSchema;

  async execute(input: unknown, _ctx: ToolContext): Promise<ToolResult> {
    const { message } = input as { message: string };
    return {
      content: [{ type: 'text', text: `收到: ${message}` }],
    };
  }
}

const echoToolSchema: JSONSchema = {
  type: 'object',
  properties: {
    text: { type: 'string', description: '文本内容' },
  },
  required: ['text'],
};

class EchoTool implements Tool {
  readonly name = 'echo';
  readonly description = '回显工具';
  readonly inputSchema = echoToolSchema;

  async execute(input: unknown, _ctx: ToolContext): Promise<ToolResult> {
    const { text } = input as { text: string };
    return {
      content: [{ type: 'text', text }],
    };
  }
}

// 默认上下文
const defaultCtx: ToolContext = {
  channel: 'test',
  chatId: '123',
  workspace: '/tmp',
  currentDir: '/tmp',
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
    it('should handle invalid input gracefully', async () => {
      registry.register(new TestTool());
      // 工具不验证参数，直接使用
      const result = await registry.execute('test_tool', { message: 123 }, defaultCtx);
      // 由于 message 是数字，会转换为字符串
      expect(result).toContain('收到:');
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