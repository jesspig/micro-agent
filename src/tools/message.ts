import { z } from 'zod';
import type { Tool, ToolContext } from './base';

/** 消息工具 */
export class MessageTool implements Tool {
  readonly name = 'message';
  readonly description = '发送消息到指定通道';
  readonly inputSchema = z.object({
    channel: z.string().describe('通道名称'),
    chatId: z.string().describe('聊天 ID'),
    content: z.string().describe('消息内容'),
  });

  async execute(input: { channel: string; chatId: string; content: string }, ctx: ToolContext): Promise<string> {
    await ctx.sendToBus({
      channel: input.channel,
      chatId: input.chatId,
      content: input.content,
    });
    
    return `消息已发送到 ${input.channel}:${input.chatId}`;
  }
}
