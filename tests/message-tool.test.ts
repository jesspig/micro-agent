import { describe, it, expect, beforeEach } from 'bun:test';
import { MessageTool } from '../extensions/tool';
import { ToolRegistry } from '@micro-agent/sdk';
import type { ToolContext } from '@micro-agent/types';

describe('MessageTool', () => {
  let registry: ToolRegistry;
  let sentMessages: unknown[] = [];

  const ctx: ToolContext = {
    channel: 'feishu',
    chatId: '123456',
    workspace: process.cwd(),
    currentDir: process.cwd(),
    sendToBus: async (msg: unknown) => {
      sentMessages.push(msg);
    },
  };

  beforeEach(() => {
    sentMessages = [];
    registry = new ToolRegistry();
    registry.register(MessageTool);
  });

  describe('消息发送', () => {
    it('should send message via bus', async () => {
      const result = await registry.execute('message', {
        channel: 'feishu',
        chatId: '789',
        content: 'Hello, World!',
      }, ctx);

      expect(result).toContain('消息已发送');
      expect(result).toContain('feishu:789');
      expect(sentMessages).toHaveLength(1);
      expect(sentMessages[0]).toEqual({
        channel: 'feishu',
        chatId: '789',
        content: 'Hello, World!',
      });
    });

    it('should validate missing chatId', async () => {
      const result = await registry.execute('message', {
        channel: 'feishu',
        // 缺少 chatId，应该返回验证错误
        content: 'Hello',
      }, ctx);

      // 工具应该返回验证失败错误
      expect(result).toContain('参数验证失败');
      expect(result).toContain('expected string, received undefined');
    });
  });
});
