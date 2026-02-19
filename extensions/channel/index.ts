/**
 * 通道扩展入口
 * 
 * 导出所有通道组件。
 */

// 飞书通道
export { FeishuChannel } from './feishu';

// 内置通道列表
import { FeishuChannel } from './feishu';

export const channelClasses = [FeishuChannel];