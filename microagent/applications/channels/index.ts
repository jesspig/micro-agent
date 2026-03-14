/**
 * Channel 实现导出
 * 
 * 提供各平台的机器人 Channel 实现，使用官方 SDK WebSocket 模式
 * - 无需公网服务器
 * - 自动重连
 * - 支持单聊和群聊
 */

// QQ 机器人 (使用 qq-botpy SDK)
export { QQChannel, createQQChannel, type QQBotConfig } from "./qq/index.js";

// 飞书机器人 (使用 @larksuiteoapi/node-sdk)
export { FeishuChannel, createFeishuChannel, type FeishuBotConfig } from "./feishu/index.js";

// 企业微信机器人 (使用 @wecom/aibot-node-sdk)
export { WechatWorkChannel, createWechatWorkChannel, type WechatWorkBotConfig } from "./wechat-work/index.js";

// 钉钉机器人 (使用 dingtalk-stream-sdk-nodejs)
export { DingTalkChannel, createDingTalkChannel, type DingTalkBotConfig } from "./dingtalk/index.js";

// 类型重导出
export type { ChannelConfig, ChannelStatus, InboundMessage, OutboundMessage, SendResult } from "../../runtime/channel/types.js";