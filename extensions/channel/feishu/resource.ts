/**
 * 飞书资源获取和转换
 */
import { Client } from '@larksuiteoapi/node-sdk';
import { getLogger } from '@logtape/logtape';
import { createWriteStream, mkdtempSync, unlinkSync, readdirSync, rmdirSync } from 'fs';
import { tmpdir } from 'os';
import { join, basename } from 'path';

const log = getLogger(['feishu', 'resource']);

/** 资源类型 */
type ResourceType = 'image' | 'file' | 'audio' | 'video';

/** 临时目录路径 */
let tempDir: string | null = null;

/**
 * 获取或创建临时目录
 */
function getTempDir(): string {
  if (!tempDir) {
    tempDir = mkdtempSync(join(tmpdir(), 'feishu-resources-'));
  }
  return tempDir;
}

/**
 * 清理临时目录
 */
export function cleanupTempDir(): void {
  if (tempDir) {
    try {
      const files = readdirSync(tempDir);
      for (const file of files) {
        unlinkSync(join(tempDir, file));
      }
      rmdirSync(tempDir);
      tempDir = null;
    } catch {
      // 忽略清理失败
    }
  }
}

/**
 * 获取图片资源
 *
 * 注意：飞书 im.image.get API 只能下载应用自己上传的图片
 * 用户发送的图片需要通过 messageResource API 获取
 */
export async function getImageResource(
  client: Client,
  messageId: string,
  imageKey: string
): Promise<string | null> {
  if (!imageKey) {
    log.warn('获取图片资源失败: imageKey 为空');
    return null;
  }

  try {
    log.debug('获取飞书图片', { messageId, imageKey });

    const response = await client.im.messageResource.get({
      path: { message_id: messageId, file_key: imageKey },
      params: { type: 'image' },
    });

    const contentType = response.headers?.['content-type'] || '';
    log.debug('飞书 messageResource API 响应', { contentType });

    // 使用 writeFile 方法下载文件
    const tmpPath = join(getTempDir(), `img-${Date.now()}.jpg`);
    await response.writeFile(tmpPath);

    // 读取并转换为 data URI
    const { readFileSync, unlinkSync } = await import('fs');
    const buffer = readFileSync(tmpPath);
    unlinkSync(tmpPath);

    return bufferToDataUri(buffer, 'image');
  } catch (error) {
    log.error('获取飞书图片失败', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * 获取资源并转换为 base64 data URI
 */
export async function getResourceUrl(
  client: Client,
  messageId: string,
  fileKey: string,
  type: ResourceType
): Promise<string | null> {
  if (!fileKey) {
    log.warn('获取资源失败: fileKey 为空');
    return null;
  }

  try {
    log.debug('获取飞书资源', { messageId, fileKey, type });

    const response = await client.im.messageResource.get({
      path: { message_id: messageId, file_key: fileKey },
      params: { type: type as 'image' | 'file' | 'audio' | 'video' },
    });

    const contentType = response.headers?.['content-type'] || '';
    log.debug('飞书 API 响应', { contentType });

    // 获取扩展名
    const ext = getExtension(contentType, type);

    // 使用 writeFile 方法下载文件
    const tmpPath = join(getTempDir(), `resource-${Date.now()}${ext}`);
    await response.writeFile(tmpPath);

    // 读取并转换为 data URI
    const { readFileSync, unlinkSync } = await import('fs');
    const buffer = readFileSync(tmpPath);
    unlinkSync(tmpPath);

    return bufferToDataUri(buffer, type);
  } catch (error) {
    log.error('获取飞书资源失败', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * 根据内容类型获取文件扩展名
 */
function getExtension(contentType: string, type: ResourceType): string {
  if (contentType.includes('png')) return '.png';
  if (contentType.includes('jpeg') || contentType.includes('jpg')) return '.jpg';
  if (contentType.includes('gif')) return '.gif';
  if (contentType.includes('webp')) return '.webp';
  if (contentType.includes('mp4')) return '.mp4';
  if (contentType.includes('mpeg') || contentType.includes('mp3')) return '.mp3';

  // 默认扩展名
  const extMap: Record<string, string> = {
    image: '.jpg',
    file: '.bin',
    audio: '.mp3',
    video: '.mp4',
  };
  return extMap[type] || '.bin';
}

/**
 * Buffer 转 data URI
 */
function bufferToDataUri(buffer: Buffer, type: string): string {
  const base64 = buffer.toString('base64');
  return `data:${getMimeType(type)};base64,${base64}`;
}

/**
 * 获取 MIME 类型
 */
function getMimeType(type: string): string {
  const mimeMap: Record<string, string> = {
    image: 'image/png',
    file: 'application/octet-stream',
    audio: 'audio/mpeg',
    video: 'video/mp4',
  };
  return mimeMap[type] || 'application/octet-stream';
}
