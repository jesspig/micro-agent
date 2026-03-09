/**
 * session 命令实现
 *
 * 会话管理命令，支持创建、查看、归档、星标会话等操作。
 *
 * 架构说明：
 * 此模块直接使用 bun:sqlite 访问数据库，而非通过 SDK API。
 * 这是有意为之的设计决策，原因如下：
 * 1. 这是离线管理/调试工具，需要在 Agent Service 未运行时也能工作
 * 2. 需要直接访问原始数据库记录进行复杂查询和统计
 * 3. SDK API 主要用于与运行中的 Agent Service 交互
 */

import { homedir } from 'os';
import { join } from 'path';
import { existsSync } from 'fs';
import { Database } from 'bun:sqlite';
import { getLogger } from '@logtape/logtape';

const log = getLogger(['cli', 'commands', 'session']);

/** 会话状态 */
type SessionState = 'active' | 'idle' | 'closed' | 'archived';

/** 状态标签映射 */
const STATE_LABELS: Record<SessionState, string> = {
  active: '活跃',
  idle: '空闲',
  closed: '已关闭',
  archived: '已归档',
};

/** 状态图标映射 */
const STATE_ICONS: Record<SessionState, string> = {
  active: '🟢',
  idle: '🟡',
  closed: '🔴',
  archived: '📦',
};

/**
 * 获取数据库路径
 */
function getDatabasePath(): string {
  const defaultPath = join(homedir(), '.micro-agent', 'data', 'sessions.db');
  return defaultPath;
}

/**
 * 检查数据库是否存在
 */
function checkDatabase(): { exists: boolean; path: string } {
  const dbPath = getDatabasePath();
  return {
    exists: existsSync(dbPath),
    path: dbPath,
  };
}

/**
 * 会话列表项（数据库行）
 */
interface SessionRow {
  key: string;
  title: string | null;
  summary: string | null;
  status: string;
  is_starred: number;
  tags: string;
  message_count: number;
  created_at: number;
  updated_at: number;
}

/**
 * 会话统计信息
 */
interface SessionStats {
  totalSessions: number;
  activeSessions: number;
  archivedSessions: number;
  starredSessions: number;
  totalMessages: number;
  avgMessagesPerSession: number;
  oldestSession: Date | null;
  newestSession: Date | null;
}

/**
 * 获取会话统计
 */
function getStats(db: Database): SessionStats {
  const stats: SessionStats = {
    totalSessions: 0,
    activeSessions: 0,
    archivedSessions: 0,
    starredSessions: 0,
    totalMessages: 0,
    avgMessagesPerSession: 0,
    oldestSession: null,
    newestSession: null,
  };

  // 总数
  const totalRow = db.query<{ total: number }, []>('SELECT COUNT(*) as total FROM sessions').get();
  stats.totalSessions = totalRow?.total ?? 0;

  if (stats.totalSessions === 0) {
    return stats;
  }

  // 按状态统计
  const activeRow = db.query<{ total: number }, []>(
    "SELECT COUNT(*) as total FROM sessions WHERE status = 'active'"
  ).get();
  stats.activeSessions = activeRow?.total ?? 0;

  const archivedRow = db.query<{ total: number }, []>(
    "SELECT COUNT(*) as total FROM sessions WHERE status = 'archived'"
  ).get();
  stats.archivedSessions = archivedRow?.total ?? 0;

  // 星标数
  const starredRow = db.query<{ total: number }, []>(
    'SELECT COUNT(*) as total FROM sessions WHERE is_starred = 1'
  ).get();
  stats.starredSessions = starredRow?.total ?? 0;

  // 消息统计
  const msgRow = db.query<{ total: number }, []>(
    'SELECT SUM(message_count) as total FROM sessions'
  ).get();
  stats.totalMessages = msgRow?.total ?? 0;
  stats.avgMessagesPerSession = Math.round(stats.totalMessages / stats.totalSessions);

  // 时间范围
  const timeRow = db.query<{ oldest: number; newest: number }, []>(
    'SELECT MIN(created_at) as oldest, MAX(created_at) as newest FROM sessions'
  ).get();
  stats.oldestSession = timeRow?.oldest ? new Date(timeRow.oldest) : null;
  stats.newestSession = timeRow?.newest ? new Date(timeRow.newest) : null;

  return stats;
}

