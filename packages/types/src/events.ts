/**
 * 事件类型定义
 */

/** 钩子类型 */
export type HookType =
  | 'pre:inbound'
  | 'post:inbound'
  | 'pre:outbound'
  | 'post:outbound'
  | 'pre:tool'
  | 'post:tool'
  | 'pre:llm'
  | 'post:llm';

/** 消息事件类型 */
export type MessageEventType =
  | 'message:received'
  | 'message:beforeProcess'
  | 'message:afterProcess'
  | 'message:sent';

/** 工具事件类型 */
export type ToolEventType =
  | 'tool:beforeExecute'
  | 'tool:afterExecute';

/** LLM 事件类型 */
export type LLMEventType =
  | 'llm:beforeCall'
  | 'llm:afterCall';

/** 通道事件类型 */
export type ChannelEventType =
  | 'channel:connected'
  | 'channel:disconnected'
  | 'channel:error';

/** 系统事件类型 */
export type SystemEventType =
  | 'system:started'
  | 'system:stopping'
  | 'error';

/** 所有事件类型 */
export type EventType =
  | MessageEventType
  | ToolEventType
  | LLMEventType
  | ChannelEventType
  | SystemEventType;

/** 事件处理器 */
export type EventHandler = (payload: unknown) => void | Promise<void>;
