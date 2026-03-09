/**
 * memory 命令实现
 *
 * 记忆管理命令，支持查看、搜索、删除、统计记忆等操作。
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

const log = getLogger(['cli', 'commands', 'memory']);

/** 记忆类型 */
type MemoryType =
  | 'preference'
  | 'fact'
  | 'decision'
  | 'entity'
  | 'conversation'
  | 'summary'
  | 'document'
  | 'other';

/** 记忆状态 */
type MemoryStatus = 'active' | 'archived' | 'protected' | 'deleted';

/** 类型标签映射 */
const TYPE_LABELS: Record<MemoryType, string> = {
  preference: '偏好',
  fact: '事实',
  decision: '决策',
  entity: '实体',
  conversation: '对话',
  summary: '摘要',
  document: '文档',
  other: '其他',
};

/** 类型图标映射 */
const TYPE_ICONS: Record<MemoryType, string> = {
  preference: '💜',
  fact: '📖',
  decision: '⚡',
  entity: '🏷️',
  conversation: '💬',
  summary: '📝',
  document: '📄',
  other: '📌',
};

/** 类型排序顺序 */
const TYPE_ORDER: MemoryType[] = [
  'preference',
  'fact',
  'decision',
  'entity',
  'summary',
  'conversation',
  'document',
  'other',
];

/**
 * 获取数据库路径
 */
function getDatabasePath(): string {
  const defaultPath = join(homedir(), '.micro-agent', 'data', 'memory.db');
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
 * 记忆条目（数据库行）
 */
interface MemoryRow {
  id: string;
  type: string;
  content: string;
  importance: number;
  stability: number;
  status: string;
  created_at: number;
  accessed_at: number;
  access_count: number;
  session_key: string | null;
  metadata: string | null;
}

/**
 * 记忆统计信息
 */
interface MemoryStats {
  totalEntries: number;
  totalSessions: number;
  byType: Record<string, number>;
  byStatus: Record<string, number>;
  avgImportance: number;
  avgStability: number;
  oldestEntry: Date | null;
  newestEntry: Date | null;
}

/**
 * 获取记忆统计
 */
function getStats(db: Database): MemoryStats {
  const stats: MemoryStats = {
    totalEntries: 0,
    totalSessions: 0,
    byType: {},
    byStatus: {},
    avgImportance: 0,
    avgStability: 0,
    oldestEntry: null,
    newestEntry: null,
  };

  // 总数
  const totalRow = db.query<{ total: number }, []>('SELECT COUNT(*) as total FROM memories').get();
  stats.totalEntries = totalRow?.total ?? 0;

  if (stats.totalEntries === 0) {
    return stats;
  }

  // 会话数
  const sessionRow = db.query<{ total: number }, []>(
    'SELECT COUNT(DISTINCT session_key) as total FROM memories WHERE session_key IS NOT NULL'
  ).get();
  stats.totalSessions = sessionRow?.total ?? 0;

  // 按类型统计
  const typeRows = db.query<{ type: string; count: number }, []>(
    'SELECT type, COUNT(*) as count FROM memories GROUP BY type'
  ).all();
  for (const row of typeRows) {
    stats.byType[row.type] = row.count;
  }

  // 按状态统计
  const statusRows = db.query<{ status: string; count: number }, []>(
    'SELECT status, COUNT(*) as count FROM memories GROUP BY status'
  ).all();
  for (const row of statusRows) {
    stats.byStatus[row.status] = row.count;
  }

  // 平均值
  const avgRow = db.query<{ avg_importance: number; avg_stability: number }, []>(
    'SELECT AVG(importance) as avg_importance, AVG(stability) as avg_stability FROM memories'
  ).get();
  stats.avgImportance = avgRow?.avg_importance ?? 0;
  stats.avgStability = avgRow?.avg_stability ?? 0;

  // 时间范围
  const timeRow = db.query<{ oldest: number; newest: number }, []>(
    'SELECT MIN(created_at) as oldest, MAX(created_at) as newest FROM memories'
  ).get();
  stats.oldestEntry = timeRow?.oldest ? new Date(timeRow.oldest) : null;
  stats.newestEntry = timeRow?.newest ? new Date(timeRow.newest) : null;

  return stats;
}

/**
 * 显示统计信息
 */
function showStats(): void {
  const { exists, path } = checkDatabase();

  console.log();
  console.log('\x1b[1m\x1b[36m记忆系统统计\x1b[0m');
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

    if (stats.totalEntries === 0) {
      console.log('  \x1b[33m暂无记忆数据\x1b[0m');
      console.log();
      return;
    }

    console.log(`  \x1b[1m总条目:\x1b[0m ${stats.totalEntries}`);
    console.log(`  \x1b[1m总会话:\x1b[0m ${stats.totalSessions}`);
    console.log();

    // 按类型分布
    console.log('  \x1b[2m按类型:\x1b[0m');
    for (const type of TYPE_ORDER) {
      const count = stats.byType[type] ?? 0;
      if (count > 0) {
        const icon = TYPE_ICONS[type];
        const label = TYPE_LABELS[type];
        const bar = '█'.repeat(Math.ceil((count / stats.totalEntries) * 20));
        const pct = ((count / stats.totalEntries) * 100).toFixed(1);
        console.log(`    ${icon} ${label.padEnd(4)} ${bar}\x1b[2m ${count} (${pct}%)\x1b[0m`);
      }
    }

    console.log();

    // 按状态分布
    console.log('  \x1b[2m按状态:\x1b[0m');
    const statusLabels: Record<string, string> = {
      active: '活跃',
      archived: '归档',
      protected: '保护',
      deleted: '已删除',
    };
    for (const [status, count] of Object.entries(stats.byStatus)) {
      const label = statusLabels[status] ?? status;
      console.log(`    • ${label}: ${count}`);
    }

    console.log();

    // 指标
    console.log('  \x1b[2m指标:\x1b[0m');
    console.log(`    • 平均重要性: ${(stats.avgImportance * 100).toFixed(1)}%`);
    console.log(`    • 平均稳定性: ${(stats.avgStability * 100).toFixed(1)}%`);

    if (stats.oldestEntry && stats.newestEntry) {
      console.log(`    • 最早记忆: ${formatDate(stats.oldestEntry)}`);
      console.log(`    • 最新记忆: ${formatDate(stats.newestEntry)}`);
    }
  } finally {
    db.close();
  }

  console.log();
}

