/**
 * ext 命令实现
 *
 * 扩展管理命令。
 */

import { homedir } from 'os';
import { resolve, join } from 'path';
import { existsSync, readdirSync, statSync } from 'fs';

/** 扩展类型 */
type ExtensionType = 'tools' | 'channels' | 'skills' | 'agents' | 'workflows' | 'commands' | 'mcp';

/** 扩展信息 */
interface ExtensionInfo {
  name: string;
  type: ExtensionType;
  path: string;
  status: 'active' | 'inactive' | 'error';
}

/** 获取扩展目录 */
function getExtensionDirs(): string[] {
  return [
    join(homedir(), '.microbot', 'extensions'), // 用户级
    resolve('.microbot', 'extensions'), // 项目级
  ];
}

/** 扫描扩展目录 */
function scanExtensions(): ExtensionInfo[] {
  const extensions: ExtensionInfo[] = [];
  const dirs = getExtensionDirs();

  for (const baseDir of dirs) {
    if (!existsSync(baseDir)) continue;

    const types = readdirSync(baseDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name as ExtensionType);

    for (const type of types) {
      const typeDir = join(baseDir, type);
      const entries = readdirSync(typeDir, { withFileTypes: true })
        .filter(d => d.isDirectory());

      for (const entry of entries) {
        const extPath = join(typeDir, entry.name);
        const hasIndex = existsSync(join(extPath, 'index.ts')) ||
          existsSync(join(extPath, 'index.js'));

        extensions.push({
          name: entry.name,
          type,
          path: extPath,
          status: hasIndex ? 'active' : 'error',
        });
      }
    }
  }

  return extensions;
}

/** 显示扩展列表 */
function showExtensionsList(): void {
  const extensions = scanExtensions();

  console.log();
  console.log('\x1b[1m\x1b[36m已安装扩展\x1b[0m');
  console.log('─'.repeat(50));

  if (extensions.length === 0) {
    console.log('  无已安装扩展');
    console.log();
    return;
  }

  // 按类型分组
  const grouped = new Map<ExtensionType, ExtensionInfo[]>();
  for (const ext of extensions) {
    const list = grouped.get(ext.type) || [];
    list.push(ext);
    grouped.set(ext.type, list);
  }

  const typeLabels: Record<ExtensionType, string> = {
    tools: '工具',
    channels: '通道',
    skills: '技能',
    agents: 'Agent',
    workflows: '工作流',
    commands: '命令',
    mcp: 'MCP',
  };

  for (const [type, list] of grouped) {
    console.log(`  \x1b[2m${typeLabels[type]}:\x1b[0m`);
    for (const ext of list) {
      const statusIcon = ext.status === 'active' ? '✓' : '✗';
      console.log(`    ${statusIcon} ${ext.name}`);
    }
  }

  console.log();
}

/** 显示扩展详情 */
function showExtensionDetail(name: string): void {
  const extensions = scanExtensions();
  const ext = extensions.find(e => e.name === name);

  if (!ext) {
    console.log(`\x1b[33m扩展未找到: ${name}\x1b[0m`);
    return;
  }

  console.log();
  console.log('\x1b[1m\x1b[36m扩展详情\x1b[0m');
  console.log('─'.repeat(50));
  console.log(`  \x1b[2m名称:\x1b[0m ${ext.name}`);
  console.log(`  \x1b[2m类型:\x1b[0m ${ext.type}`);
  console.log(`  \x1b[2m路径:\x1b[0m ${ext.path}`);
  console.log(`  \x1b[2m状态:\x1b[0m ${ext.status === 'active' ? '✓ 正常' : '✗ 异常'}`);
  console.log();
}

/** 显示帮助信息 */
function showHelp(): void {
  console.log(`
扩展管理命令

用法:
  microbot ext <子命令> [参数]

子命令:
  list        列出所有扩展
  show <name> 显示扩展详情
  help        显示帮助信息

示例:
  microbot ext list
  microbot ext show my-tool
`);
}

/**
 * 执行 ext 命令
 * @param args - 命令参数
 */
export async function runExtCommand(args: string[]): Promise<void> {
  const subcommand = args[0];

  switch (subcommand) {
    case 'list':
    case 'ls':
      showExtensionsList();
      break;

    case 'show':
      if (!args[1]) {
        console.log('\x1b[33m请指定扩展名称\x1b[0m');
        console.log('用法: microbot ext show <name>');
        return;
      }
      showExtensionDetail(args[1]);
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
