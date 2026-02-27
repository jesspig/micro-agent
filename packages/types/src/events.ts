/**
 * 事件类型定义
 */

/** 钩子类型常量 */
export const HOOK_TYPES = [
  'pre:inbound',
  'post:inbound',
  'pre:outbound',
  'post:outbound',
  'pre:tool',
  'post:tool',
  'pre:llm',
  'post:llm',
] as const;

/** 钩子类型 */
export type HookType = typeof HOOK_TYPES[number];

/** 消息事件类型常量 */
export const MESSAGE_EVENT_TYPES = [
  'message:received',
  'message:beforeProcess',
  'message:afterProcess',
  'message:sent',
] as const;

/** 消息事件类型 */
export type MessageEventType = typeof MESSAGE_EVENT_TYPES[number];

/** 工具事件类型常量 */
export const TOOL_EVENT_TYPES = [
  'tool:beforeExecute',
  'tool:afterExecute',
] as const;

/** 工具事件类型 */
export type ToolEventType = typeof TOOL_EVENT_TYPES[number];

/** LLM 事件类型常量 */
export const LLM_EVENT_TYPES = [
  'llm:beforeCall',
  'llm:afterCall',
] as const;

/** LLM 事件类型 */
export type LLMEventType = typeof LLM_EVENT_TYPES[number];

/** 通道事件类型常量 */
export const CHANNEL_EVENT_TYPES = [
  'channel:connected',
  'channel:disconnected',
  'channel:error',
] as const;

/** 通道事件类型 */
export type ChannelEventType = typeof CHANNEL_EVENT_TYPES[number];

/** 系统事件类型常量 */
export const SYSTEM_EVENT_TYPES = [
  'system:started',
  'system:stopping',
  'error',
] as const;

/** 系统事件类型 */
export type SystemEventType = typeof SYSTEM_EVENT_TYPES[number];

/** 所有事件类型常量 */
export const EVENT_TYPES = [
  ...MESSAGE_EVENT_TYPES,
  ...TOOL_EVENT_TYPES,
  ...LLM_EVENT_TYPES,
  ...CHANNEL_EVENT_TYPES,
  ...SYSTEM_EVENT_TYPES,
] as const;

/** 所有事件类型 */
export type EventType = typeof EVENT_TYPES[number];

/** 事件处理器 */
export type EventHandler = (payload: unknown) => void | Promise<void>;

/**
 * 检查是否为有效的事件类型
 * @param type - 事件类型字符串
 * @returns 是否有效
 */
export function isValidEventType(type: string): type is EventType {
  return EVENT_TYPES.includes(type as EventType);
}
