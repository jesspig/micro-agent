/**
 * ext 命令实现
 *
 * 扩展管理命令，支持工具、技能、通道等扩展的列表、搜索、安装、卸载等操作。
 */

import { homedir } from 'os';
import { resolve, join, basename } from 'path';
import { existsSync, readdirSync, statSync, readFileSync } from 'fs';
import {
  type ExtensionType,
  EXTENSION_TYPE_LABELS,
  getExtensionTypeDir,
} from '@micro-agent/types';

/** CLI 展示用的扩展类型（目录名） */
type CliExtensionType = 'tool' | 'channel' | 'skills';

/** 扩展信息 */
interface ExtensionInfo {
  /** 扩展名称 */
  name: string;
  /** 扩展类型 */
  type: CliExtensionType;
  /** 扩展路径 */
  path: string;
  /** 扩展状态 */
  status: 'active' | 'inactive' | 'error';
  /** 扩展描述（从 SKILL.md 或 package.json 读取） */
  description?: string;
}

/** 类型标签映射 */
const TYPE_LABELS: Record<CliExtensionType, string> = {
  tool: EXTENSION_TYPE_LABELS['tool'],
  channel: EXTENSION_TYPE_LABELS['channel'],
  skills: EXTENSION_TYPE_LABELS['skill'],
};

/** 类���排序顺序 */
const TYPE_ORDER: CliExtensionType[] = ['tool', 'channel', 'skills'];

/**
 * 获取扩展扫描目录列表
 *
 * 按优先级返回扩展目录：
 * 1. 项目内置扩展目录（extensions/）
 * 2. 项目内置扩展目录（applications/extensions/）
 * 3. 用户级扩展目录（~/.micro-agent/extensions/）
 * 4. 项目级扩展目录（./.micro-agent/extensions/）
 */
function getExtensionDirs(): Array<{ path: string; label: string }> {
  const dirs: Array<{ path: string; label: string }> = [];

  // 获取项目根目录（从当前工作目录向上查找）
  let projectRoot = process.cwd();
  const markerFiles = ['package.json', 'bun.lock', 'tsconfig.json'];
  
  // 向上查找项目根目录
  let currentDir = process.cwd();
  for (let i = 0; i < 10; i++) {
    if (markerFiles.some(f => existsSync(join(currentDir, f)))) {
      const pkgPath = join(currentDir, 'package.json');
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
        if (pkg.name === 'micro-agent' || pkg.name?.includes('micro-agent')) {
          projectRoot = currentDir;
          break;
        }
      } catch {
        // 忽略解析错误
      }
    }
    const parent = resolve(currentDir, '..');
    if (parent === currentDir) break;
    currentDir = parent;
  }

  // 项目内置扩展目录 - 根目录
  const builtinRoot = join(projectRoot, 'extensions');
  if (existsSync(builtinRoot)) {
    dirs.push({ path: builtinRoot, label: '内置' });
  }

  // 项目内置扩展目录 - applications 目录
  const builtinApp = join(projectRoot, 'applications', 'extensions');
  if (existsSync(builtinApp)) {
    dirs.push({ path: builtinApp, label: '内置' });
  }

  // 用户级扩展目录
  const userDir = join(homedir(), '.micro-agent', 'extensions');
  if (existsSync(userDir)) {
    dirs.push({ path: userDir, label: '用户' });
  }

  // 项目级扩展目录
  const projectDir = resolve(process.cwd(), '.micro-agent', 'extensions');
  if (existsSync(projectDir)) {
    dirs.push({ path: projectDir, label: '项目' });
  }

  return dirs;
}

/**
 * 从 SKILL.md 文件读取描述
 */
