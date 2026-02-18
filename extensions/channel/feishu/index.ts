/**
 * 飞书通道扩展
 * 
 * 使用 WebSocket 长连接接收消息，无需公网 IP。
 * 支持多模态输入：文本、图片、文件、语音、视频。
 */
import type { OutboundMessage } from '../../../src/core/bus/events';
import type { MessageBus } from '../../../src/core/bus/queue';
import type { ChannelType } from '../../../src/core/types/interfaces';
import type { Channel, ChannelHelper } from '../../../src/core/channel';
import * as lark from '@larksuiteoapi/node-sdk';
import { getLogger } from '@logtape/logtape';

const log = getLogger(['feishu']);

/** 飞书通道配置 */
interface FeishuConfig {
  appId: string;
  appSecret: string;
  allowFrom: string[];
}

/** 飞书消息事件数据 */
interface FeishuMessageData {
  event: {
    message: {
      message_id: string;
      chat_id: string;
      chat_type: 'p2p' | 'group';
      message_type: string;
      content: string;
    };
    sender: {
      sender_type: string;
      sender_id?: {
        open_id?: string;
      };
    };
  };
}

/** 媒体资源类型 */
interface MediaResource {
  type: 'image' | 'file' | 'audio' | 'video';
  fileKey: string;
  url?: string;
  fileName?: string;
  fileSize?: number;
  duration?: number;
}

/** 飞书图片消息内容 */
interface ImageContent {
  file_key: string;
  image_key?: string;
}

/** 飞书文件消息内容 */
interface FileContent {
  file_key: string;
  file_name: string;
  file_size: number;
}

/** 飞书语音消息内容 */
interface AudioContent {
  file_key: string;
  duration: number;
}

/** 飞书视频消息内容 */
interface VideoContent {
  file_key: string;
  duration: number;
  file_size: number;
}

/**
 * 飞书通道
 */
export class FeishuChannel implements Channel {
  readonly name: ChannelType = 'feishu';
  private client: lark.Client | null = null;
  private wsClient: lark.WSClient | null = null;
  private processedMessageIds = new Set<string>();
  private readonly MAX_PROCESSED_IDS = 500;
  private _running = false;

  constructor(
    private bus: MessageBus,
    private config: FeishuConfig,
    private helper: ChannelHelper
  ) {}

  get isRunning(): boolean {
    return this._running;
  }

  async start(): Promise<void> {
    const baseConfig = {
      appId: this.config.appId,
      appSecret: this.config.appSecret,
    };

    this.client = new lark.Client(baseConfig);

    const eventDispatcher = new lark.EventDispatcher({}).register({
      'im.message.receive_v1': async (data: unknown) => {
        await this.handleMessage(data as FeishuMessageData);
      },
    });

    this.wsClient = new lark.WSClient({
      ...baseConfig,
      loggerLevel: lark.LoggerLevel.error,
    });

    this.wsClient.start({ eventDispatcher });
    this._running = true;
    log.info('飞书通道已启动 (WebSocket 长连接)');
  }

  async stop(): Promise<void> {
    this.wsClient = null;
    this.client = null;
    this._running = false;
    log.info('飞书通道已停止');
  }

