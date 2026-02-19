/**
 * 工具扩展入口
 * 
 * 导出所有工具组件。
 */

// 文件系统工具
export { ReadFileTool, WriteFileTool, ListDirTool, filesystemTools } from './filesystem';

// Shell 工具
export { ExecTool, shellTools } from './shell';

// Web 工具
export { WebSearchTool, WebFetchTool, webTools } from './web';

// 消息工具
export { MessageTool, messageTools } from './message';

// 所有工具类数组（方便批量注册）
import { filesystemTools } from './filesystem';
import { shellTools } from './shell';
import { webTools } from './web';
import { messageTools } from './message';

export const allToolClasses = [
  ...filesystemTools,
  ...shellTools,
  ...webTools,
  ...messageTools,
];