/**
 * 显示统计信息
 */
function showStats(): void {
  const { exists, path } = checkDatabase();

  console.log();
  console.log('\x1b[1m\x1b[36m会话统计\x1b[0m');
  console.log('─'.repeat(50));

  if (!exists) {
    console.log(`  \x1b[33m数据库不存在\x1b[0m`);
    console.log(`  \x1b[2m路径: ${path}\x1b[0m`);
    console.log();
    return;
  }

  const db = new Database(path);

  try {
    const stats = getStats(db);

    console.log(`  \x1b[2m存储路径:\x1b[0m ${path.replace(homedir(), '~')}`);
    console.log();

    if (stats.totalSessions === 0) {
      console.log('  \x1b[33m暂无会话数据\x1b[0m');
      console.log();
      return;
    }

    console.log(`  \x1b[1m总会话:\x1b[0m ${stats.totalSessions}`);
    console.log(`  \x1b[1m总消息:\x1b[0m ${stats.totalMessages}`);
    console.log();

    console.log('  \x1b[2m状态分布:\x1b[0m');
    console.log(`    🟢 活跃: ${stats.activeSessions}`);
    console.log(`    📦 归档: ${stats.archivedSessions}`);
    console.log(`    ⭐ 星标: ${stats.starredSessions}`);
    console.log();

    console.log('  \x1b[2m指标:\x1b[0m');
    console.log(`    • 平均消息数: ${stats.avgMessagesPerSession}`);

    if (stats.oldestSession && stats.newestSession) {
      console.log(`    • 最早会话: ${formatDate(stats.oldestSession)}`);
      console.log(`    • 最新会话: ${formatDate(stats.newestSession)}`);
    }
  } finally {
    db.close();
  }

  console.log();
}

/**
 * 列出会话
 */
