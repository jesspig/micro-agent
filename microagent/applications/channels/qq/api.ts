/**
 * QQ 频道机器人 API 调用模块
 * 
 * 封装消息发送、更新等 HTTP API 调用
 */

import type { SendResult } from "../../../runtime/channel/types.js";
import type { QQApiResponse } from "./types.js";
import { QQAuth } from "./auth.js";
import { truncateMessage, MAX_MESSAGE_LENGTH } from "../../shared/security.js";

/**
 * QQ API 调用器
 */
export class QQApi {
  constructor(private auth: QQAuth) {}

  /**
   * 发送频道消息
   */
  async sendChannelMessage(
    channelId: string,
    text: string,
    isMarkdown?: boolean
  ): Promise<SendResult> {
    const token = await this.auth.getAccessToken();
    const content = truncateMessage(text, MAX_MESSAGE_LENGTH);

    const body = isMarkdown
      ? { markdown: { content } }
      : { content };

    const response = await fetch(`${this.auth.apiBase}/channels/${channelId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `QQBot ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: `发送失败: ${response.status} ${errorText}` };
    }

    const data = (await response.json()) as QQApiResponse;

    // 检查业务错误
    if (data.code) {
      return { success: false, error: `${data.message || "发送失败"} (code: ${data.code})` };
    }

    const result: SendResult = { success: true };
    if (data.id) {
      result.messageId = `${channelId}:${data.id}`;
      result.metadata = { rawMessageId: data.id, channelId };
    }
    return result;
  }

  /**
   * 发送群聊消息
   */
  async sendGroupMessage(
    groupId: string,
    text: string,
    isMarkdown?: boolean
  ): Promise<SendResult> {
    const token = await this.auth.getAccessToken();
    const content = truncateMessage(text, MAX_MESSAGE_LENGTH);

    const body = isMarkdown
      ? { markdown: { content }, msg_type: 2 }
      : { content, msg_type: 0 };

    const response = await fetch(`${this.auth.apiBase}/v2/groups/${groupId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `QQBot ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: `群聊发送失败: ${response.status} ${errorText}` };
    }

    const data = (await response.json()) as QQApiResponse;
    const result: SendResult = { success: true };
    if (data.id) {
      result.messageId = `group:${groupId}:${data.id}`;
      result.metadata = { rawMessageId: data.id, groupId };
    }
    return result;
  }

  /**
   * 发送单聊消息
   */
  async sendC2CMessage(
    userOpenid: string,
    text: string,
    isMarkdown?: boolean
  ): Promise<SendResult> {
    const token = await this.auth.getAccessToken();
    const content = truncateMessage(text, MAX_MESSAGE_LENGTH);

    const body = isMarkdown
      ? { markdown: { content }, msg_type: 2 }
      : { content, msg_type: 0 };

    const response = await fetch(`${this.auth.apiBase}/v2/users/${userOpenid}/messages`, {
      method: "POST",
      headers: {
        Authorization: `QQBot ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: `单聊发送失败: ${response.status} ${errorText}` };
    }

    const data = (await response.json()) as QQApiResponse;
    const result: SendResult = { success: true };
    if (data.id) {
      result.messageId = `c2c:${userOpenid}:${data.id}`;
      result.metadata = { rawMessageId: data.id, userOpenid };
    }
    return result;
  }

  /**
   * 发送私聊消息
   */
  async sendDirectMessage(
    dmsId: string,
    text: string,
    isMarkdown?: boolean
  ): Promise<SendResult> {
    const token = await this.auth.getAccessToken();
    const content = truncateMessage(text, MAX_MESSAGE_LENGTH);

    const body = isMarkdown
      ? { markdown: { content } }
      : { content };

    const response = await fetch(`${this.auth.apiBase}/dms/${dmsId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `QQBot ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: `私聊发送失败: ${response.status} ${errorText}` };
    }

    const data = (await response.json()) as QQApiResponse;
    const result: SendResult = { success: true };
    if (data.id) {
      result.messageId = `dms:${dmsId}:${data.id}`;
      result.metadata = { rawMessageId: data.id, dmsId };
    }
    return result;
  }

  /**
   * 更新频道消息
   */
  async updateChannelMessage(
    channelId: string,
    messageId: string,
    text: string
  ): Promise<SendResult> {
    const token = await this.auth.getAccessToken();
    const content = truncateMessage(text, MAX_MESSAGE_LENGTH);

    const response = await fetch(
      `${this.auth.apiBase}/channels/${channelId}/messages/${messageId}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `QQBot ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ content, msg_type: 0 }),
      }
    );

    return this.handleUpdateResponse(response, messageId);
  }

  /**
   * 更新群聊消息
   */
  async updateGroupMessage(
    groupId: string,
    messageId: string,
    text: string
  ): Promise<SendResult> {
    const token = await this.auth.getAccessToken();
    const content = truncateMessage(text, MAX_MESSAGE_LENGTH);

    const response = await fetch(
      `${this.auth.apiBase}/v2/groups/${groupId}/messages/${messageId}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `QQBot ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ content, msg_type: 0 }),
      }
    );

    return this.handleUpdateResponse(response, messageId);
  }

  /**
   * 更新单聊消息
   */
  async updateC2CMessage(
    userOpenid: string,
    messageId: string,
    text: string
  ): Promise<SendResult> {
    const token = await this.auth.getAccessToken();
    const content = truncateMessage(text, MAX_MESSAGE_LENGTH);

    const response = await fetch(
      `${this.auth.apiBase}/v2/users/${userOpenid}/messages/${messageId}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `QQBot ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ content, msg_type: 0 }),
      }
    );

    return this.handleUpdateResponse(response, messageId);
  }

  /**
   * 更新私聊消息
   */
  async updateDirectMessage(
    dmsId: string,
    messageId: string,
    text: string
  ): Promise<SendResult> {
    const token = await this.auth.getAccessToken();
    const content = truncateMessage(text, MAX_MESSAGE_LENGTH);

    const response = await fetch(
      `${this.auth.apiBase}/dms/${dmsId}/messages/${messageId}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `QQBot ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ content }),
      }
    );

    return this.handleUpdateResponse(response, messageId);
  }

  /**
   * 处理更新响应
   */
  private async handleUpdateResponse(
    response: Response,
    messageId: string
  ): Promise<SendResult> {
    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: `更新失败: ${response.status} ${errorText}` };
    }

    const data = (await response.json()) as QQApiResponse;

    if (data.code) {
      return { success: false, error: data.message || "更新失败" };
    }

    return { success: true, messageId: data.id || messageId };
  }
}
