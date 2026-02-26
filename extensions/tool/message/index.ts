/**
 * 消息工具扩展
 *
 * 提供消息发送功能。
 */

import { defineTool } from '@micro-agent/sdk';
import type { Tool, JSONSchema, ToolContext } from '@micro-agent/types';

/** 消息工具 */
export const MessageTool = defineTool({
  name: 'message',
  description: '发送消息到指定通道',
  inputSchema: {
    type: 'object',
    properties: {
      channel: { type: 'string', description: '通道名称' },
      chatId: { type: 'string', description: '聊天 ID' },
      content: { type: 'string', description: '消息内容' },
    },
    required: ['channel', 'chatId', 'content'],
  } satisfies JSONSchema,
  execute: async (input: { channel: string; chatId: string; content: string }, ctx: ToolContext) => {
    await ctx.sendToBus({
      channel: input.channel,
      chatId: input.chatId,
      content: input.content,
    });

    return `消息已发送到 ${input.channel}:${input.chatId}`;
  },
});

// 导出工具
export const messageTools: Tool[] = [MessageTool];