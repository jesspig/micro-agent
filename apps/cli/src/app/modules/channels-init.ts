/**
 * Channel 初始化模块
 *
 * 负责初始化消息通道
 */

import type { ChannelManager, MessageBus, Config } from '@micro-agent/sdk';

/** 飞书通道配置接口 */
interface FeishuChannelConfig {
  enabled?: boolean;
  appId?: string;
  appSecret?: string;
  allowFrom?: string[];
}

/**
 * 初始化所有通道
 */
export function initChannels(
  config: Config,
  channelManager: ChannelManager,
  messageBus: MessageBus,
  FeishuChannel: new (messageBus: MessageBus, config: { appId: string; appSecret: string; allowFrom: string[] }) => unknown
): void {
  const channels = config.channels;

  if (channels.feishu && isFeishuChannelEnabled(channels.feishu)) {
    registerFeishuChannel(channels.feishu, channelManager, messageBus, FeishuChannel);
  }
}

/**
 * 检查飞书通道是否启用
 */
function isFeishuChannelEnabled(feishuConfig: FeishuChannelConfig): boolean {
  return !!(
    feishuConfig.enabled &&
    feishuConfig.appId &&
    feishuConfig.appSecret
  );
}

/**
 * 注册飞书通道
 */
function registerFeishuChannel(
  feishuConfig: FeishuChannelConfig,
  channelManager: ChannelManager,
  messageBus: MessageBus,
  FeishuChannel: new (messageBus: MessageBus, config: { appId: string; appSecret: string; allowFrom: string[] }) => unknown
): void {
  const channel = new FeishuChannel(messageBus, {
    appId: feishuConfig.appId!,
    appSecret: feishuConfig.appSecret!,
    allowFrom: feishuConfig.allowFrom ?? [],
  });
  channelManager.register(channel as unknown as import('@micro-agent/sdk').Channel);
}