/**
 * 列出记忆
 */
function listMemories(type?: MemoryType, limit: number = 20): void {
  const { exists, path } = checkDatabase();

  console.log();
  console.log('\x1b[1m\x1b[36m记忆列表\x1b[0m');
  console.log('─'.repeat(50));

  if (!exists) {
    console.log(`  \x1b[33m数据库不存在\x1b[0m`);
    console.log();
    return;
  }

  const db = new Database(path);

  try {
    let sql = `
      SELECT id, type, content, importance, stability, status, created_at, accessed_at, access_count
      FROM memories
      WHERE status != 'deleted'
    `;
    const params: (string | number)[] = [];

    if (type) {
      sql += ' AND type = ?';
      params.push(type);
    }

    sql += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);

    const rows = db.query<MemoryRow, (string | number)[]>(sql).all(...params);

    if (rows.length === 0) {
      const typeLabel = type ? TYPE_LABELS[type] : '';
      console.log(`  \x1b[33m暂无${typeLabel}记忆\x1b[0m`);
      console.log();
      return;
    }

    // 按类型分组显示
    const grouped = new Map<MemoryType, MemoryRow[]>();
    for (const row of rows) {
      const memType = row.type as MemoryType;
      const list = grouped.get(memType) || [];
      list.push(row);
      grouped.set(memType, list);
    }

    for (const memType of Array.from(grouped.keys())) {
      const items = grouped.get(memType)!;
      const icon = TYPE_ICONS[memType];
      const label = TYPE_LABELS[memType];
      console.log();
      console.log(`  \x1b[2m${icon} ${label}:\x1b[0m`);

      for (const row of items) {
        const content = truncate(row.content, 50);
        const importance = Math.round(row.importance * 100);
        const stability = Math.round(row.stability * 100);
        const statusIcon = row.status === 'protected' ? '🔒' : row.status === 'archived' ? '📦' : '';

        console.log(`    ${statusIcon} ${row.id.slice(0, 8)}... ${content}`);
        console.log(`      \x1b[2m重要性: ${importance}% | 稳定性: ${stability}% | 访问: ${row.access_count}次\x1b[0m`);
      }
    }

    console.log();
    console.log(`  \x1b[2m显示 ${rows.length} 条记录\x1b[0m`);
  } finally {
    db.close();
  }

  console.log();
}

/**
 * 搜索记忆
 */