function readSkillDescription(skillPath: string): string | undefined {
  const skillMd = join(skillPath, 'SKILL.md');
  if (!existsSync(skillMd)) return undefined;

  try {
    const content = readFileSync(skillMd, 'utf-8');
    // 解析 YAML frontmatter 中的 description
    const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
    if (match) {
      const frontmatter = match[1];
      const descMatch = frontmatter.match(/^description:\s*["']?(.+?)["']?\s*$/m);
      if (descMatch) {
        return descMatch[1].trim();
      }
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * 从 package.json 文件读取描述
 */
function readPackageDescription(extPath: string): string | undefined {
  const pkgPath = join(extPath, 'package.json');
  if (!existsSync(pkgPath)) return undefined;

  try {
    const content = readFileSync(pkgPath, 'utf-8');
    const pkg = JSON.parse(content);
    return pkg.description;
  } catch {
    return undefined;
  }
}

/**
 * 扫描单个扩展目录
 */
function scanExtensionDir(
  baseDir: string,
  type: CliExtensionType
): ExtensionInfo[] {
  const extensions: ExtensionInfo[] = [];
  const typeDir = join(baseDir, type);

  if (!existsSync(typeDir)) return extensions;

  try {
    const entries = readdirSync(typeDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const extPath = join(typeDir, entry.name);

      // 检测扩展状态
      let hasEntry = false;
      if (type === 'skills') {
        // 技能扩展：检查 SKILL.md 或 scripts 目录
        hasEntry =
          existsSync(join(extPath, 'SKILL.md')) ||
          existsSync(join(extPath, 'scripts')) ||
          existsSync(join(extPath, 'index.ts')) ||
          existsSync(join(extPath, 'index.js'));
      } else {
        // 工具/通道扩展：检查 index.ts/js
        hasEntry =
          existsSync(join(extPath, 'index.ts')) ||
          existsSync(join(extPath, 'index.js'));
      }

      // 尝试读取描述
      let description: string | undefined;
      if (type === 'skills') {
        description = readSkillDescription(extPath);
      }
      if (!description) {
        description = readPackageDescription(extPath);
      }

      extensions.push({
        name: entry.name,
        type,
        path: extPath,
        status: hasEntry ? 'active' : 'inactive',
        description,
      });
    }
  } catch {
    // 忽略扫描错误
  }

  return extensions;
}

/**
 * 扫描所有扩展
 */
function scanAllExtensions(): ExtensionInfo[] {
  const allExtensions: ExtensionInfo[] = [];
  const seen = new Set<string>();

  const dirs = getExtensionDirs();

  for (const { path: baseDir } of dirs) {
    for (const type of TYPE_ORDER) {
      const exts = scanExtensionDir(baseDir, type);
      for (const ext of exts) {
        // 避免重复（用户级覆盖内置）
        const key = `${ext.type}:${ext.name}`;
        if (!seen.has(key)) {
          seen.add(key);
          allExtensions.push(ext);
        }
      }
    }
  }

  return allExtensions;
}

/**
 * 显示扩展列表
 */
function showExtensionsList(): void {
  const extensions = scanAllExtensions();

  console.log();
  console.log('\x1b[1m\x1b[36m已安装的扩展\x1b[0m');
  console.log('─'.repeat(50));

  if (extensions.length === 0) {
    console.log('  无已安装扩展');
    console.log();
    return;
  }

  // 按类型分组
  const grouped = new Map<CliExtensionType, ExtensionInfo[]>();
  for (const ext of extensions) {
    const list = grouped.get(ext.type) || [];
    list.push(ext);
    grouped.set(ext.type, list);
  }

  // 按类型顺序输出
  for (const type of TYPE_ORDER) {
    const list = grouped.get(type);
    if (!list || list.length === 0) continue;

    console.log();
    console.log(`  \x1b[2m${TYPE_LABELS[type]}:\x1b[0m`);
    for (const ext of list) {
      const statusIcon = ext.status === 'active' ? '✓' : '○';
      const statusColor = ext.status === 'active' ? '\x1b[32m' : '\x1b[33m';
      const desc = ext.description ? ` - ${ext.description}` : '';
      console.log(`    ${statusColor}${statusIcon}\x1b[0m ${ext.name}\x1b[2m${desc}\x1b[0m`);
    }
  }

  console.log();
  console.log(`  \x1b[2m共 ${extensions.length} 个扩展\x1b[0m`);
  console.log();
}

/**
 * 搜索扩展
 */
function searchExtensions(keyword: string): void {
  const extensions = scanAllExtensions();
  const lower = keyword.toLowerCase();

  const matches = extensions.filter(
    (ext) =>
      ext.name.toLowerCase().includes(lower) ||
      (ext.description?.toLowerCase().includes(lower) ?? false)
  );

  console.log();
  console.log(`\x1b[1m\x1b[36m搜索结果: "${keyword}"\x1b[0m`);
  console.log('─'.repeat(50));

  if (matches.length === 0) {
    console.log('  未找到匹配的扩展');
    console.log();
    return;
  }

  // 按类型分组显示
  const grouped = new Map<CliExtensionType, ExtensionInfo[]>();
  for (const ext of matches) {
    const list = grouped.get(ext.type) || [];
    list.push(ext);
    grouped.set(ext.type, list);
  }

  for (const type of TYPE_ORDER) {
    const list = grouped.get(type);
    if (!list || list.length === 0) continue;

    console.log();
    console.log(`  \x1b[2m${TYPE_LABELS[type]}:\x1b[0m`);
    for (const ext of list) {
      const statusIcon = ext.status === 'active' ? '✓' : '○';
      const statusColor = ext.status === 'active' ? '\x1b[32m' : '\x1b[33m';
      const desc = ext.description ? ` - ${ext.description}` : '';
      console.log(`    ${statusColor}${statusIcon}\x1b[0m ${ext.name}\x1b[2m${desc}\x1b[0m`);
    }
  }

  console.log();
  console.log(`  \x1b[2m找到 ${matches.length} 个匹配\x1b[0m`);
  console.log();
}

/**
 * 显示扩展详情
 */
function showExtensionDetail(name: string): void {
  const extensions = scanAllExtensions();
  const ext = extensions.find((e) => e.name === name);

  if (!ext) {
    console.log();
    console.log(`\x1b[33m扩展未找到: ${name}\x1b[0m`);
    console.log();
    return;
  }

  console.log();
  console.log('\x1b[1m\x1b[36m扩展详情\x1b[0m');
  console.log('─'.repeat(50));
  console.log(`  \x1b[2m名称:\x1b[0m ${ext.name}`);
  console.log(`  \x1b[2m类型:\x1b[0m ${TYPE_LABELS[ext.type]}`);
  console.log(`  \x1b[2m路径:\x1b[0m ${ext.path}`);
  console.log(
    `  \x1b[2m状态:\x1b[0m ${
      ext.status === 'active' ? '\x1b[32m✓ 正常\x1b[0m' : '\x1b[33m○ 未激活\x1b[0m'
    }`
  );
  if (ext.description) {
    console.log(`  \x1b[2m描述:\x1b[0m ${ext.description}`);
  }
  console.log();
}

/**
 * 显示帮助信息
 */
function showHelp(): void {
  console.log(`
扩展管理命令

用法:
  micro-agent ext <子命令> [参数]

��命令:
  list                列出所有已安装的扩展
  search <keyword>    搜索扩展
  show <name>         显示扩展详情

扩展类型:
  tool                工具扩展 - 提供可执行的功能
  skill               技能扩展 - 提供 AI 可调用的能力
  channel             通道扩展 - 提供消息收发通道

示例:
  micro-agent ext list
  micro-agent ext search time
  micro-agent ext show filesystem
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

    case 'search':
      if (!args[1]) {
        console.log('\x1b[33m请指定搜索关键词\x1b[0m');
        console.log('用法: micro-agent ext search <keyword>');
        return;
      }
      searchExtensions(args[1]);
      break;

    case 'show':
      if (!args[1]) {
        console.log('\x1b[33m请指定扩展名称\x1b[0m');
        console.log('用法: micro-agent ext show <name>');
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
