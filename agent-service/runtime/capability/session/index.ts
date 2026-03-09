/**
 * 会话能力模块入口
 *
 * 提供会话基础能力：会话管理、会话搜索。
 *
 * ========== 模块迁移记录 (完成于 2026-03-09) ==========
 * 状态: 已完成
 * - TitleGenerator → @micro-agent/sdk/session
 * - SessionContextInjector → @micro-agent/sdk/session
 */

// 类型定义
export * from './types';

// T044: 会话全文检索
export { SessionSearcher, searchSessions } from './session-searcher';

// T046: 会话列表管理
export { SessionManager, listSessions } from './session-manager';