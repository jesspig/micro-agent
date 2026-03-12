/**
 * Builder 模块导出
 *
 * 提供 Agent 构建器的统一导出
 */

// 主要导出
export { AgentBuilder, createAgent, initRuntimeDirectories } from "./agent-builder.js";
export type { AgentBuildResult } from "./agent-builder.js";

// 重导出 runtime 层相关类型（便于外部使用）
export { AgentLoop, SessionManager, ToolRegistry, SkillRegistry } from "../../runtime/index.js";
export type { AgentConfig, AgentEventHandler } from "../../runtime/index.js";
