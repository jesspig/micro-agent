/**
 * QQ 频道机器人 API 调用模块
 * 
 * 封装消息发送、更新等 HTTP API 调用
 */

import type { SendResult } from "../../../runtime/channel/types.js";
import type { QQApiResponse } from "./types.js";
import { QQAuth } from "./auth.js";
import { truncateMessage, MAX_MESSAGE_LENGTH, truncateForLog } from "../../shared/security.js";
import { channelsLogger, createTimer, sanitize, logMethodCall, logMethodReturn, logMethodError } from "../../shared/logger.js";

const logger = channelsLogger();

/** 模块名称常量 */
const MODULE_NAME = "QQApi";

/**
 * QQ API 调用器
 */
export class QQApi {
  constructor(private auth: QQAuth) {
    logger.debug("创建 QQApi 实例");
  }

  /**
   * 发送频道消息
   */
  async sendChannelMessage(
    channelId: string,
    text: string,
    isMarkdown?: boolean
  ): Promise<SendResult> {
    const timer = createTimer();
    logMethodCall(logger, { method: "sendChannelMessage", module: MODULE_NAME, params: { channelId, isMarkdown } });

    try {
      const token = await this.auth.getAccessToken();
      const content = truncateMessage(text, MAX_MESSAGE_LENGTH);

      logger.info("发送频道消息", { channelId, isMarkdown, content: truncateForLog(content) });

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
        logger.warn("频道消息发送失败", { channelId, status: response.status, error: errorText });
        const result = { success: false, error: `发送失败: ${response.status} ${errorText}` };
        logMethodReturn(logger, { method: "sendChannelMessage", module: MODULE_NAME, result, duration: timer() });
        return result;
      }

      const data = (await response.json()) as QQApiResponse;

      // 检查业务错误
      if (data.code) {
        logger.warn("频道消息发送业务错误", { channelId, code: data.code, message: data.message });
        const result = { success: false, error: `${data.message || "发送失败"} (code: ${data.code})` };
        logMethodReturn(logger, { method: "sendChannelMessage", module: MODULE_NAME, result, duration: timer() });
        return result;
      }

      const result: SendResult = { success: true };
      if (data.id) {
        result.messageId = `${channelId}:${data.id}`;
        result.metadata = { rawMessageId: data.id, channelId };
        logger.info("频道消息发送成功", { channelId, messageId: result.messageId });
      }
      logMethodReturn(logger, { method: "sendChannelMessage", module: MODULE_NAME, result: sanitize(result), duration: timer() });
      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logMethodError(logger, { method: "sendChannelMessage", module: MODULE_NAME, error: { name: err.name, message: err.message, stack: err.stack }, params: { channelId }, duration: timer() });
      return { success: false, error: err.message };
    }
  }

  /**
   * 发送群聊消息
   */
  async sendGroupMessage(
    groupId: string,
    text: string,
    isMarkdown?: boolean
  ): Promise<SendResult> {
    const timer = createTimer();
    logMethodCall(logger, { method: "sendGroupMessage", module: MODULE_NAME, params: { groupId, isMarkdown } });

    try {
      const token = await this.auth.getAccessToken();
      const content = truncateMessage(text, MAX_MESSAGE_LENGTH);

      logger.info("发送群聊消息", { groupId, isMarkdown, content: truncateForLog(content) });

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
        logger.warn("群聊消息发送失败", { groupId, status: response.status, error: errorText });
        const result = { success: false, error: `群聊发送失败: ${response.status} ${errorText}` };
        logMethodReturn(logger, { method: "sendGroupMessage", module: MODULE_NAME, result, duration: timer() });
        return result;
      }

      const data = (await response.json()) as QQApiResponse;
      const result: SendResult = { success: true };
      if (data.id) {
        result.messageId = `group:${groupId}:${data.id}`;
        result.metadata = { rawMessageId: data.id, groupId };
        logger.info("群聊消息发送成功", { groupId, messageId: result.messageId });
      }
      logMethodReturn(logger, { method: "sendGroupMessage", module: MODULE_NAME, result: sanitize(result), duration: timer() });
      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logMethodError(logger, { method: "sendGroupMessage", module: MODULE_NAME, error: { name: err.name, message: err.message, stack: err.stack }, params: { groupId }, duration: timer() });
      return { success: false, error: err.message };
    }
  }

  /**
   * 发送单聊消息
   */
  async sendC2CMessage(
    userOpenid: string,
    text: string,
    isMarkdown?: boolean
  ): Promise<SendResult> {
    const timer = createTimer();
    logMethodCall(logger, { method: "sendC2CMessage", module: MODULE_NAME, params: { userOpenid, isMarkdown } });

    try {
      const token = await this.auth.getAccessToken();
      const content = truncateMessage(text, MAX_MESSAGE_LENGTH);

      logger.info("发送单聊消息", { userOpenid, isMarkdown, content: truncateForLog(content) });

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
        logger.warn("单聊消息发送失败", { userOpenid, status: response.status, error: errorText });
        const result = { success: false, error: `单聊发送失败: ${response.status} ${errorText}` };
        logMethodReturn(logger, { method: "sendC2CMessage", module: MODULE_NAME, result, duration: timer() });
        return result;
      }

      const data = (await response.json()) as QQApiResponse;
      const result: SendResult = { success: true };
      if (data.id) {
        result.messageId = `c2c:${userOpenid}:${data.id}`;
        result.metadata = { rawMessageId: data.id, userOpenid };
        logger.info("单聊消息发送成功", { userOpenid, messageId: result.messageId });
      }
      logMethodReturn(logger, { method: "sendC2CMessage", module: MODULE_NAME, result: sanitize(result), duration: timer() });
      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logMethodError(logger, { method: "sendC2CMessage", module: MODULE_NAME, error: { name: err.name, message: err.message, stack: err.stack }, params: { userOpenid }, duration: timer() });
      return { success: false, error: err.message };
    }
  }

  /**
   * 发送私聊消息
   */
  async sendDirectMessage(
    dmsId: string,
    text: string,
    isMarkdown?: boolean
  ): Promise<SendResult> {
    const timer = createTimer();
    logMethodCall(logger, { method: "sendDirectMessage", module: MODULE_NAME, params: { dmsId, isMarkdown } });

    try {
      const token = await this.auth.getAccessToken();
      const content = truncateMessage(text, MAX_MESSAGE_LENGTH);

      logger.info("发送私聊消息", { dmsId, isMarkdown, content: truncateForLog(content) });

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
        logger.warn("私聊消息发送失败", { dmsId, status: response.status, error: errorText });
        const result = { success: false, error: `私聊发送失败: ${response.status} ${errorText}` };
        logMethodReturn(logger, { method: "sendDirectMessage", module: MODULE_NAME, result, duration: timer() });
        return result;
      }

      const data = (await response.json()) as QQApiResponse;
      const result: SendResult = { success: true };
      if (data.id) {
        result.messageId = `dms:${dmsId}:${data.id}`;
        result.metadata = { rawMessageId: data.id, dmsId };
        logger.info("私聊消息发送成功", { dmsId, messageId: result.messageId });
      }
      logMethodReturn(logger, { method: "sendDirectMessage", module: MODULE_NAME, result: sanitize(result), duration: timer() });
      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logMethodError(logger, { method: "sendDirectMessage", module: MODULE_NAME, error: { name: err.name, message: err.message, stack: err.stack }, params: { dmsId }, duration: timer() });
      return { success: false, error: err.message };
    }
  }

  /**
   * 更新频道消息
   */
  async updateChannelMessage(
    channelId: string,
    messageId: string,
    text: string
  ): Promise<SendResult> {
    const timer = createTimer();
    logMethodCall(logger, { method: "updateChannelMessage", module: MODULE_NAME, params: { channelId, messageId } });

    try {
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

      const result = await this.handleUpdateResponse(response, messageId);
      if (result.success) {
        logger.info("频道消息更新成功", { channelId, messageId });
      }
      logMethodReturn(logger, { method: "updateChannelMessage", module: MODULE_NAME, result: sanitize(result), duration: timer() });
      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logMethodError(logger, { method: "updateChannelMessage", module: MODULE_NAME, error: { name: err.name, message: err.message, stack: err.stack }, params: { channelId, messageId }, duration: timer() });
      return { success: false, error: err.message };
    }
  }

  /**
   * 更新群聊消息
   */
  async updateGroupMessage(
    groupId: string,
    messageId: string,
    text: string
  ): Promise<SendResult> {
    const timer = createTimer();
    logMethodCall(logger, { method: "updateGroupMessage", module: MODULE_NAME, params: { groupId, messageId } });

    try {
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

      const result = await this.handleUpdateResponse(response, messageId);
      if (result.success) {
        logger.info("群聊消息更新成功", { groupId, messageId });
      }
      logMethodReturn(logger, { method: "updateGroupMessage", module: MODULE_NAME, result: sanitize(result), duration: timer() });
      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logMethodError(logger, { method: "updateGroupMessage", module: MODULE_NAME, error: { name: err.name, message: err.message, stack: err.stack }, params: { groupId, messageId }, duration: timer() });
      return { success: false, error: err.message };
    }
  }

  /**
   * 更新单聊消息
   */
  async updateC2CMessage(
    userOpenid: string,
    messageId: string,
    text: string
  ): Promise<SendResult> {
    const timer = createTimer();
    logMethodCall(logger, { method: "updateC2CMessage", module: MODULE_NAME, params: { userOpenid, messageId } });

    try {
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

      const result = await this.handleUpdateResponse(response, messageId);
      if (result.success) {
        logger.info("单聊消息更新成功", { userOpenid, messageId });
      }
      logMethodReturn(logger, { method: "updateC2CMessage", module: MODULE_NAME, result: sanitize(result), duration: timer() });
      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logMethodError(logger, { method: "updateC2CMessage", module: MODULE_NAME, error: { name: err.name, message: err.message, stack: err.stack }, params: { userOpenid, messageId }, duration: timer() });
      return { success: false, error: err.message };
    }
  }

  /**
   * 更新私聊消息
   */
  async updateDirectMessage(
    dmsId: string,
    messageId: string,
    text: string
  ): Promise<SendResult> {
    const timer = createTimer();
    logMethodCall(logger, { method: "updateDirectMessage", module: MODULE_NAME, params: { dmsId, messageId } });

    try {
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

      const result = await this.handleUpdateResponse(response, messageId);
      if (result.success) {
        logger.info("私聊消息更新成功", { dmsId, messageId });
      }
      logMethodReturn(logger, { method: "updateDirectMessage", module: MODULE_NAME, result: sanitize(result), duration: timer() });
      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logMethodError(logger, { method: "updateDirectMessage", module: MODULE_NAME, error: { name: err.name, message: err.message, stack: err.stack }, params: { dmsId, messageId }, duration: timer() });
      return { success: false, error: err.message };
    }
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