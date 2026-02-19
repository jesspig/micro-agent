/**
 * 飞书资源获取和转换
 */
import * as lark from '@larksuiteoapi/node-sdk';
import { getLogger } from '@logtape/logtape';

const log = getLogger(['feishu', 'resource']);

/** 资源类型 */
type ResourceType = 'image' | 'file' | 'audio' | 'video';

/**
 * 获取图片资源
 * 
 * 注意：飞书 im.image.get API 只能下载应用自己上传的图片
 * 用户发送的图片需要通过 messageResource API 获取
 */
export async function getImageResource(
  client: lark.Client,
  messageId: string,
  imageKey: string
): Promise<string | null> {
  if (!imageKey) {
    log.warn('获取图片资源失败: imageKey 为空');
    return null;
  }

  try {
    log.debug('获取飞书图片: messageId={messageId}, imageKey={imageKey}', { messageId, imageKey });

    const response = await client.im.messageResource.get({
      path: { message_id: messageId, file_key: imageKey },
      params: { type: 'image' },
    });

    log.debug('飞书 messageResource API 响应: code={code}', { code: response.code });

    const respCode = (response as { code?: number }).code;
    const respHeaders = (response as { headers?: Record<string, string> }).headers;
    const contentType = respHeaders?.['content-type'] || '';

    if (respCode === 0) {
      const data = (response as { data: unknown }).data as unknown;
      return extractDataUri(data, 'image');
    }

    if (contentType.startsWith('image/')) {
      log.debug('SDK 直接返回图片: contentType={contentType}', { contentType });
      const data = (response as { data?: unknown }).data;
      
      if (data instanceof ArrayBuffer || Buffer.isBuffer(data)) {
        return extractDataUri(data, 'image');
      }

      // 处理 SDK 特殊响应格式
      const writeFn = (response as { writeFile?: (path: string) => Promise<void> }).writeFile;
      if (typeof writeFn === 'function') {
        const tmpPath = require('path').join(require('os').tmpdir(), `feishu-img-${Date.now()}.jpg`);
        await writeFn.call(response, tmpPath);
        const fileBuffer = require('fs').readFileSync(tmpPath);
        require('fs').unlinkSync(tmpPath);
        return bufferToDataUri(fileBuffer, 'image');
      }
    }

    log.warn('获取图片失败: code={code}', { code: respCode });
    return null;
  } catch (error) {
    log.error('获取飞书图片失败: {error}', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * 获取资源并转换为 base64 data URI
 */
export async function getResourceUrl(
  client: lark.Client,
  messageId: string,
  fileKey: string,
  type: ResourceType
): Promise<string | null> {
  if (!fileKey) {
    log.warn('获取资源失败: fileKey 为空');
    return null;
  }

  try {
    log.debug('获取飞书资源: messageId={messageId}, fileKey={fileKey}, type={type}', {
      messageId, fileKey, type,
    });

    const response = await client.im.messageResource.get({
      path: { message_id: messageId, file_key: fileKey },
      params: { type: type as 'image' | 'file' | 'audio' | 'video' },
    });

    log.debug('飞书 API 响应: code={code}', { code: response.code });

    if (response.code === 0) {
      const data = response.data as unknown;
      return extractDataUri(data, type);
    }

    log.warn('获取资源失败: code={code}', { code: response.code });
    return null;
  } catch (error) {
    log.error('获取飞书资源失败: {error}', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * 从响应数据提取 data URI
 */
async function extractDataUri(data: unknown, type: ResourceType): Promise<string | null> {
  // ArrayBuffer
  if (data instanceof ArrayBuffer) {
    log.debug('资源数据类型: ArrayBuffer, size={size}', { size: data.byteLength });
    return arrayBufferToDataUri(data, type);
  }

  // Buffer (Node.js)
  if (Buffer.isBuffer(data)) {
    log.debug('资源数据类型: Buffer, size={size}', { size: data.length });
    return bufferToDataUri(data, type);
  }

  // Blob
  if (typeof Blob !== 'undefined' && data instanceof Blob) {
    log.debug('资源数据类型: Blob, size={size}', { size: data.size });
    const buffer = await data.arrayBuffer();
    return arrayBufferToDataUri(buffer, type);
  }

  // ReadableStream
  if (data && typeof data === 'object' && typeof (data as ReadableStream).getReader === 'function') {
    log.debug('资源数据类型: ReadableStream');
    const chunks: Uint8Array[] = [];
    const reader = (data as ReadableStream).getReader();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }

    const buffer = Buffer.concat(chunks);
    log.debug('ReadableStream 读取完成: size={size}', { size: buffer.length });
    return bufferToDataUri(buffer, type);
  }

  // NodeJS.ReadableStream
  if (data && typeof data === 'object' && 'pipe' in data && typeof (data as NodeJS.ReadableStream).pipe === 'function') {
    log.debug('资源数据类型: NodeJS.ReadableStream');
    return new Promise((resolve) => {
      const chunks: Buffer[] = [];
      (data as NodeJS.ReadableStream)
        .on('data', (chunk: Buffer) => chunks.push(chunk))
        .on('end', () => resolve(bufferToDataUri(Buffer.concat(chunks), type)))
        .on('error', () => resolve(null));
    });
  }

  log.warn('未知的资源数据类型: {type}', { type: typeof data });
  return null;
}

/**
 * ArrayBuffer 转 data URI
 */
function arrayBufferToDataUri(buffer: ArrayBuffer, type: string): string {
  const uint8Array = new Uint8Array(buffer);
  const base64 = Buffer.from(uint8Array).toString('base64');
  return `data:${getMimeType(type)};base64,${base64}`;
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
