/**
 * 路径常量定义
 *
 * 所有路径常量的单一来源，供 agent-service 内部和 SDK 重导出使用
 */

import { homedir } from 'os';
import { join } from 'path';

// ============================================================
// 基础路径常量
// ============================================================

/** 用户配置目录名 */
export const USER_CONFIG_DIR_NAME = '.micro-agent';

/** 用户配置目录（展开后的绝对路径） */
export const USER_CONFIG_DIR = join(homedir(), USER_CONFIG_DIR_NAME);

/** 数据目录 */
export const USER_DATA_DIR = join(USER_CONFIG_DIR, 'data');

/** 日志目录 */
export const USER_LOGS_DIR = join(USER_CONFIG_DIR, 'logs');

/** 知识库目录 */
export const USER_KNOWLEDGE_DIR = join(USER_CONFIG_DIR, 'knowledge');

/** 记忆存储目录 */
export const USER_MEMORY_DIR = join(USER_CONFIG_DIR, 'memory');

/** 工作区目录 */
export const USER_WORKSPACE_DIR = join(USER_CONFIG_DIR, 'workspace');

/** 会话数据目录 */
export const USER_SESSIONS_DIR = join(USER_CONFIG_DIR, 'data');

/** 技能目录 */
export const USER_SKILLS_DIR = join(USER_CONFIG_DIR, 'skills');

/** 扩展目录 */
export const USER_EXTENSIONS_DIR = join(USER_CONFIG_DIR, 'extensions');

// ============================================================
// 子路径常量
// ============================================================

/** 知识库向量数据库路径 */
export const KNOWLEDGE_VECTORS_PATH = join(USER_DATA_DIR, 'knowledge_vectors');

/** 知识库全文搜索数据库路径 */
export const KNOWLEDGE_FTS_DB_PATH = join(USER_DATA_DIR, 'knowledge.db');

/** 会话数据库路径 */
export const SESSIONS_DB_PATH = join(USER_DATA_DIR, 'sessions.db');

/** 记忆数据库路径 */
export const MEMORY_DB_PATH = join(USER_DATA_DIR, 'memory.db');

/** Todo 存储路径 */
export const TODO_STORAGE_PATH = join(USER_CONFIG_DIR, 'todos.json');

/** 内存日志目录 */
export const MEMORY_LOGS_DIR = join(USER_LOGS_DIR, 'memory');
