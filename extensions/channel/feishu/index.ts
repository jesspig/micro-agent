/**
 * 飞书通道扩展
 * 
 * 使用 WebSocket 长连接接收消息，无需公网 IP。
 * 支持多模态输入：文本、图片、文件、语音、视频。
 */

export { FeishuChannel } from './channel';
export type {
  FeishuConfig,
  FeishuMessageData,
  MediaResource,
  ImageContent,
  FileContent,
  AudioContent,
  VideoContent,
  ParsedMessage,
} from './types';