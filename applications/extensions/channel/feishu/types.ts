/**
 * 飞书通道类型定义
 */

/** 飞书通道配置 */
export interface FeishuConfig {
  appId: string;
  appSecret: string;
  allowFrom: string[];
}

/** 飞书消息事件数据 */
export interface FeishuMessageData {
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
export interface MediaResource {
  type: 'image' | 'file' | 'audio' | 'video';
  fileKey: string;
  url?: string;
  fileName?: string;
  fileSize?: number;
  duration?: number;
}

/** 飞书图片消息内容 */
export interface ImageContent {
  file_key: string;
  image_key?: string;
}

/** 飞书文件消息内容 */
export interface FileContent {
  file_key: string;
  file_name: string;
  file_size: number;
}

/** 飞书语音消息内容 */
export interface AudioContent {
  file_key: string;
  duration: number;
}

/** 飞书视频消息内容 */
export interface VideoContent {
  file_key: string;
  duration: number;
  file_size: number;
}

/** 解析后的消息内容 */
export interface ParsedMessage {
  content: string;
  media: string[];
}
