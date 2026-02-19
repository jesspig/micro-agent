import { describe, it, expect, beforeEach } from 'bun:test';
import { MessageTool } from '../../extensions/tool';
import { ToolRegistry } from '../../src/core/tool';
import type { ToolContext } from '../../src/core/tool';

describe('MessageTool', () => {
  let registry: ToolRegistry;
  let sentMessages: unknown[] = [];

  const ctx: ToolContext = {
    channel: 'feishu',
    chatId: '123456',
    workspace: process.cwd(),
    sendToBus: async (msg: unknown) => {
      sentMessages.push(msg);
    },
  };

  beforeEach(() => {
    sentMessages = [];
    registry = new ToolRegistry();
    registry.register(new MessageTool());
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

    it('should validate message parameters', async () => {
      const result = await registry.execute('message', {
        channel: 'feishu',
        // 缺少 chatId
        content: 'Hello',
      }, ctx);

      expect(result).toContain('参数错误');
    });
  });
});
