/**
 * defineChannel - 通道定义快捷函数
 */

import type { Channel, ChannelType, OutboundMessage } from '@microbot/types';

/**
 * 通道定义选项
 */
export interface DefineChannelOptions {
  /** 通道名称 */
  name: ChannelType;
  /** 启动函数 */
  start: () => Promise<void>;
  /** 停止函数 */
  stop: () => Promise<void>;
  /** 发送消息函数 */
  send: (msg: OutboundMessage) => Promise<void>;
}

/**
 * 定义通道
 * 
 * 快捷函数，用于创建符合 Channel 接口的对象。
 * 
 * @example
 * ```typescript
 * import { defineChannel } from 'microbot';
 * 
 * export const myChannel = defineChannel({
 *   name: 'my_channel',
 *   start: async () => {
 *     // 初始化连接
 *   },
 *   stop: async () => {
 *     // 关闭连接
 *   },
 *   send: async (msg) => {
 *     // 发送消息
 *   },
 * });
 * ```
 */
export function defineChannel(options: DefineChannelOptions): Channel {
  let running = false;

  return {
    name: options.name,
    get isRunning() {
      return running;
    },
    start: async () => {
      await options.start();
      running = true;
    },
    stop: async () => {
      await options.stop();
      running = false;
    },
    send: options.send,
  };
}
