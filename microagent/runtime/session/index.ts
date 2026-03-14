/**
 * Session 模块导出
 *
 * 提供会话管理的核心能力
 */

// 类型导出
export type { SessionConfig, SessionState, SessionSnapshot } from "./types.js";

// 实现导出
export { Session, SessionManager } from "./manager.js";
export { ContextBuilder } from "./context-builder.js";
export type { ContextBuildOptions } from "./context-builder.js";

// 持久化模块导出
export {
  SESSIONS_DIR,
  getSessionFilePath,
  ensureSessionsDir,
  appendSessionEntry,
  appendSessionEntries,
  loadSessionFile,
  loadRecentSessions,
  clearSessionFile,
  messageToEntry,
  entryToMessage,
} from "./persistence.js";
export type { SessionEntry } from "./persistence.js";
