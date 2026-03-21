/**
 * 日志辅助函数
 */

import { getLogger, type Logger } from "@logtape/logtape";

/**
 * 获取指定分类的 Logger
 */
export function getModuleLogger(category: string[]): Logger {
  return getLogger(["microagent", ...category]);
}

/** Runtime Kernel */
export const kernelLogger = () => getModuleLogger(["runtime", "kernel"]);

/** Runtime Provider */
export const providerLogger = () => getModuleLogger(["runtime", "provider"]);

/** Runtime Tool */
export const toolLogger = () => getModuleLogger(["runtime", "tool"]);

/** Runtime Session */
export const sessionLogger = () => getModuleLogger(["runtime", "session"]);

/** Runtime Bus */
export const busLogger = () => getModuleLogger(["runtime", "bus"]);

/** Runtime Channel */
export const channelLogger = () => getModuleLogger(["runtime", "channel"]);

/** Runtime Memory */
export const memoryLogger = () => getModuleLogger(["runtime", "memory"]);

/** Runtime Skill */
export const skillLogger = () => getModuleLogger(["runtime", "skill"]);

/** Applications Builder */
export const builderLogger = () => getModuleLogger(["applications", "builder"]);

/** Applications Config */
export const configLogger = () => getModuleLogger(["applications", "config"]);

/** Applications CLI */
export const cliLogger = () => getModuleLogger(["applications", "cli"]);

/** Applications Providers */
export const providersLogger = () => getModuleLogger(["applications", "providers"]);

/** Applications Channels */
export const channelsLogger = () => getModuleLogger(["applications", "channels"]);

/** Applications Tools */
export const toolsLogger = () => getModuleLogger(["applications", "tools"]);

/** Applications MCP */
export const mcpLogger = () => getModuleLogger(["applications", "mcp"]);

/** Applications Skills */
export const skillsLogger = () => getModuleLogger(["applications", "skills"]);

/** Applications Prompts */
export const promptsLogger = () => getModuleLogger(["applications", "prompts"]);

/** Applications Shared */
export const sharedLogger = () => getModuleLogger(["applications", "shared"]);
