/**
 * 消息工具扩展
 *
 * 提供消息发送功能。
 */

import { defineTool } from '@micro-agent/sdk';
import type { Tool, JSONSchema, ToolContext } from '@micro-agent/types';
import { z } from 'zod';

/** 消息输入验证 Schema */
const MessageInputSchema = z.object({
  channel: z.string().min(1, '通道名称不能为空'),
  chatId: z.string().min(1, '聊天 ID 不能为空'),
  content: z.string().min(1, '消息内容不能为空'),
});

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
  execute: async (input: unknown, ctx: ToolContext) => {
    // 验证输入参数
    const result = MessageInputSchema.safeParse(input);
    if (!result.success) {
      return `参数验证失败: ${result.error.issues.map(i => i.message).join(', ')}`;
    }

    const { channel, chatId, content } = result.data;
    
    await ctx.sendToBus({
      channel,
      chatId,
      content,
    });

    return `消息已发送到 ${channel}:${chatId}`;
  },
});

// 导出工具
export const messageTools: Tool[] = [MessageTool];