function searchMemories(query: string, limit: number = 20): void {
  const { exists, path } = checkDatabase();

  console.log();
  console.log(`\x1b[1m\x1b[36m搜索: "${query}"\x1b[0m`);
  console.log('─'.repeat(50));

  if (!exists) {
    console.log(`  \x1b[33m数据库不存在\x1b[0m`);
    console.log();
    return;
  }

  const db = new Database(path);

  try {
    // 使用 FTS 全文搜索
    let rows: MemoryRow[] = [];

    try {
      const ftsSql = `
        SELECT m.id, m.type, m.content, m.importance, m.stability, m.status,
               m.created_at, m.accessed_at, m.access_count, m.session_key, m.metadata
        FROM memories m
        JOIN memories_fts fts ON m.rowid = fts.rowid
        WHERE memories_fts MATCH ?
        ORDER BY m.importance DESC
        LIMIT ?
      `;
      rows = db.query<MemoryRow, [string, number]>(ftsSql).all(query, limit);
    } catch {
      // FTS 不可用，使用 LIKE 回退
      const likeSql = `
        SELECT id, type, content, importance, stability, status,
               created_at, accessed_at, access_count, session_key, metadata
        FROM memories
        WHERE content LIKE ? AND status != 'deleted'
        ORDER BY importance DESC
        LIMIT ?
      `;
      rows = db.query<MemoryRow, [string, number]>(likeSql).all(`%${query}%`, limit);
    }

    if (rows.length === 0) {
      console.log('  \x1b[33m未找到匹配的记忆\x1b[0m');
      console.log();
      return;
    }

    console.log();
    for (const row of rows) {
      const icon = TYPE_ICONS[row.type as MemoryType] ?? '📌';
      const content = highlightMatch(row.content, query, 60);
      const importance = Math.round(row.importance * 100);

      console.log(`  ${icon} \x1b[1m${row.id.slice(0, 8)}\x1b[0m`);
      console.log(`    ${content}`);
      console.log(`    \x1b[2m类型: ${TYPE_LABELS[row.type as MemoryType] ?? row.type} | 重要性: ${importance}% | 访问: ${row.access_count}次\x1b[0m`);
      console.log();
    }

    console.log(`  \x1b[2m找到 ${rows.length} 条匹配\x1b[0m`);
  } finally {
    db.close();
  }

  console.log();
}

/**
 * 显示记忆详情
 */
function showMemoryDetail(id: string): void {
  const { exists, path } = checkDatabase();

  console.log();
  console.log('\x1b[1m\x1b[36m记忆详情\x1b[0m');
  console.log('─'.repeat(50));

  if (!exists) {
    console.log(`  \x1b[33m数据库不存在\x1b[0m`);
    console.log();
    return;
  }

  const db = new Database(path);

  try {
    // 支持短 ID 查找
    const row = db.query<MemoryRow, [string]>(`
      SELECT id, type, content, importance, stability, status,
             created_at, accessed_at, access_count, session_key, metadata
      FROM memories
      WHERE id LIKE ? AND status != 'deleted'
      LIMIT 1
    `).get(`${id}%`);

    if (!row) {
      console.log(`  \x1b[33m记忆未找到: ${id}\x1b[0m`);
      console.log();
      return;
    }

    const icon = TYPE_ICONS[row.type as MemoryType] ?? '📌';
    const typeLabel = TYPE_LABELS[row.type as MemoryType] ?? row.type;

    console.log(`  \x1b[2mID:\x1b[0m ${row.id}`);
    console.log(`  \x1b[2m类型:\x1b[0m ${icon} ${typeLabel}`);
    console.log(`  \x1b[2m状态:\x1b[0m ${row.status}`);
    console.log();

    console.log('  \x1b[2m内容:\x1b[0m');
    console.log(`    ${row.content}`);
    console.log();

    console.log('  \x1b[2m指标:\x1b[0m');
    console.log(`    重要性: ${(row.importance * 100).toFixed(1)}%`);
    console.log(`    稳定性: ${(row.stability * 100).toFixed(1)}%`);
    console.log(`    访问次数: ${row.access_count}`);
    console.log();

    console.log('  \x1b[2m时间:\x1b[0m');
    console.log(`    创建: ${formatDate(new Date(row.created_at))}`);
    console.log(`    最后访问: ${formatDate(new Date(row.accessed_at))}`);

    if (row.session_key) {
      console.log();
      console.log(`  \x1b[2m会话:\x1b[0m ${row.session_key}`);
    }

    if (row.metadata) {
      try {
        const metadata = JSON.parse(row.metadata);
        if (Object.keys(metadata).length > 0) {
          console.log();
          console.log('  \x1b[2m元数据:\x1b[0m');
          for (const [key, value] of Object.entries(metadata)) {
            console.log(`    ${key}: ${JSON.stringify(value)}`);
          }
        }
      } catch {
        // 忽略解析错误
      }
    }
  } finally {
    db.close();
  }

  console.log();
}