function listSessions(options: {
  state?: SessionState;
  starred?: boolean;
  limit?: number;
  page?: number;
}): void {
  const { exists, path } = checkDatabase();

  console.log();
  console.log('\x1b[1m\x1b[36m会话列表\x1b[0m');
  console.log('─'.repeat(50));

  if (!exists) {
    console.log(`  \x1b[33m数据库不存在\x1b[0m`);
    console.log();
    return;
  }

  const db = new Database(path);
  const limit = options.limit ?? 10;

  try {
    // 构建查询条件
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (options.state) {
      conditions.push('status = ?');
      params.push(options.state);
    }

    if (options.starred) {
      conditions.push('is_starred = 1');
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // 获取总数
    const countRow = db.query<{ total: number }, (string | number)[]>(
      `SELECT COUNT(*) as total FROM sessions ${whereClause}`
    ).get(...params);
    const total = countRow?.total ?? 0;

    if (total === 0) {
      const filterDesc = options.state
        ? STATE_LABELS[options.state]
        : options.starred
          ? '星标'
          : '';
      console.log(`  \x1b[33m暂无${filterDesc}会话\x1b[0m`);
      console.log();
      return;
    }

    // 分页查询
    const offset = ((options.page ?? 1) - 1) * limit;
    const rows = db.query<SessionRow, (string | number)[]>(`
      SELECT key, title, summary, status, is_starred, tags, message_count, created_at, updated_at
      FROM sessions
      ${whereClause}
      ORDER BY updated_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    // 显示会话列表
    for (const row of rows) {
      const stateIcon = STATE_ICONS[row.status as SessionState] ?? '📌';
      const starIcon = row.is_starred ? '⭐ ' : '';
      const title = row.title ?? '未命名会话';
      const time = formatDate(new Date(row.updated_at));
      const msgCount = row.message_count;

      console.log();
      console.log(`  ${stateIcon} ${starIcon}\x1b[1m${title}\x1b[0m`);
      console.log(`    \x1b[2m${row.key}\x1b[0m`);

      if (row.summary) {
        console.log(`    ${truncate(row.summary, 60)}`);
      }

      console.log(`    \x1b[2m${msgCount} 条消息 | ${time}\x1b[0m`);
    }

    console.log();
    const totalPages = Math.ceil(total / limit);
    console.log(`  \x1b[2m共 ${total} 个会话，第 ${options.page ?? 1}/${totalPages} 页\x1b[0m`);

    if (totalPages > 1) {
      console.log(`  \x1b[2m使用 --page <n> 查看更多\x1b[0m`);
    }
  } finally {
    db.close();
  }

  console.log();
}

/**
 * 显示会话详情
 */
function showSessionDetail(sessionKey: string): void {
  const { exists, path } = checkDatabase();

  console.log();
  console.log('\x1b[1m\x1b[36m会话详情\x1b[0m');
  console.log('─'.repeat(50));

  if (!exists) {
    console.log(`  \x1b[33m数据库不存在\x1b[0m`);
    console.log();
    return;
  }

  const db = new Database(path);

  try {
    // 支持短键查找
    const row = db.query<SessionRow, [string]>(`
      SELECT key, title, summary, status, is_starred, tags, message_count, created_at, updated_at
      FROM sessions
      WHERE key LIKE ?
      LIMIT 1
    `).get(`${sessionKey}%`);

    if (!row) {
      console.log(`  \x1b[33m会话未找到: ${sessionKey}\x1b[0m`);
      console.log();
      return;
    }

    const stateIcon = STATE_ICONS[row.status as SessionState] ?? '📌';
    const stateLabel = STATE_LABELS[row.status as SessionState] ?? row.status;
    const starIcon = row.is_starred ? ' ⭐' : '';

    console.log(`  \x1b[2m会话键:\x1b[0m ${row.key}`);
    console.log(`  \x1b[2m标题:\x1b[0m ${row.title ?? '未命名'}${starIcon}`);
    console.log(`  \x1b[2m状态:\x1b[0m ${stateIcon} ${stateLabel}`);
    console.log();

    if (row.summary) {
      console.log('  \x1b[2m摘要:\x1b[0m');
      console.log(`    ${row.summary}`);
      console.log();
    }

    // 解析标签
    let tags: string[] = [];
    try {
      tags = JSON.parse(row.tags ?? '[]');
    } catch {
      // 忽略解析错误
    }

    if (tags.length > 0) {
      console.log(`  \x1b[2m标签:\x1b[0m ${tags.map(t => `#${t}`).join(' ')}`);
      console.log();
    }

    console.log('  \x1b[2m统计:\x1b[0m');
    console.log(`    消息数: ${row.message_count}`);
    console.log(`    创建时间: ${formatDate(new Date(row.created_at))}`);
    console.log(`    更新时间: ${formatDate(new Date(row.updated_at))}`);
  } finally {
    db.close();
  }

  console.log();
}

/**
 * 归档会话
 */
function archiveSession(sessionKey: string): void {
  const { exists, path } = checkDatabase();

  console.log();

  if (!exists) {
    console.log(`  \x1b[33m数据库不存在\x1b[0m`);
    console.log();
    return;
  }

  const db = new Database(path);

  try {
    const row = db.query<{ key: string; status: string }, [string]>(`
      SELECT key, status FROM sessions WHERE key LIKE ? LIMIT 1
    `).get(`${sessionKey}%`);

    if (!row) {
      console.log(`  \x1b[33m会话未找到: ${sessionKey}\x1b[0m`);
      console.log();
      return;
    }

    if (row.status === 'archived') {
      console.log(`  \x1b[33m会话已处于归档状态\x1b[0m`);
      console.log();
      return;
    }

    db.run(
      "UPDATE sessions SET status = 'archived', updated_at = ? WHERE key = ?",
      [Date.now(), row.key]
    );

    console.log(`  \x1b[32m✓ 会话已归档: ${row.key}\x1b[0m`);
    log.info('会话已归档', { sessionKey: row.key });
  } finally {
    db.close();
  }

  console.log();
}

/**
 * 恢复会话
 */
function restoreSession(sessionKey: string): void {
  const { exists, path } = checkDatabase();

  console.log();

  if (!exists) {
    console.log(`  \x1b[33m数据库不存在\x1b[0m`);
    console.log();
    return;
  }

  const db = new Database(path);

  try {
    const row = db.query<{ key: string; status: string }, [string]>(`
      SELECT key, status FROM sessions WHERE key LIKE ? LIMIT 1
    `).get(`${sessionKey}%`);

    if (!row) {
      console.log(`  \x1b[33m会话未找到: ${sessionKey}\x1b[0m`);
      console.log();
      return;
    }

    if (row.status === 'active') {
      console.log(`  \x1b[33m会话已是活跃状态\x1b[0m`);
      console.log();
      return;
    }

    db.run(
      "UPDATE sessions SET status = 'active', updated_at = ? WHERE key = ?",
      [Date.now(), row.key]
    );

    console.log(`  \x1b[32m✓ 会话已恢复: ${row.key}\x1b[0m`);
    log.info('会话已恢复', { sessionKey: row.key });
  } finally {
    db.close();
  }

  console.log();
}

/**
 * 切换星标
 */
function toggleStar(sessionKey: string): void {
  const { exists, path } = checkDatabase();

  console.log();

  if (!exists) {
    console.log(`  \x1b[33m数据库不存在\x1b[0m`);
    console.log();
    return;
  }

  const db = new Database(path);

  try {
    const row = db.query<{ key: string; is_starred: number }, [string]>(`
      SELECT key, is_starred FROM sessions WHERE key LIKE ? LIMIT 1
    `).get(`${sessionKey}%`);

    if (!row) {
      console.log(`  \x1b[33m会话未找到: ${sessionKey}\x1b[0m`);
      console.log();
      return;
    }

    const newStarred = row.is_starred ? 0 : 1;
    db.run(
      'UPDATE sessions SET is_starred = ?, updated_at = ? WHERE key = ?',
      [newStarred, Date.now(), row.key]
    );

    const icon = newStarred ? '⭐' : '☆';
    const action = newStarred ? '已添加星标' : '已移除星标';
    console.log(`  \x1b[32m✓ ${icon} ${action}: ${row.key}\x1b[0m`);
    log.info('会话星标已切换', { sessionKey: row.key, starred: !!newStarred });
  } finally {
    db.close();
  }

  console.log();
}

/**
 * 删除会话
 */
function deleteSession(sessionKey: string): void {
  const { exists, path } = checkDatabase();

  console.log();

  if (!exists) {
    console.log(`  \x1b[33m数据库不存在\x1b[0m`);
    console.log();
    return;
  }

  const db = new Database(path);

  try {
    const row = db.query<{ key: string; title: string | null; is_starred: number }, [string]>(`
      SELECT key, title, is_starred FROM sessions WHERE key LIKE ? LIMIT 1
    `).get(`${sessionKey}%`);

    if (!row) {
      console.log(`  \x1b[33m会话未找到: ${sessionKey}\x1b[0m`);
      console.log();
      return;
    }

    const title = row.title ?? '未命名会话';
    console.log(`  \x1b[33m确认删除会话: "${title}"\x1b[0m`);
    console.log(`  \x1b[2m${row.key}\x1b[0m`);
    console.log();

    // 删除关联数据
    db.run('DELETE FROM session_tags WHERE session_key = ?', [row.key]);
    db.run('DELETE FROM messages WHERE session_key = ?', [row.key]);
    db.run('DELETE FROM session_context_configs WHERE session_key = ?', [row.key]);
    db.run('DELETE FROM sessions WHERE key = ?', [row.key]);

    console.log(`  \x1b[32m✓ 会话已删除\x1b[0m`);
    log.info('会话已删除', { sessionKey: row.key });
  } finally {
    db.close();
  }

  console.log();
}

/**
 * 搜索会话
 */
function searchSessions(query: string, limit: number = 20): void {
  const { exists, path } = checkDatabase();

  console.log();
  console.log(`\x1b[1m\x1b[36m搜索会话: "${query}"\x1b[0m`);
  console.log('─'.repeat(50));

  if (!exists) {
    console.log(`  \x1b[33m数据库不存在\x1b[0m`);
    console.log();
    return;
  }

  const db = new Database(path);

  try {
    let rows: SessionRow[] = [];

    try {
      // 使用 FTS 搜索
      const ftsSql = `
        SELECT s.key, s.title, s.summary, s.status, s.is_starred, s.tags, s.message_count, s.created_at, s.updated_at
        FROM sessions s
        JOIN sessions_fts fts ON s.rowid = fts.rowid
        WHERE sessions_fts MATCH ?
        ORDER BY s.updated_at DESC
        LIMIT ?
      `;
      rows = db.query<SessionRow, [string, number]>(ftsSql).all(query, limit);
    } catch {
      // FTS 不可用，使用 LIKE 回退
      const likeSql = `
        SELECT key, title, summary, status, is_starred, tags, message_count, created_at, updated_at
        FROM sessions
        WHERE (title LIKE ? OR summary LIKE ?)
        ORDER BY updated_at DESC
        LIMIT ?
      `;
      rows = db.query<SessionRow, [string, string, number]>(likeSql).all(
        `%${query}%`,
        `%${query}%`,
        limit
      );
    }

    if (rows.length === 0) {
      console.log('  \x1b[33m未找到匹配的会话\x1b[0m');
      console.log();
      return;
    }

    console.log();
    for (const row of rows) {
      const stateIcon = STATE_ICONS[row.status as SessionState] ?? '📌';
      const starIcon = row.is_starred ? '⭐ ' : '';
      const title = row.title ?? '未命名会话';
      const time = formatDate(new Date(row.updated_at));

      console.log(`  ${stateIcon} ${starIcon}\x1b[1m${highlightMatch(title, query)}\x1b[0m`);
      console.log(`    \x1b[2m${row.key}\x1b[0m`);

      if (row.summary) {
        console.log(`    ${highlightMatch(row.summary, query, 60)}`);
      }

      console.log(`    \x1b[2m${row.message_count} 条消息 | ${time}\x1b[0m`);
      console.log();
    }

    console.log(`  \x1b[2m找到 ${rows.length} 个匹配\x1b[0m`);
  } finally {
    db.close();
  }

  console.log();
}

/**
 * 显示帮助信息
 */
function showHelp(): void {
  console.log(`
会话管理命令

用法:
  micro-agent session <子命令> [参数]

子命令:
  list              列出会话
  show <id>         显示会话详情
  archive <id>      归档会话
  restore <id>      恢复会话
  star <id>         切换星标
  delete <id>       删除会话
  search <query>    搜索会话
  stats             显示统计信息

选项:
  --limit <n>       限制结果数量（默认 10）
  --page <n>        页码（默认 1）
  --starred         仅显示星标会话
  --archived        仅显示归档会话
  --active          仅显示活跃会话

会话状态:
  active            活跃 - 正在进行的会话
  idle              空闲 - 暂时未活动的会话
  closed            已关闭 - 已结束的会话
  archived          已归档 - 已归档保存的会话

示例:
  micro-agent session list
  micro-agent session list --starred --limit 20
  micro-agent session show feishu:abc123
  micro-agent session archive feishu:abc123
  micro-agent session star feishu:abc123
  micro-agent session search "项目讨论"
`);
}

/**
 * 执行 session 命令
 * @param args - 命令参数
 */
export async function runSessionCommand(args: string[]): Promise<void> {
  const subcommand = args[0];

  switch (subcommand) {
    case 'list':
    case 'ls': {
      const options: {
        state?: SessionState;
        starred?: boolean;
        limit?: number;
        page?: number;
      } = {};

      for (let i = 1; i < args.length; i++) {
        if (args[i] === '--limit' && args[i + 1]) {
          options.limit = parseInt(args[i + 1], 10) || 10;
          i++;
        } else if (args[i] === '--page' && args[i + 1]) {
          options.page = parseInt(args[i + 1], 10) || 1;
          i++;
        } else if (args[i] === '--starred') {
          options.starred = true;
        } else if (args[i] === '--archived') {
          options.state = 'archived';
        } else if (args[i] === '--active') {
          options.state = 'active';
        }
      }

      listSessions(options);
      break;
    }

    case 'show':
    case 'get': {
      if (!args[1] || args[1].startsWith('--')) {
        console.log('\x1b[33m请指定会话 ID\x1b[0m');
        console.log('用法: micro-agent session show <id>');
        return;
      }
      showSessionDetail(args[1]);
      break;
    }

    case 'archive': {
      if (!args[1] || args[1].startsWith('--')) {
        console.log('\x1b[33m请指定会话 ID\x1b[0m');
        console.log('用法: micro-agent session archive <id>');
        return;
      }
      archiveSession(args[1]);
      break;
    }

    case 'restore':
    case 'unarchive': {
      if (!args[1] || args[1].startsWith('--')) {
        console.log('\x1b[33m请指定会话 ID\x1b[0m');
        console.log('用法: micro-agent session restore <id>');
        return;
      }
      restoreSession(args[1]);
      break;
    }

    case 'star':
    case 'unstar': {
      if (!args[1] || args[1].startsWith('--')) {
        console.log('\x1b[33m请指定会话 ID\x1b[0m');
        console.log('用法: micro-agent session star <id>');
        return;
      }
      toggleStar(args[1]);
      break;
    }

    case 'delete':
    case 'rm': {
      if (!args[1] || args[1].startsWith('--')) {
        console.log('\x1b[33m请指定会话 ID\x1b[0m');
        console.log('用法: micro-agent session delete <id>');
        return;
      }
      deleteSession(args[1]);
      break;
    }

    case 'search': {
      if (!args[1] || args[1].startsWith('--')) {
        console.log('\x1b[33m请指定搜索关键词\x1b[0m');
        console.log('用法: micro-agent session search <query>');
        return;
      }

      let limit = 20;
      const queryParts: string[] = [];

      for (let i = 1; i < args.length; i++) {
        if (args[i] === '--limit' && args[i + 1]) {
          limit = parseInt(args[i + 1], 10) || 20;
          i++;
        } else if (!args[i].startsWith('--')) {
          queryParts.push(args[i]);
        }
      }

      searchSessions(queryParts.join(' '), limit);
      break;
    }

    case 'stats':
    case 'stat':
      showStats();
      break;

    case 'help':
    case undefined:
      showHelp();
      break;

    default:
      console.log(`\x1b[33m未知子命令: ${subcommand}\x1b[0m`);
      showHelp();
  }
}

// ========== 辅助函数 ==========

/**
 * 格式化日期
 */
function formatDate(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) {
    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours === 0) {
      const minutes = Math.floor(diff / (1000 * 60));
      return `${minutes} 分钟前`;
    }
    return `${hours} 小时前`;
  } else if (days === 1) {
    return '昨天';
  } else if (days < 7) {
    return `${days} 天前`;
  } else if (days < 30) {
    return `${Math.floor(days / 7)} 周前`;
  } else if (days < 365) {
    return `${Math.floor(days / 30)} 月前`;
  } else {
    return `${Math.floor(days / 365)} 年前`;
  }
}

/**
 * 截断字符串
 */
function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + '...';
}

/**
 * 高亮匹配内容
 */
function highlightMatch(content: string, query: string, maxLen: number = 40): string {
  const lowerContent = content.toLowerCase();
  const lowerQuery = query.toLowerCase();

  const index = lowerContent.indexOf(lowerQuery);
  if (index === -1) {
    return truncate(content, maxLen);
  }

  // 计算截取范围
  const start = Math.max(0, index - Math.floor((maxLen - query.length) / 2));
  const end = Math.min(content.length, start + maxLen);

  let result = content.slice(start, end);
  if (start > 0) result = '...' + result;
  if (end < content.length) result = result + '...';

  // 高亮匹配部分
  const relativeIndex = index - start + (start > 0 ? 3 : 0);
  const matchEnd = relativeIndex + query.length;

  result =
    result.slice(0, relativeIndex) +
    '\x1b[1;33m' +
    result.slice(relativeIndex, matchEnd) +
    '\x1b[0m' +
    result.slice(matchEnd);

  return result;
}
