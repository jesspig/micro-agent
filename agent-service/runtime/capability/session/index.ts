/**
 * 会话能力模块入口
 *
 * 提供会话基础能力：会话管理、会话搜索。
 *
 * 注意：高级封装功能已迁移到 SDK：
 * - TitleGenerator → @micro-agent/sdk/session
 * - SessionContextInjector → @micro-agent/sdk/session
 */

// 类型定义
export * from './types';

// T044: 会话全文检索
export { SessionSearcher, searchSessions } from './session-searcher';

// T046: 会话列表管理
export { SessionManager, listSessions } from './session-manager';