  async send(msg: OutboundMessage): Promise<void> {
    if (!this.client) {
      throw new Error('飞书通道未启动');
    }

    const receiveIdType = msg.chatId.startsWith('ou_') ? 'open_id' : 'chat_id';
    const content = lark.messageCard.defaultCard({
      title: '',
      content: msg.content,
    });

    try {
      const response = await this.client.im.message.create({
        params: { receive_id_type: receiveIdType as 'chat_id' | 'open_id' },
        data: {
          receive_id: msg.chatId,
          content,
          msg_type: 'interactive',
        },
      });
      if (response.code !== 0) {
        log.error('发送失败: {msg}', { msg: response.msg });
      }
    } catch (error) {
      log.error('发送飞书消息失败: {error}', { error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  private async handleMessage(data: unknown): Promise<void> {
    try {
      let message: { message_id: string; chat_id: string; chat_type: string; message_type: string; content: string } | undefined;
      let sender: { sender_type?: string; sender_id?: { open_id?: string } } | undefined;

      const dataObj = data as Record<string, unknown>;
      
      if (dataObj.message) {
        message = dataObj.message as typeof message;
        sender = dataObj.sender as typeof sender;
      } else if (dataObj.event) {
        const event = dataObj.event as Record<string, unknown>;
        message = event.message as typeof message;
        sender = event.sender as typeof sender;
      }

      if (!message) {
        log.error('无法解析消息数据');
        return;
      }

      const messageId = message.message_id;
      if (this.processedMessageIds.has(messageId)) return;
      this.processedMessageIds.add(messageId);

      if (this.processedMessageIds.size > this.MAX_PROCESSED_IDS) {
        const ids = Array.from(this.processedMessageIds);
        this.processedMessageIds = new Set(ids.slice(-this.MAX_PROCESSED_IDS / 2));
      }

      if (sender?.sender_type === 'bot') return;

      const senderId = sender?.sender_id?.open_id || 'unknown';
      const chatId = message.chat_id;
      const chatType = message.chat_type;
      const msgType = message.message_type;

      await this.addReaction(messageId, 'THUMBSUP');

      // 解析消息内容
      const { content, media } = await this.parseMessageContent(
        messageId,
        msgType,
        message.content
      );

      if (!content.trim() && media.length === 0) return;

      const replyTo = chatType === 'group' ? chatId : senderId;
      const chatTypeLabel = chatType === 'p2p' ? '私聊' : '群聊';
      const mediaInfo = media.length > 0 ? ` (+${media.length}个媒体)` : '';
      log.info('飞书消息 [{type}]: "{content}"{media}', { 
        type: chatTypeLabel, 
        content: content.slice(0, 30) || '[媒体消息]', 
        media: mediaInfo 
      });

      await this.helper.handleInbound(this.name, senderId, replyTo, content, media, {
        messageId,
        chatType,
        msgType,
      });
    } catch (error) {
      log.error('处理飞书消息失败: {error}', { error: error instanceof Error ? error.message : String(error) });
    }
  }

  /**
   * 解析消息内容，提取文本和媒体资源
   */
  private async parseMessageContent(
    messageId: string,
    msgType: string,
    rawContent: string
  ): Promise<{ content: string; media: string[] }> {
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
          // 飞书图片消息使用 image_key，不是 file_key
          const imageKey = parsed.image_key || parsed.file_key;
          log.debug('图片消息: messageId={messageId}, imageKey={imageKey}', { messageId, imageKey });
          if (imageKey) {
            const imgUrl = await this.getImageResource(messageId, imageKey);
            if (imgUrl) {
              media.push(imgUrl);
              content = '请帮我分析这张图片';
            }
          }
          break;

        case 'file':
          const fileContent = parsed as FileContent;
          content = `[文件: ${fileContent.file_name}]`;
          const fileUrl = await this.getResourceUrl(messageId, fileContent.file_key, 'file');
          if (fileUrl) {
            media.push(fileUrl);
          }
          break;

        case 'audio':
          const audioContent = parsed as AudioContent;
          content = `[语音: ${audioContent.duration}秒]`;
          const audioUrl = await this.getResourceUrl(messageId, audioContent.file_key, 'audio');
          if (audioUrl) {
            media.push(audioUrl);
          }
          break;

        case 'video':
          const videoContent = parsed as VideoContent;
          content = `[视频: ${videoContent.duration}秒]`;
          const videoUrl = await this.getResourceUrl(messageId, videoContent.file_key, 'video');
          if (videoUrl) {
            media.push(videoUrl);
          }
          break;

        case 'sticker':
          content = '[表情]';
          // 表情图片
          const stickerUrl = await this.getResourceUrl(messageId, parsed.file_key, 'image');
          if (stickerUrl) {
            media.push(stickerUrl);
          }
          break;

        case 'post':
          // 富文本消息，提取纯文本
          content = this.extractPostText(parsed);
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
   * 获取图片资源
   * 
   * 注意：飞书 im.image.get API 只能下载应用自己上传的图片
   * 用户发送的图片需要通过 messageResource API 获取
   */
  private async getImageResource(messageId: string, imageKey: string): Promise<string | null> {
    if (!this.client || !imageKey) {
      log.warn('获取图片资源失败: client 或 imageKey 为空');
      return null;
    }

    try {
      log.debug('获取飞书图片: messageId={messageId}, imageKey={imageKey}', { messageId, imageKey });

      // 尝试使用 messageResource API 获取图片（需要 message_id）
      if (messageId) {
        const response = await this.client.im.messageResource.get({
          path: {
            message_id: messageId,
            file_key: imageKey,
          },
          params: {
            type: 'image',
          },
        });

        log.debug('飞书 messageResource API 响应: code={code}', { code: response.code });

        // 检查是否有 code 字段（SDK 包装的响应）或直接是图片响应
        const respCode = (response as { code?: number }).code;
        const respHeaders = (response as { headers?: Record<string, string> }).headers;
        const contentType = respHeaders?.['content-type'] || '';
        
        if (respCode === 0) {
          // 标准 SDK 响应格式
          const data = (response as { data: unknown }).data as unknown;

          // 处理 ArrayBuffer
          if (data instanceof ArrayBuffer) {
            log.debug('图片数据类型: ArrayBuffer, size={size}', { size: data.byteLength });
            return this.arrayBufferToDataUri(data, 'image');
          }

          // 处理 Buffer (Node.js)
          if (Buffer.isBuffer(data)) {
            log.debug('图片数据类型: Buffer, size={size}', { size: data.length });
            return this.bufferToDataUri(data, 'image');
          }

          // 处理 ReadableStream
          if (data && typeof data === 'object' && typeof (data as ReadableStream).getReader === 'function') {
            log.debug('图片数据类型: ReadableStream');
            const chunks: Uint8Array[] = [];
            const reader = (data as ReadableStream).getReader();

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              if (value) chunks.push(value);
            }

            const buffer = Buffer.concat(chunks);
            log.debug('ReadableStream 读取完成: size={size}', { size: buffer.length });
            return this.bufferToDataUri(buffer, 'image');
          }

          log.warn('未知的图片数据类型: {type}', { type: typeof data });
        } else if (contentType.startsWith('image/')) {
          // SDK 直接返回了图片数据（没有 code 字段）
          log.debug('SDK 直接返回图片: contentType={contentType}', { contentType });
          
          // 尝试从 response 获取图片数据
          const data = (response as { data?: unknown }).data;
          if (data instanceof ArrayBuffer) {
            return this.arrayBufferToDataUri(data, 'image');
          }
          if (Buffer.isBuffer(data)) {
            return this.bufferToDataUri(data, 'image');
          }
          
          // 检查是否有 body 属性（原生 Response 对象）
          const respBody = (response as { body?: unknown }).body;
          if (respBody instanceof ArrayBuffer) {
            return this.arrayBufferToDataUri(respBody, 'image');
          }
          
          // 检查是否有 getReadableStream 方法（SDK 特殊响应格式）
          const getStream = (response as { getReadableStream?: () => unknown }).getReadableStream;
          if (typeof getStream === 'function') {
            log.debug('使用 getReadableStream 获取图片数据');
            const stream = getStream.call(response);
            
            // 检查是否有 writeFile 方法
            const writeFn = (response as { writeFile?: (path: string) => Promise<void> }).writeFile;
            if (typeof writeFn === 'function') {
              // 使用 writeFile 保存到临时文件
              const tmpPath = require('path').join(require('os').tmpdir(), `feishu-img-${Date.now()}.jpg`);
              await writeFn.call(response, tmpPath);
              log.debug('图片已保存到临时文件: {path}', { path: tmpPath });
              
              // 读取文件并转换为 data URI
              const fileBuffer = require('fs').readFileSync(tmpPath);
              log.debug('图片读取完成: size={size}', { size: fileBuffer.length });
              
              // 删除临时文件
              require('fs').unlinkSync(tmpPath);
              
              return this.bufferToDataUri(fileBuffer, 'image');
            }
            
            // 如果是 Node.js Readable 流
            if (stream && typeof stream === 'object' && typeof (stream as NodeJS.ReadableStream).on === 'function') {
              const chunks: Buffer[] = [];
              return new Promise((resolve) => {
                (stream as NodeJS.ReadableStream).on('data', (chunk: Buffer) => chunks.push(chunk));
                (stream as NodeJS.ReadableStream).on('end', () => {
                  const buffer = Buffer.concat(chunks);
                  log.debug('Node.js Stream 读取完成: size={size}', { size: buffer.length });
                  resolve(this.bufferToDataUri(buffer, 'image'));
                });
                (stream as NodeJS.ReadableStream).on('error', (err: Error) => {
                  log.error('读取流失败: {error}', { error: err.message });
                  resolve(null);
                });
              });
            }
            
            // 尝试作为 ReadableStream 处理
            if (stream && typeof (stream as ReadableStream).getReader === 'function') {
              const chunks: Uint8Array[] = [];
              const reader = (stream as ReadableStream).getReader();
              
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                if (value) chunks.push(value);
              }
              
              const buffer = Buffer.concat(chunks);
              log.debug('ReadableStream 读取完成: size={size}', { size: buffer.length });
              return this.bufferToDataUri(buffer, 'image');
            }
            
            log.warn('getReadableStream 返回的对象无法处理: streamType={type}', { 
              type: typeof stream,
              streamKeys: stream ? Object.keys(stream as object).join(',') : 'null',
            });
          }
          
          // 打印所有键以便调试
          log.warn('SDK 返回图片但无法解析数据, keys={keys}', { 
            keys: Object.keys(response).join(','),
          });
        } else if (respCode === undefined) {
          log.warn('获取图片失败: 无效响应, response={response}', { 
            response: JSON.stringify(response).substring(0, 200),
          });
        } else {
          log.warn('获取图片失败: code={code}', { code: respCode });
        }
      }

      return null;
    } catch (error) {
      const err = error as { response?: { data?: unknown }; message?: string };
      const errorData = err.response?.data;
      log.error('获取飞书图片失败: {error}, responseData={data}', {
        error: error instanceof Error ? error.message : String(error),
        data: errorData ? JSON.stringify(errorData) : 'none'
      });
      return null;
    }
  }

  /**
   * 获取资源并转换为 base64 data URI
   * 
   * 飞书 API 返回文件二进制流，需要转换成 data URI 格式供视觉模型使用
   */
  private async getResourceUrl(
    messageId: string,
    fileKey: string,
    type: 'image' | 'file' | 'audio' | 'video'
  ): Promise<string | null> {
    if (!this.client || !fileKey) {
      log.warn('获取资源失败: client 或 fileKey 为空');
      return null;
    }

    try {
      log.debug('获取飞书资源: messageId={messageId}, fileKey={fileKey}, type={type}', {
        messageId,
        fileKey,
        type,
      });

      // 调用飞书 API 获取资源文件
      const response = await this.client.im.messageResource.get({
        path: { 
          message_id: messageId,
          file_key: fileKey,
        },
        params: { 
          type: type as 'image' | 'file' | 'audio' | 'video',
        },
      });

      log.debug('飞书 API 响应: code={code}, dataType={dataType}', {
        code: response.code,
        dataType: typeof response.data,
      });

      // 飞书 API 返回文件二进制流
      if (response.code === 0) {
        const data = response.data as unknown;
        
        // 尝试转换为 base64 data URI
        if (data instanceof ArrayBuffer) {
          log.debug('资源数据类型: ArrayBuffer, size={size}', { size: data.byteLength });
          return this.arrayBufferToDataUri(data, type);
        }
        
        // 如果是 Blob（浏览器环境）
        if (typeof Blob !== 'undefined' && data instanceof Blob) {
          log.debug('资源数据类型: Blob, size={size}', { size: data.size });
          const buffer = await data.arrayBuffer();
          return this.arrayBufferToDataUri(buffer, type);
        }
        
        // 如果是 Buffer（Node.js 环境）
        if (Buffer.isBuffer(data)) {
          log.debug('资源数据类型: Buffer, size={size}', { size: data.length });
          return this.bufferToDataUri(data, type);
        }
        
        // 如果返回的是 ReadableStream
        if (data && typeof data === 'object') {
          // 检查是否有 getReader 方法（ReadableStream）
          if (typeof (data as ReadableStream).getReader === 'function') {
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
            return this.bufferToDataUri(buffer, type);
          }
          
          // 检查是否是 fs.ReadStream 或类似流对象
          if ('pipe' in data && typeof (data as NodeJS.ReadableStream).pipe === 'function') {
            log.debug('资源数据类型: NodeJS.ReadableStream');
            const chunks: Buffer[] = [];
            
            return new Promise((resolve) => {
              (data as NodeJS.ReadableStream).on('data', (chunk: Buffer) => {
                chunks.push(chunk);
              });
              (data as NodeJS.ReadableStream).on('end', () => {
                const buffer = Buffer.concat(chunks);
                log.debug('NodeJS.ReadableStream 读取完成: size={size}', { size: buffer.length });
                resolve(this.bufferToDataUri(buffer, type));
              });
              (data as NodeJS.ReadableStream).on('error', (err: Error) => {
                log.error('读取流失败: {error}', { error: err.message });
                resolve(null);
              });
            });
          }
        }
        
        log.warn('未知的资源数据类型: {type}, constructor={constructor}', { 
          type: typeof data, 
          constructor: data?.constructor?.name || 'unknown' 
        });
      }
      
      log.warn('获取资源失败: code={code}, msg={msg}', { 
        code: response.code, 
        msg: (response as unknown as { msg?: string }).msg || 'unknown' 
      });
      return null;
    } catch (error) {
      log.error('获取飞书资源失败: {error}', { error: error instanceof Error ? error.message : String(error) });
      return null;
    }
  }

  /**
   * ArrayBuffer 转 data URI
   */
  private arrayBufferToDataUri(buffer: ArrayBuffer, type: string): string {
    const uint8Array = new Uint8Array(buffer);
    const base64 = Buffer.from(uint8Array).toString('base64');
    const mimeType = this.getMimeType(type);
    return `data:${mimeType};base64,${base64}`;
  }

  /**
   * Buffer 转 data URI
   */
  private bufferToDataUri(buffer: Buffer, type: string): string {
    const base64 = buffer.toString('base64');
    const mimeType = this.getMimeType(type);
    return `data:${mimeType};base64,${base64}`;
  }

  /**
   * 获取 MIME 类型
   */
  private getMimeType(type: string): string {
    const mimeMap: Record<string, string> = {
      image: 'image/png',
      file: 'application/octet-stream',
      audio: 'audio/mpeg',
      video: 'video/mp4',
    };
    return mimeMap[type] || 'application/octet-stream';
  }

  /**
   * 从富文本消息中提取纯文本
   */
  private extractPostText(postContent: unknown): string {
    if (!postContent || typeof postContent !== 'object') return '';
    
    const content = postContent as Record<string, unknown>;
    const blocks = content.content as Array<Record<string, unknown>> | undefined;
    if (!blocks || !Array.isArray(blocks)) return '';

    const texts: string[] = [];
    
    for (const block of blocks) {
      const paragraphs = block.paragraph?.elements as Array<Record<string, unknown>> | undefined;
      if (!paragraphs) continue;
      
      for (const elem of paragraphs) {
        if (elem.text_run?.content) {
          texts.push(elem.text_run.content as string);
        }
      }
    }

    return texts.join('\n');
  }

  private async addReaction(messageId: string, emojiType: string): Promise<void> {
    if (!this.client) return;

    try {
      await this.client.im.messageReaction.create({
        path: { message_id: messageId },
        data: {
          reaction_type: { emoji_type: emojiType },
        },
      });
    } catch {
      // 忽略反应失败
    }
  }
}
