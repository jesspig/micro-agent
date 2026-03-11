/**
 * Channel 模块入口
 * 
 * 导出 Channel 模块的所有公共类型和实现
 */

// 类型导出
export type {
  ChannelType,
  ChannelConfig,
  ChannelStatus,
  InboundMessage,
  OutboundMessage,
  SendResult,
  ChannelCapabilities,
} from "./types.js";

export type {
  IChannelExtended,
  MessageHandler,
} from "./contract.js";

// 实现导出
export { BaseChannel } from "./base.js";
export { ChannelManager } from "./manager.js";
