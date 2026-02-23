/**
 * 飞书通道实现
 */

import type { OutboundMessage, InboundMessage, ChannelType, Channel } from '@microbot/types';
import type { MessageBus } from '@microbot/runtime';
import { Client, WSClient, EventDispatcher, LoggerLevel, messageCard } from '@larksuiteoapi/node-sdk';
import { getLogger } from '@logtape/logtape';
import type { FeishuConfig, FeishuMessageData } from './types';
import { parseMessageContent } from './message';

const log = getLogger(['feishu']);

/**
 * 飞书通道
 *
 * 通过 WebSocket 长连接接收飞书消息，支持私聊和群聊。
 */
export class FeishuChannel implements Channel {
  /** 通道类型 */
  readonly name: ChannelType = 'feishu';
  /** Lark 客户端 */
  private client: Client | null = null;
  /** WebSocket 客户端 */
  private wsClient: WSClient | null = null;
  /** 已处理消息 ID 集合 */
  private processedMessageIds = new Set<string>();
  /** 最大已处理 ID 数量 */
  private readonly MAX_PROCESSED_IDS = 500;
  /** 运行状态 */
  private _running = false;
  /** 最后活跃的聊天 ID（用于广播） */
  private lastChatId: string | null = null;

  /**
   * 创建飞书通道实例
   * @param bus - 消息总线
   * @param config - 飞书配置
   */
  constructor(
    private bus: MessageBus,
    private config: FeishuConfig
  ) {}

  /** 获取运行状态 */
  get isRunning(): boolean {
    return this._running;
  }

  /**
   * 启动飞书通道
   * @returns Promise
   */
  async start(): Promise<void> {
    const baseConfig = {
      appId: this.config.appId,
      appSecret: this.config.appSecret,
    };

    this.client = new Client(baseConfig);

    const eventDispatcher = new EventDispatcher({}).register({
      'im.message.receive_v1': async (data: unknown) => {
        await this.handleMessage(data as FeishuMessageData);
      },
    });

    this.wsClient = new WSClient({
      ...baseConfig,
      loggerLevel: LoggerLevel.error,
    });

    this.wsClient.start({ eventDispatcher });
    this._running = true;
    log.info('飞书通道已启动');
  }

  /**
   * 停止飞书通道
   * @returns Promise
   */
  async stop(): Promise<void> {
    this.wsClient = null;
    this.client = null;
    this._running = false;
    log.info('飞书通道已停止');
  }

  /**
   * 发送消息
   * @param msg - 出站消息
   * @returns Promise
   */
  async send(msg: OutboundMessage): Promise<void> {
    if (!this.client) {
      throw new Error('飞书通道未启动');
    }

    // 广播时使用记住的 chatId
    const chatId = msg.chatId === 'default' ? this.lastChatId : msg.chatId;
    if (!chatId) {
      log.warn('无可用 chatId，跳过发送');
      return;
    }

    const receiveIdType = chatId.startsWith('ou_') ? 'open_id' : 'chat_id';
    const content = messageCard.defaultCard({
      title: '',
      content: msg.content,
    });

    try {
      const response = await this.client.im.message.create({
        params: { receive_id_type: receiveIdType as 'chat_id' | 'open_id' },
        data: {
          receive_id: chatId,
          content,
          msg_type: 'interactive',
        },
      });
      if (response.code !== 0) {
        log.error('发送失败', { msg: response.msg });
      }
    } catch (error) {
      log.error('发送飞书消息失败', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * 处理接收到的消息
   * @param data - 消息数据
   */
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

      // 检查发送者权限
      if (!this.isSenderAllowed(senderId)) {
        log.debug('发送者不在允许列表中', { senderId });
        return;
      }

      await this.addReaction(messageId, 'THUMBSUP');

      const { content, media } = await parseMessageContent(
        this.client!,
        messageId,
        msgType,
        message.content
      );

      if (!content.trim() && media.length === 0) return;

      const replyTo = chatType === 'group' ? chatId : senderId;
      const mediaInfo = media.length > 0 ? ` (+${media.length}个媒体)` : '';

      // 详细日志（文件）
      log.debug('飞书消息', {
        chatType,
        chatId: replyTo,
        senderId,
        content: content.slice(0, 100),
        mediaCount: media.length,
      });

      // 记住活跃的 chatId（用于广播）
      this.lastChatId = replyTo;

      // 发布入站消息到总线
      const inboundMsg: InboundMessage = {
        channel: this.name,
        senderId,
        chatId: replyTo,
        content,
        media,
        timestamp: new Date(),
        metadata: { messageId, chatType, msgType },
      };

      await this.bus.publishInbound(inboundMsg);
    } catch (error) {
      log.error('处理飞书消息失败', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * 检查发送者是否在允许列表中
   * @param senderId - 发送者 ID
   * @returns 是否允许
   */
  private isSenderAllowed(senderId: string): boolean {
    const allowFrom = this.config.allowFrom;
    if (!allowFrom || allowFrom.length === 0) {
      return true; // 未配置允许列表时，允许所有人
    }
    return allowFrom.includes(senderId) || allowFrom.includes('*');
  }

  /**
   * 添加消息反应
   * @param messageId - 消息 ID
   * @param emojiType - 表情类型
   */
  private async addReaction(messageId: string, emojiType: string): Promise<void> {
    if (!this.client) return;

    try {
      await this.client.im.messageReaction.create({
        path: { message_id: messageId },
        data: { reaction_type: { emoji_type: emojiType } },
      });
    } catch {
      // 忽略反应失败
    }
  }
}
