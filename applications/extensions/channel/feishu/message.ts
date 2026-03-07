/**
 * 飞书消息解析
 */
import { Client } from '@larksuiteoapi/node-sdk';
import { getLogger } from '@logtape/logtape';
import { getImageResource, getResourceUrl } from './resource';
import type {
  ParsedMessage,
  FileContent,
  AudioContent,
  VideoContent,
} from './types';

const log = getLogger(['feishu', 'message']);

/**
 * 解析消息内容，提取文本和媒体资源
 */
export async function parseMessageContent(
  client: Client,
  messageId: string,
  msgType: string,
  rawContent: string
): Promise<ParsedMessage> {
  let content = '';
  const media: string[] = [];

  try {
    const parsed = JSON.parse(rawContent || '{}');

    switch (msgType) {
      case 'text':
        content = parsed.text || '';
        break;

      case 'image':
        content = '[图片]';
        const imageKey = parsed.image_key || parsed.file_key;
        log.debug('图片消息', { messageId, imageKey });
        if (imageKey) {
          const imgUrl = await getImageResource(client, messageId, imageKey);
          if (imgUrl) {
            media.push(imgUrl);
            content = '请帮我分析这张图片';
          }
        }
        break;

      case 'file':
        const fileContent = parsed as FileContent;
        content = `[文件: ${fileContent.file_name}]`;
        const fileUrl = await getResourceUrl(client, messageId, fileContent.file_key, 'file');
        if (fileUrl) media.push(fileUrl);
        break;

      case 'audio':
        const audioContent = parsed as AudioContent;
        content = `[语音: ${audioContent.duration}秒]`;
        const audioUrl = await getResourceUrl(client, messageId, audioContent.file_key, 'audio');
        if (audioUrl) media.push(audioUrl);
        break;

      case 'video':
        const videoContent = parsed as VideoContent;
        content = `[视频: ${videoContent.duration}秒]`;
        const videoUrl = await getResourceUrl(client, messageId, videoContent.file_key, 'video');
        if (videoUrl) media.push(videoUrl);
        break;

      case 'sticker':
        content = '[表情]';
        const stickerUrl = await getResourceUrl(client, messageId, parsed.file_key, 'image');
        if (stickerUrl) media.push(stickerUrl);
        break;

      case 'post':
        content = extractPostText(parsed);
        break;

      default:
        content = `[${msgType}]`;
    }
  } catch {
    content = rawContent || '';
  }

  return { content, media };
}

/**
 * 从富文本消息中提取纯文本
 */
function extractPostText(postContent: unknown): string {
  if (!postContent || typeof postContent !== 'object') return '';

  const content = postContent as Record<string, unknown>;
  const blocks = content.content as Array<Record<string, unknown>> | undefined;
  if (!blocks || !Array.isArray(blocks)) return '';

  const texts: string[] = [];

  for (const block of blocks) {
    const paragraph = block.paragraph as Record<string, unknown> | undefined;
    const elements = paragraph?.elements as Array<Record<string, unknown>> | undefined;
    if (!elements) continue;

    for (const elem of elements) {
      const textRun = elem.text_run as Record<string, unknown> | undefined;
      if (textRun?.content) {
        texts.push(textRun.content as string);
      }
    }
  }

  return texts.join('\n');
}