/**
 * 删除记忆
 */
function deleteMemory(id: string, force: boolean = false): void {
  const { exists, path } = checkDatabase();

  console.log();

  if (!exists) {
    console.log(`  \x1b[33m数据库不存在\x1b[0m`);
    console.log();
    return;
  }

  const db = new Database(path);

  try {
    // 检查记忆是否存在
    const row = db.query<{ id: string; status: string; importance: number }, [string]>(`
      SELECT id, status, importance FROM memories WHERE id LIKE ? LIMIT 1
    `).get(`${id}%`);

    if (!row) {
      console.log(`  \x1b[33m记忆未找到: ${id}\x1b[0m`);
      console.log();
      return;
    }

    // 检查保护状态
    if (row.status === 'protected' && !force) {
      console.log(`  \x1b[33m记忆受保护，无法删除。使用 --force 强制删除。\x1b[0m`);
      console.log();
      return;
    }

    // 检查高重要性
    if (row.importance >= 0.8 && !force) {
      console.log(`  \x1b[33m此记忆重要性较高 (${(row.importance * 100).toFixed(0)}%)，使用 --force 确认删除。\x1b[0m`);
      console.log();
      return;
    }

    // 执行删除（软删除）
    db.run(
      "UPDATE memories SET status = 'deleted', updated_at = ? WHERE id = ?",
      [Date.now(), row.id]
    );

    console.log(`  \x1b[32m✓ 记忆已删除: ${row.id.slice(0, 8)}...\x1b[0m`);
    log.info('记忆已删除', { id: row.id });
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
记忆管理命令

用法:
  micro-agent memory <子命令> [参数]

子命令:
  list [type]       列出记忆（可指定类型）
  search <query>    搜索记忆
  show <id>         显示记忆详情
  delete <id>       删除记忆
  stats             显示统计信息

记忆类型:
  preference        偏好记忆 - 用户偏好设置
  fact              事实记忆 - 客观事实信息
  decision          决策记忆 - 用户的决策记录
  entity            实体记忆 - 重要实体信息
  conversation      对话记忆 - 对话片段
  summary           摘要记忆 - 对话摘要
  document          文档记忆 - 知识库文档

选项:
  --limit <n>       限制结果数量（默认 20）
  --force           强制删除受保护/高重要性记忆

示例:
  micro-agent memory stats
  micro-agent memory list preference
  micro-agent memory search "用户喜欢"
  micro-agent memory show abc123
  micro-agent memory delete abc123 --force
`);
}

/**
 * 执行 memory 命令
 * @param args - 命令参数
 */
export async function runMemoryCommand(args: string[]): Promise<void> {
  const subcommand = args[0];

  switch (subcommand) {
    case 'list':
    case 'ls': {
      // 解析类型参数
      let type: MemoryType | undefined;
      let limit = 20;

      for (let i = 1; i < args.length; i++) {
        if (args[i] === '--limit' && args[i + 1]) {
          limit = parseInt(args[i + 1], 10) || 20;
          i++;
        } else if (!args[i].startsWith('--')) {
          type = args[i] as MemoryType;
        }
      }

      listMemories(type, limit);
      break;
    }

    case 'search': {
      if (!args[1]) {
        console.log('\x1b[33m请指定搜索关键词\x1b[0m');
        console.log('用法: micro-agent memory search <query>');
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

      searchMemories(queryParts.join(' '), limit);
      break;
    }

    case 'show':
    case 'get': {
      if (!args[1]) {
        console.log('\x1b[33m请指定记忆 ID\x1b[0m');
        console.log('用法: micro-agent memory show <id>');
        return;
      }
      showMemoryDetail(args[1]);
      break;
    }

    case 'delete':
    case 'rm': {
      if (!args[1]) {
        console.log('\x1b[33m请指定记忆 ID\x1b[0m');
        console.log('用法: micro-agent memory delete <id>');
        return;
      }

      const force = args.includes('--force');
      deleteMemory(args[1], force);
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
function highlightMatch(content: string, query: string, maxLen: number): string {
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
