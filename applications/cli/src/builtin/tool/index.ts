/**
 * 核心工具集
 *
 * 六个核心工具：
 * - read: 读取文件内容
 * - write: 写入文件
 * - exec: 执行命令（ls、cat 等）
 * - glob: 文件模式匹配
 * - grep: 内容搜索
 * - edit: 精确编辑文件
 *
 * 更高级的功能由 skills 和 MCP 提供。
 */

import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync, readdirSync } from 'fs';
import { resolve, isAbsolute, normalize, join, relative } from 'path';
import { homedir, platform } from 'os';
import { which } from 'bun';
import { defineTool, TODO_STORAGE_PATH } from '@micro-agent/sdk';
import type { Tool, JSONSchema, ToolContext } from '@micro-agent/sdk/runtime';
import { createSuccessResult, createErrorResult } from '@micro-agent/sdk/runtime';

// ============================================================================
// 路径处理
// ============================================================================

/**
 * 解析路径，支持：
 * - ~ 开头：用户主目录
 * - 相对路径：相对于工作区
 * - 绝对路径：保持不变
 */
function resolvePath(path: string, workspace: string): string {
  if (path.startsWith('~/')) {
    return resolve(homedir(), path.slice(2));
  }
  if (path.startsWith('~')) {
    return resolve(homedir(), path.slice(1));
  }
  if (isAbsolute(path)) {
    return path;
  }
  return resolve(workspace, path);
}

/**
 * 验证路径是否允许访问
 */
function validatePathAccess(
  targetPath: string,
  workspace: string,
  knowledgeBase: string
): { allowed: boolean; error?: string } {
  let resolvedTarget: string;
  try {
    resolvedTarget = resolve(normalize(targetPath));
  } catch {
    return { allowed: false, error: '无效的路径格式' };
  }

  const normalizedTarget = resolvedTarget.toLowerCase();
  const normalizedWorkspace = workspace.toLowerCase();
  const normalizedKnowledgeBase = knowledgeBase.toLowerCase();

  // 禁止访问 node_modules
  if (normalizedTarget.includes('node_modules')) {
    return { allowed: false, error: '禁止访问 node_modules 目录' };
  }

  // 检查路径遍历
  if (targetPath.includes('..')) {
    return { allowed: false, error: '检测到路径遍历尝试' };
  }

  // 检查是否在允许的目录内
  if (normalizedTarget.startsWith(normalizedWorkspace) || 
      normalizedTarget.startsWith(normalizedKnowledgeBase)) {
    return { allowed: true };
  }

  return { allowed: false, error: '路径必须在允许的目录内（工作区或知识库）' };
}

// ============================================================================
// read 工具 - 仅读取文件
// ============================================================================

export const ReadTool = defineTool({
  name: 'read',
  description: '读取文件内容。仅支持文件，目录请使用 list_directory 工具。',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: '文件路径（支持相对路径、~ 路径、绝对路径）' },
      offset: { type: 'number', description: '起始行号（从 0 开始，可选）' },
      limit: { type: 'number', description: '最大读取行数（可选）' },
    },
    required: ['path'],
  } satisfies JSONSchema,
  execute: async (input: unknown, ctx: ToolContext) => {
    let path: string;
    let offset: number | undefined;
    let limit: number | undefined;

    if (typeof input === 'string') {
      path = input;
    } else if (input && typeof input === 'object') {
      const obj = input as Record<string, unknown>;
      path = String(obj.path ?? '');
      if (typeof obj.offset === 'number') offset = obj.offset;
      if (typeof obj.limit === 'number') limit = obj.limit;
    } else {
      return '错误: 无效的输入格式';
    }

    const resolvedPath = resolvePath(path, ctx.workspace);
    const validation = validatePathAccess(resolvedPath, ctx.workspace, ctx.knowledgeBase);
    
    if (!validation.allowed) {
      return `错误: ${validation.error}`;
    }

    if (!existsSync(resolvedPath)) {
      return `错误: 文件不存在 ${path}`;
    }

    const stats = statSync(resolvedPath);

    // 目录：提示使用 exec ls
    if (stats.isDirectory()) {
      return `错误: ${path} 是目录，请使用 exec ls 命令列出内容`;
    }

    // 文件：读取内容
    const content = readFileSync(resolvedPath, 'utf-8');
    const lines = content.split('\n');
    
    const startLine = offset ?? 0;
    const endLine = limit ? startLine + limit : lines.length;
    const selectedLines = lines.slice(startLine, endLine);
    
    return selectedLines.join('\n');
  },
});

// ============================================================================
// write 工具 - 写入文件
// ============================================================================

export const WriteTool = defineTool({
  name: 'write',
  description: '创建或覆盖文件。如果目录不存在会自动创建。',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: '文件路径' },
      content: { type: 'string', description: '文件内容' },
    },
    required: ['path', 'content'],
  } satisfies JSONSchema,
  execute: async (input: unknown, ctx: ToolContext) => {
    if (!input || typeof input !== 'object') {
      return '错误: 无效的输入格式';
    }
    
    const obj = input as Record<string, unknown>;
    const path = obj.path;
    const content = obj.content;
    
    if (!path || typeof path !== 'string') {
      return '错误: 缺少 path 参数';
    }
    if (content === undefined || content === null) {
      return '错误: 缺少 content 参数';
    }
    
    const contentStr = String(content);

    const filePath = resolvePath(path, ctx.workspace);
    const validation = validatePathAccess(filePath, ctx.workspace, ctx.knowledgeBase);
    
    if (!validation.allowed) {
      return `错误: ${validation.error}`;
    }

    // 确保目录存在
    const dir = resolve(filePath, '..');
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    writeFileSync(filePath, contentStr, 'utf-8');
    return `已写入 ${path} (${contentStr.length} 字符)`;
  },
});

// ============================================================================
// exec 工具 - 执行命令
// ============================================================================

/** 危险命令黑名单 */
const BLOCKED_COMMANDS = [
  'shutdown', 'reboot', 'halt', 'poweroff', 'init',
  'useradd', 'userdel', 'usermod', 'passwd', 'adduser', 'deluser',
  'sudo', 'su', 'doas', 'pkexec',
  'mkfs', 'fdisk', 'parted', 'dd',
  'iptables', 'ip6tables',
];

/** 危险命令模式 */
const DANGEROUS_PATTERNS = [
  /\brm\s+-rf\s+\//i,
  /\brm\s+-rf\s+~/i,
  /\brm\s+-rf\s+\*/i,
  />\s*\/dev\/(sda|hda|nvme)/i,
  /\$\(.*\)/i,
  /`.*`/i,
  /\|\s*(sh|bash|zsh)/i,
];

/** 允许的环境变量 */
const SAFE_ENV_VARS = [
  'PATH', 'HOME', 'USER', 'LANG', 'LC_ALL', 'TERM', 'SHELL', 'PWD',
  'NODE_PATH', 'BUN_INSTALL', 'PYTHONPATH', 'TEMP', 'TMP',
];

function validateCommand(cmd: string): { safe: boolean; error?: string } {
  const lowerCmd = cmd.toLowerCase();
  for (const blocked of BLOCKED_COMMANDS) {
    if (lowerCmd.includes(blocked)) {
      return { safe: false, error: `禁止执行危险命令: ${blocked}` };
    }
  }
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(cmd)) {
      return { safe: false, error: '检测到危险的命令模式' };
    }
  }
  return { safe: true };
}

function filterEnv(): Record<string, string> {
  const safeEnv: Record<string, string> = {};
  for (const key of SAFE_ENV_VARS) {
    if (process.env[key]) {
      safeEnv[key] = process.env[key]!;
    }
  }
  return safeEnv;
}

function parseCommand(cmd: string): [string, string[]] {
  const parts = cmd.trim().split(/\s+/);
  if (parts.length === 0) return ['', []];

  const first = parts[0];

  // 脚本文件：自动使用 bun
  if (/\.(ts|tsx|js|mjs|cjs)$/.test(first)) {
    return ['bun', parts];
  }
  // Python 脚本
  if (/\.py$/.test(first)) {
    return ['python', parts];
  }
  // 已指定运行时
  if (['bun', 'node', 'deno', 'python', 'python3', 'npx', 'bunx'].includes(first)) {
    return [first, parts.slice(1)];
  }
  
  // 跨平台 Shell 命令
  const isWindows = platform() === 'win32';
  if (isWindows) {
    // Windows: 使用 cmd.exe
    return ['cmd.exe', ['/c', cmd]];
  } else {
    // Unix: 使用 /bin/sh
    return ['/bin/sh', ['-c', cmd]];
  }
}

export const ExecTool = defineTool({
  name: 'exec',
  description: '执行 Shell 命令。【注意】查看目录内容请优先使用 list_directory 工具。本工具用于执行构建、测试、git 等其他命令。',
  inputSchema: {
    type: 'object',
    properties: {
      command: { 
        type: 'string', 
        description: '要执行的命令。如: bun test, git status, npm run build 等。' 
      },
      timeout: { type: 'number', description: '超时时间（毫秒），默认 30000' },
    },
    required: ['command'],
  } satisfies JSONSchema,
  execute: async (input: unknown, ctx: ToolContext) => {
    let cmd: string;
    let timeout = 30000;

    if (typeof input === 'string') {
      cmd = input;
    } else if (input && typeof input === 'object') {
      const obj = input as Record<string, unknown>;
      cmd = String(obj.command ?? '');
      if (typeof obj.timeout === 'number') timeout = Math.min(obj.timeout, 300000);
    } else {
      return '错误: 无效的输入格式';
    }

    cmd = cmd.trim();
    if (!cmd) return '错误: 命令为空';

    const validation = validateCommand(cmd);
    if (!validation.safe) {
      return `错误: ${validation.error}`;
    }

    try {
      const workingDir = ctx.workspace;
      if (!existsSync(workingDir)) {
        mkdirSync(workingDir, { recursive: true });
      }

      const [runner, args] = parseCommand(cmd);
      if (!runner) return '错误: 无法解析命令';

      // 解析可执行文件
      let resolvedRunner = runner;
      
      // 特殊处理：Windows cmd.exe 直接使用
      if (runner === 'cmd.exe') {
        resolvedRunner = runner;
      } else if (runner === 'bun') {
        resolvedRunner = which('bun') || process.execPath;
      } else if (!runner.startsWith('/')) {
        const found = which(runner);
        if (!found) return `错误: 找不到可执行文件: ${runner}`;
        resolvedRunner = found;
      }

      const result = Bun.spawnSync([resolvedRunner, ...args], {
        cwd: workingDir,
        timeout,
        env: filterEnv(),
      });

      const stdout = result.stdout?.toString() || '';
      const stderr = result.stderr?.toString() || '';
      const exitCode = result.exitCode;

      let output = stdout;
      if (stderr) output += (output ? '\n' : '') + `[stderr] ${stderr}`;
      if (!output && exitCode) output = `(退出码: ${exitCode})`;
      if (!output) output = '(无输出)';

      return output;
    } catch (error) {
      return `执行失败: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
});

// ============================================================================
// glob 工具 - 文件模式匹配
// ============================================================================

/** 将 glob 模式转换为正则表达式 */
function globToRegex(pattern: string): RegExp {
  let regex = pattern
    // 转义正则特殊字符（除了 * 和 ?）
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    // ** 匹配任意目录层级
    .replace(/\*\*/g, '{{DOUBLESTAR}}')
    // * 匹配非路径分隔符
    .replace(/\*/g, '[^/\\\\]*')
    // ? 匹配单个非路径分隔符
    .replace(/\?/g, '[^/\\\\]')
    // 恢复 **
    .replace(/\{\{DOUBLESTAR\}\}/g, '.*');
  
  return new RegExp(`^${regex}$`, 'i');
}

/** 检查路径是否匹配 glob 模式 */
function matchGlob(filePath: string, pattern: string): boolean {
  // 支持多个模式（逗号分隔）
  const patterns = pattern.split(',').map(p => p.trim());
  for (const p of patterns) {
    const regex = globToRegex(p);
    if (regex.test(filePath) || regex.test(filePath.replace(/\\/g, '/'))) {
      return true;
    }
  }
  return false;
}

/** 递归收集文件 */
function collectFiles(
  dir: string,
  baseDir: string,
  pattern?: string,
  maxFiles = 1000
): string[] {
  const files: string[] = [];
  
  function walk(currentDir: string): void {
    if (files.length >= maxFiles) return;
    
    try {
      const entries = readdirSync(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        if (files.length >= maxFiles) break;
        
        // 跳过隐藏文件和常见忽略目录
        if (entry.name.startsWith('.')) continue;
        if (['node_modules', 'dist', 'build', 'out', '.git'].includes(entry.name)) continue;
        
        const fullPath = join(currentDir, entry.name);
        const relativePath = relative(baseDir, fullPath);
        
        if (entry.isDirectory()) {
          walk(fullPath);
        } else if (entry.isFile()) {
          // 如果有模式，检查是否匹配
          if (!pattern || matchGlob(relativePath, pattern) || matchGlob(entry.name, pattern)) {
            files.push(fullPath);
          }
        }
      }
    } catch {
      // 忽略无权限访问的目录
    }
  }
  
  walk(dir);
  return files;
}

export const GlobTool = defineTool({
  name: 'glob',
  description: `使用 glob 模式查找文件。

使用场景：
- 快速定位特定类型文件
- 按命名模式搜索文件
- 探索项目结构

参数说明：
- pattern: glob 模式（支持 * 和 **）
- path: 搜索起始路径（可选，默认工作区）

模式语法：
- * 匹配任意非路径分隔符字符
- ** 匹配任意层级目录
- *.ts 匹配所有 TypeScript 文件
- **/*.test.ts 匹配所有测试文件
- src/** 匹配 src 下所有文件

示例：
- glob({ pattern: "*.ts" }) - 查找所有 TS 文件
- glob({ pattern: "**/*.test.ts" }) - 查找所有测试文件
- glob({ pattern: "src/**/*.ts", path: "packages/core" }) - 指定路径搜索`,
  inputSchema: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'glob 模式。支持 *（匹配非路径字符）和 **（匹配任意目录层级）。',
      },
      path: {
        type: 'string',
        description: '搜索起始路径。默认为工作区根目录。',
      },
    },
    required: ['pattern'],
  } satisfies JSONSchema,
  execute: async (input: unknown, ctx: ToolContext) => {
    let pattern: string;
    let searchPath: string | undefined;

    if (typeof input === 'string') {
      pattern = input;
    } else if (input && typeof input === 'object') {
      const obj = input as Record<string, unknown>;
      pattern = String(obj.pattern ?? '');
      if (obj.path) searchPath = String(obj.path);
    } else {
      return '错误: 无效的输入格式';
    }

    if (!pattern) {
      return '错误: 缺少 pattern 参数';
    }

    const basePath = searchPath ? resolvePath(searchPath, ctx.workspace) : ctx.workspace;
    const validation = validatePathAccess(basePath, ctx.workspace, ctx.knowledgeBase);

    if (!validation.allowed) {
      return `错误: ${validation.error}`;
    }

    if (!existsSync(basePath)) {
      return `错误: 路径不存在: ${searchPath || '工作区'}`;
    }

    const files = collectFiles(basePath, basePath, pattern);
    const relativeFiles = files.map(f => relative(ctx.workspace, f));

    if (relativeFiles.length === 0) {
      return '未找到匹配的文件';
    }

    return relativeFiles.join('\n');
  },
});

// ============================================================================
// grep 工具 - 内容搜索
// ============================================================================

/** 匹配结果 */
interface GrepMatch {
  file: string;
  line: number;
  content: string;
}

/** 在单个文件中搜索 */
function searchInFile(
  filePath: string,
  pattern: RegExp,
  maxMatches: number
): GrepMatch[] {
  const matches: GrepMatch[] = [];
  
  try {
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    
    for (let i = 0; i < lines.length && matches.length < maxMatches; i++) {
      // 重置正则 lastIndex 以确保正确匹配
      pattern.lastIndex = 0;
      if (pattern.test(lines[i])) {
        matches.push({
          file: filePath,
          line: i + 1,
          content: lines[i].trim(),
        });
      }
    }
  } catch {
    // 忽略无法读取的文件
  }
  
  return matches;
}

export const GrepTool = defineTool({
  name: 'grep',
  description: `在文件内容中搜索正则表达式模式。

使用场景：
- 搜索代码中的特定字符串
- 查找函数定义、变量引用
- 正则表达式模式匹配

参数说明：
- pattern: 正则表达式模式
- path: 搜索路径（可选，默认工作区）
- include: 文件过滤 glob 模式（可选，如 *.ts）
- output_mode: 输出模式 - content(显示内容)/files(仅文件名)/count(计数)
- case_sensitive: 是否区分大小写（可选，默认 false）

示例：
- grep({ pattern: "function\\s+\\w+", include: "*.ts" }) - 查找函数定义
- grep({ pattern: "TODO|FIXME", path: "src" }) - 查找待办标记
- grep({ pattern: "import.*from", include: "*.ts", output_mode: "files" }) - 查找导入语句`,
  inputSchema: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: '正则表达式模式。支持标准 JavaScript 正则语法。',
      },
      path: {
        type: 'string',
        description: '搜索路径。默认为工作区根目录。',
      },
      include: {
        type: 'string',
        description: '文件过滤 glob 模式。如 *.ts、*.{ts,tsx}。',
      },
      output_mode: {
        type: 'string',
        enum: ['content', 'files', 'count'],
        description: '输出模式：content(显示匹配内容)、files(仅文件名)、count(匹配计数)。默认 content。',
      },
      case_sensitive: {
        type: 'boolean',
        description: '是否区分大小写。默认 false。',
      },
    },
    required: ['pattern'],
  } satisfies JSONSchema,
  execute: async (input: unknown, ctx: ToolContext) => {
    if (!input || typeof input !== 'object') {
      return '错误: 无效的输入格式';
    }

    const obj = input as Record<string, unknown>;
    const patternStr = obj.pattern;
    
    if (!patternStr || typeof patternStr !== 'string') {
      return '错误: 缺少 pattern 参数';
    }

    const searchPath = obj.path ? String(obj.path) : undefined;
    const includePattern = obj.include ? String(obj.include) : undefined;
    const outputMode = (obj.output_mode as 'content' | 'files' | 'count') || 'content';
    const caseSensitive = obj.case_sensitive === true;

    // 构建正则表达式
    let regex: RegExp;
    try {
      regex = new RegExp(patternStr, caseSensitive ? 'g' : 'gi');
    } catch (e) {
      return `错误: 无效的正则表达式: ${patternStr}`;
    }

    const basePath = searchPath ? resolvePath(searchPath, ctx.workspace) : ctx.workspace;
    const validation = validatePathAccess(basePath, ctx.workspace, ctx.knowledgeBase);

    if (!validation.allowed) {
      return `错误: ${validation.error}`;
    }

    if (!existsSync(basePath)) {
      return `错误: 路径不存在: ${searchPath || '工作区'}`;
    }

    // 收集文件
    const files = collectFiles(basePath, basePath, includePattern, 50);
    const allMatches: GrepMatch[] = [];
    const matchedFiles = new Set<string>();
    const maxTotalMatches = 100;

    for (const file of files) {
      if (allMatches.length >= maxTotalMatches) break;
      
      const remaining = maxTotalMatches - allMatches.length;
      const matches = searchInFile(file, regex, remaining);
      
      if (matches.length > 0) {
        matchedFiles.add(file);
        allMatches.push(...matches);
      }
    }

    if (allMatches.length === 0) {
      return '未找到匹配内容';
    }

    // 根据输出模式格式化结果
    let result: string;
    
    switch (outputMode) {
      case 'files':
        result = Array.from(matchedFiles)
          .map(f => relative(ctx.workspace, f))
          .join('\n');
        break;
        
      case 'count':
        const countByFile = new Map<string, number>();
        for (const m of allMatches) {
          countByFile.set(m.file, (countByFile.get(m.file) || 0) + 1);
        }
        result = Array.from(countByFile.entries())
          .map(([file, count]) => `${relative(ctx.workspace, file)}: ${count}`)
          .join('\n');
        break;
        
      case 'content':
      default:
        result = allMatches
          .map(m => `${relative(ctx.workspace, m.file)}:${m.line}: ${m.content}`)
          .join('\n');
        break;
    }

    return result;
  },
});

// ============================================================================
// edit 工具 - 精确编辑文件
// ============================================================================

export const EditTool = defineTool({
  name: 'edit',
  description: `精确编辑文件，通过查找和替换文本。

使用场景：
- 修改代码中的特定函数或变量
- 更新配置文件中的值
- 精确修改文件内容而不覆盖整个文件

参数说明：
- path: 文件路径
- old_string: 要查找的文本（必须精确匹配）
- new_string: 替换后的文本
- replace_all: 是否替换所有匹配（可选，默认 false）

注意事项：
- old_string 必须精确匹配，包括空格和换行
- 如果 old_string 出现多次且未设置 replace_all，会报错
- 建议提供足够的上下文确保唯一匹配

示例：
- edit({ path: "src/index.ts", old_string: "const x = 1", new_string: "const x = 2" })
- edit({ path: "config.json", old_string: '\"debug\": false', new_string: '\"debug\": true' })
- edit({ path: "app.ts", old_string: "foo", new_string: "bar", replace_all: true })`,
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: '文件路径。支持相对路径、~ 路径、绝对路径。',
      },
      old_string: {
        type: 'string',
        description: '要查找并替换的文本。必须精确匹配，包括空格、缩进、换行。',
      },
      new_string: {
        type: 'string',
        description: '替换后的新文本。',
      },
      replace_all: {
        type: 'boolean',
        description: '是否替换所有匹配项。默认 false（仅替换第一个匹配）。',
      },
    },
    required: ['path', 'old_string', 'new_string'],
  } satisfies JSONSchema,
  examples: [
    { description: '修改变量值', input: { path: 'src/config.ts', old_string: 'const timeout = 5000', new_string: 'const timeout = 10000' } },
    { description: '替换所有匹配', input: { path: 'app.ts', old_string: 'var', new_string: 'let', replace_all: true } },
    { description: '更新 JSON 配置', input: { path: 'package.json', old_string: '\"version\": \"1.0.0\"', new_string: '\"version\": \"1.1.0\"' } },
  ],
  execute: async (input: unknown, ctx: ToolContext) => {
    if (!input || typeof input !== 'object') {
      return '错误: 无效的输入格式';
    }

    const obj = input as Record<string, unknown>;
    const path = obj.path;
    const oldString = obj.old_string;
    const newString = obj.new_string;
    const replaceAll = obj.replace_all === true;

    // 参数验证
    if (!path || typeof path !== 'string') {
      return '错误: 缺少 path 参数';
    }
    if (typeof oldString !== 'string') {
      return '错误: 缺少 old_string 参数';
    }
    if (typeof newString !== 'string') {
      return '错误: 缺少 new_string 参数';
    }
    if (oldString === '') {
      return '错误: old_string 不能为空字符串';
    }
    if (oldString === newString) {
      return '错误: old_string 和 new_string 相同，无需替换';
    }

    // 路径验证
    const filePath = resolvePath(path, ctx.workspace);
    const validation = validatePathAccess(filePath, ctx.workspace, ctx.knowledgeBase);
    
    if (!validation.allowed) {
      return `错误: ${validation.error}`;
    }

    if (!existsSync(filePath)) {
      return `错误: 文件不存在: ${path}`;
    }

    const stats = statSync(filePath);
    if (stats.isDirectory()) {
      return `错误: ${path} 是目录，不能编辑`;
    }

    // 读取文件内容
    const content = readFileSync(filePath, 'utf-8');

    // 统计 old_string 出现次数（精确匹配）
    let count = 0;
    let searchPos = 0;
    while (true) {
      const pos = content.indexOf(oldString, searchPos);
      if (pos === -1) break;
      count++;
      searchPos = pos + oldString.length;
    }

    // 未找到匹配
    if (count === 0) {
      // 提供相似度匹配建议（基于简单启发式）
      const suggestions: string[] = [];
      const lines = content.split('\n');
      
      for (let i = 0; i < Math.min(lines.length, 50); i++) {
        const line = lines[i];
        // 简单相似度检查：包含部分关键字
        if (oldString.length > 10) {
          const snippet = oldString.slice(0, 20);
          if (line.includes(snippet)) {
            suggestions.push(`第 ${i + 1} 行: ${line.trim().slice(0, 80)}`);
          }
        }
      }

      let msg = `错误: 未找到匹配的文本。\n查找内容:\n${oldString}`;
      if (suggestions.length > 0) {
        msg += `\n\n可能的相似内容:\n${suggestions.slice(0, 3).join('\n')}`;
      }
      return msg;
    }

    // 多次匹配但未设置 replace_all
    if (count > 1 && !replaceAll) {
      return `错误: 找到 ${count} 处匹配，请确认是否要全部替换。\n如果确认，请设置 replace_all: true。\n或者提供更多上下文以确保唯一匹配。`;
    }

    // 执行替换
    const newContent = replaceAll 
      ? content.split(oldString).join(newString)
      : content.replace(oldString, newString);

    // 写回文件
    writeFileSync(filePath, newContent, 'utf-8');

    const action = replaceAll ? `替换了 ${count} 处` : '替换了 1 处';
    return `${action}: ${path}`;
  },
});

// ============================================================================
// list_directory 工具 - 列出目录内容
// ============================================================================

/** 目录项信息 */
interface DirEntry {
  name: string;
  isDirectory: boolean;
  size?: number;
}

/** 解析 .gitignore 文件 */
function parseGitignore(gitignorePath: string): string[] {
  try {
    if (!existsSync(gitignorePath)) return [];
    const content = readFileSync(gitignorePath, 'utf-8');
    return content
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'));
  } catch {
    return [];
  }
}

/** 检查路径是否匹配 gitignore 规则 */
function matchGitignore(name: string, isDir: boolean, patterns: string[]): boolean {
  for (const pattern of patterns) {
    // 目录专用规则
    if (pattern.endsWith('/')) {
      if (isDir) {
        const dirPattern = pattern.slice(0, -1);
        if (name === dirPattern || matchGlob(name, dirPattern)) {
          return true;
        }
      }
    }
    // 否定规则
    else if (pattern.startsWith('!')) {
      continue;
    }
    // 通配符规则
    else if (pattern.includes('*')) {
      if (matchGlob(name, pattern)) {
        return true;
      }
    }
    // 精确匹配
    else if (name === pattern) {
      return true;
    }
  }
  return false;
}

/** 格式化文件大小 */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export const ListDirectoryTool = defineTool({
  name: 'list_directory',
  description: `列出目录内容，返回文件和子目录列表。

使用场景：
- 探索目录结构
- 查找特定文件或目录
- 了解项目布局

参数说明：
- path: 目录路径（默认工作区）
- ignore: 要忽略的 glob 模式数组（可选）
- respect_git_ignore: 是否遵循 .gitignore（可选，默认 true）

返回格式：
- 📁 目录名/
- 📄 文件名 (大小)

示例：
- list_directory({ path: "src" }) - 列出 src 目录内容
- list_directory({ path: ".", ignore: ["node_modules", "*.log"] }) - 忽略特定内容`,
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: '目录路径。支持相对路径、~ 路径、绝对路径。默认为工作区根目录。',
      },
      ignore: {
        type: 'array',
        items: { type: 'string' },
        description: '要忽略的 glob 模式数组。如 ["node_modules", "*.log"]。',
      },
      respect_git_ignore: {
        type: 'boolean',
        description: '是否遵循 .gitignore 规则。默认 true。',
      },
    },
    required: [],
  } satisfies JSONSchema,
  examples: [
    { description: '列出工作区根目录', input: {} },
    { description: '列出 src 目录', input: { path: 'src' } },
    { description: '忽略特定内容', input: { path: '.', ignore: ['node_modules', '*.log'] } },
  ],
  execute: async (input: unknown, ctx: ToolContext) => {
    let dirPath: string | undefined;
    let ignorePatterns: string[] = [];
    let respectGitignore = true;

    if (input && typeof input === 'object') {
      const obj = input as Record<string, unknown>;
      if (obj.path) dirPath = String(obj.path);
      if (Array.isArray(obj.ignore)) {
        ignorePatterns = obj.ignore.filter((p): p is string => typeof p === 'string');
      }
      if (typeof obj.respect_git_ignore === 'boolean') {
        respectGitignore = obj.respect_git_ignore;
      }
    }

    const resolvedPath = dirPath ? resolvePath(dirPath, ctx.workspace) : ctx.workspace;
    const validation = validatePathAccess(resolvedPath, ctx.workspace, ctx.knowledgeBase);

    if (!validation.allowed) {
      return `错误: ${validation.error}`;
    }

    if (!existsSync(resolvedPath)) {
      return `错误: 路径不存在: ${dirPath || '工作区'}`;
    }

    const stats = statSync(resolvedPath);
    if (!stats.isDirectory()) {
      return `错误: ${dirPath || '工作区'} 不是目录`;
    }

    // 读取目录内容
    let entries: DirEntry[];
    try {
      const dirents = readdirSync(resolvedPath, { withFileTypes: true });
      entries = dirents.map(dirent => ({
        name: dirent.name,
        isDirectory: dirent.isDirectory(),
        size: dirent.isFile() ? statSync(join(resolvedPath, dirent.name)).size : undefined,
      }));
    } catch (e) {
      return `错误: 无法读取目录: ${e instanceof Error ? e.message : String(e)}`;
    }

    // 解析 gitignore
    let gitignorePatterns: string[] = [];
    if (respectGitignore) {
      const gitignorePath = join(resolvedPath, '.gitignore');
      gitignorePatterns = parseGitignore(gitignorePath);
    }

    // 过滤条目
    const filtered = entries.filter(entry => {
      // 隐藏文件
      if (entry.name.startsWith('.')) return false;

      // gitignore 规则
      if (respectGitignore && gitignorePatterns.length > 0) {
        if (matchGitignore(entry.name, entry.isDirectory, gitignorePatterns)) {
          return false;
        }
      }

      // 自定义 ignore 模式
      for (const pattern of ignorePatterns) {
        if (matchGlob(entry.name, pattern)) {
          return false;
        }
      }

      return true;
    });

    // 排序：目录在前，然后按名称排序
    filtered.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) {
        return a.isDirectory ? -1 : 1;
      }
      return a.name.localeCompare(b.name, 'zh-CN');
    });

    // 格式化输出
    const lines = filtered.map(entry => {
      if (entry.isDirectory) {
        return `📁 ${entry.name}/`;
      }
      return `📄 ${entry.name} (${formatSize(entry.size!)})`;
    });

    if (lines.length === 0) {
      return '目录为空';
    }

    return lines.join('\n');
  },
});

// ============================================================================
// todo 工具 - 任务管理
// ============================================================================

/** 任务状态 */
type TodoStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

/** 任务优先级 */
type TodoPriority = 'high' | 'medium' | 'low';

/** 任务项 */
interface TodoItem {
  id: string;
  task: string;
  status: TodoStatus;
  priority?: TodoPriority;
}

/** 任务存储结构 */
interface TodoStorage {
  [chatId: string]: {
    todos: TodoItem[];
    updatedAt: string;
  };
}

// 注意：TODO_STORAGE_PATH 已从 @micro-agent/sdk 导入

/** 读取任务存储 */
function readTodoStorage(): TodoStorage {
  try {
    if (!existsSync(TODO_STORAGE_PATH)) {
      return {};
    }
    const content = readFileSync(TODO_STORAGE_PATH, 'utf-8');
    return JSON.parse(content) as TodoStorage;
  } catch {
    return {};
  }
}

/** 写入任务存储 */
function writeTodoStorage(storage: TodoStorage): void {
  const dir = resolve(TODO_STORAGE_PATH, '..');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(TODO_STORAGE_PATH, JSON.stringify(storage, null, 2), 'utf-8');
}

/** 状态图标映射 */
const STATUS_ICONS: Record<TodoStatus, string> = {
  pending: '⏳',
  in_progress: '🔄',
  completed: '✅',
  failed: '❌',
};

/** 优先级标记映射 */
const PRIORITY_MARKS: Record<TodoPriority, string> = {
  high: '🔴',
  medium: '🟡',
  low: '🟢',
};

export const TodoWriteTool = defineTool({
  name: 'todo_write',
  description: `创建和管理任务列表。

使用场景：
- 规划复杂任务的执行步骤
- 跟踪多步骤任务的进度
- 向用户展示工作计划

参数说明：
- todos: 任务数组，每个任务包含：
  - id: 唯一标识符
  - task: 任务描述
  - status: 状态
  - priority: 优先级 (high/medium/low，可选)

状态说明：
- pending: 待开始
- in_progress: 进行中（应同时只有一个）
- completed: 已完成
- failed: 失败

示例：
- todo_write({ todos: [{ id: "1", task: "分析代码", status: "completed", priority: "high" }, { id: "2", task: "编写测试", status: "in_progress", priority: "high" }] })`,
  inputSchema: {
    type: 'object',
    properties: {
      todos: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', description: '任务唯一标识符' },
            task: { type: 'string', description: '任务描述' },
            status: { type: 'string', enum: ['pending', 'in_progress', 'completed', 'failed'], description: '任务状态' },
            priority: { type: 'string', enum: ['high', 'medium', 'low'], description: '优先级' },
          },
          required: ['id', 'task', 'status'],
        },
        description: '任务列表数组',
      },
    },
    required: ['todos'],
  } satisfies JSONSchema,
  examples: [
    { description: '创建任务列表', input: { todos: [{ id: '1', task: '分析需求', status: 'pending', priority: 'high' }] } },
  ],
  execute: async (input: unknown, ctx: ToolContext) => {
    if (!input || typeof input !== 'object') {
      return '错误: 无效的输入格式';
    }

    const obj = input as Record<string, unknown>;
    const todosInput = obj.todos;

    if (!Array.isArray(todosInput)) {
      return '错误: todos 必须是数组';
    }

    // 解析和验证任务
    const todos: TodoItem[] = [];
    for (let i = 0; i < todosInput.length; i++) {
      const item = todosInput[i];
      if (!item || typeof item !== 'object') {
        return `错误: todos[${i}] 格式无效`;
      }

      const t = item as Record<string, unknown>;
      const id = t.id;
      const task = t.task;
      const status = t.status as TodoStatus;
      const priority = t.priority as TodoPriority | undefined;

      if (typeof id !== 'string' || !id) {
        return `错误: todos[${i}].id 必须是非空字符串`;
      }
      if (typeof task !== 'string' || !task) {
        return `错误: todos[${i}].task 必须是非空字符串`;
      }
      if (!['pending', 'in_progress', 'completed', 'failed'].includes(status)) {
        return `错误: todos[${i}].status 必须是 pending/in_progress/completed/failed 之一`;
      }
      if (priority !== undefined && !['high', 'medium', 'low'].includes(priority)) {
        return `错误: todos[${i}].priority 必须是 high/medium/low 之一`;
      }

      todos.push({ id, task, status, priority });
    }

    // 检查是否同时有多个 in_progress 任务
    const inProgressCount = todos.filter(t => t.status === 'in_progress').length;
    if (inProgressCount > 1) {
      return '警告: 同时有多个任务处于 in_progress 状态，建议同时只进行一个任务';
    }

    // 获取或创建 chatId
    const chatId = ctx.chatId || 'default';

    // 读取现有存储并更新
    const storage = readTodoStorage();
    storage[chatId] = {
      todos,
      updatedAt: new Date().toISOString(),
    };
    writeTodoStorage(storage);

    // 统计信息
    const statusCount = {
      pending: todos.filter(t => t.status === 'pending').length,
      in_progress: todos.filter(t => t.status === 'in_progress').length,
      completed: todos.filter(t => t.status === 'completed').length,
      failed: todos.filter(t => t.status === 'failed').length,
    };

    return `已保存 ${todos.length} 个任务:\n` +
      `- 待开始: ${statusCount.pending}\n` +
      `- 进行中: ${statusCount.in_progress}\n` +
      `- 已完成: ${statusCount.completed}\n` +
      `- 失败: ${statusCount.failed}`;
  },
});

export const TodoReadTool = defineTool({
  name: 'todo_read',
  description: `读取当前任务列表。\n\n返回当前会话的任务列表状态，包含每个任务的 id、描述、状态和优先级。`,
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  } satisfies JSONSchema,
  examples: [
    { description: '读取当前任务列表', input: {} },
  ],
  execute: async (input: unknown, ctx: ToolContext) => {
    const chatId = ctx.chatId || 'default';
    const storage = readTodoStorage();
    const todoData = storage[chatId];

    if (!todoData || todoData.todos.length === 0) {
      return '当前没有任务列表。使用 todo_write 创建任务。';
    }

    // 格式化输出
    const lines: string[] = [
      `任务列表 (${todoData.todos.length} 项) - 更新于 ${new Date(todoData.updatedAt).toLocaleString('zh-CN')}`,
      '',
    ];

    for (const todo of todoData.todos) {
      const icon = STATUS_ICONS[todo.status];
      const priorityMark = todo.priority ? ` ${PRIORITY_MARKS[todo.priority]}` : '';
      lines.push(`${icon}${priorityMark} [${todo.id}] ${todo.task}`);
    }

    // 统计摘要
    const statusCount = {
      pending: todoData.todos.filter(t => t.status === 'pending').length,
      in_progress: todoData.todos.filter(t => t.status === 'in_progress').length,
      completed: todoData.todos.filter(t => t.status === 'completed').length,
      failed: todoData.todos.filter(t => t.status === 'failed').length,
    };

    lines.push('');
    lines.push(`摘要: ⏳${statusCount.pending} | 🔄${statusCount.in_progress} | ✅${statusCount.completed} | ❌${statusCount.failed}`);

    return lines.join('\n');
  },
});

// ============================================================================
// ask_user 工具 - 用户交互
// ============================================================================

/** 问题选项 */
interface QuestionOption {
  label: string;
  description?: string;
}

/** 问题定义 */
interface Question {
  question: string;
  header: string;
  options: QuestionOption[];
  multiSelect?: boolean;
}

/** 用户回答 */
interface UserAnswer {
  questionIndex: number;
  selectedOptions: string[];
  customInput?: string;
}

export const AskUserTool = defineTool({
  name: 'ask_user',
  description: `向用户提问并获取选择或输入。

使用场景：
- 需要用户确认或选择时
- 多个选项需要用户决策时
- 收集用户信息或偏好

参数说明：
- questions: 问题数组，每个问题包含：
  - question: 问题内容
  - header: 简短标签（显示在 chip 上，最多 12 字符）
  - options: 选项数组（每个选项有 label 和 description）
  - multiSelect: 是否允许多选（可选，默认 false）

注意事项：
- 问题数量限制 1-4 个
- 每个问题选项 2-4 个
- 用户也可以选择 "Other" 提供自定义输入

示例：
- ask_user({ questions: [{ question: "使用哪个框架？", header: "Framework", options: [{ label: "React", description: "Facebook 的 UI 库" }, { label: "Vue", description: "渐进式框架" }], multiSelect: false }] })`,
  inputSchema: {
    type: 'object',
    properties: {
      questions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            question: { type: 'string', description: '问题内容' },
            header: { type: 'string', description: '简短标签（最多 12 字符）' },
            options: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  label: { type: 'string', description: '选项显示文本' },
                  description: { type: 'string', description: '选项说明' },
                },
                required: ['label'],
              },
              description: '选项列表（2-4 个）',
            },
            multiSelect: { type: 'boolean', description: '是否允许多选' },
          },
          required: ['question', 'header', 'options'],
        },
        description: '问题列表（1-4 个）',
      },
    },
    required: ['questions'],
  } satisfies JSONSchema,
  examples: [
    { description: '选择框架', input: { questions: [{ question: '使用哪个框架？', header: 'Framework', options: [{ label: 'React', description: "Facebook 的 UI 库" }, { label: 'Vue', description: '渐进式框架' }], multiSelect: false }] } },
    { description: '多选功能', input: { questions: [{ question: '需要哪些功能？', header: 'Features', options: [{ label: '认证', description: '用户登录系统' }, { label: '支付', description: '在线支付' }], multiSelect: true }] } },
  ],
  execute: async (input: unknown, ctx: ToolContext) => {
    if (!input || typeof input !== 'object') {
      return createErrorResult(
        'INVALID_INPUT',
        '无效的输入格式',
        '请提供包含 questions 数组的对象'
      );
    }

    const obj = input as Record<string, unknown>;
    const questionsInput = obj.questions;

    if (!Array.isArray(questionsInput)) {
      return createErrorResult(
        'VALIDATION_ERROR',
        'questions 必须是数组',
        '请提供问题列表数组'
      );
    }

    // 验证问题数量
    if (questionsInput.length < 1 || questionsInput.length > 4) {
      return createErrorResult(
        'VALIDATION_ERROR',
        `问题数量必须在 1-4 个之间，当前: ${questionsInput.length}`,
        '调整问题数量到有效范围'
      );
    }

    // 解析和验证每个问题
    const questions: Question[] = [];
    for (let i = 0; i < questionsInput.length; i++) {
      const q = questionsInput[i] as Record<string, unknown>;

      if (!q || typeof q !== 'object') {
        return createErrorResult(
          'VALIDATION_ERROR',
          `questions[${i}] 格式无效`,
          '确保每个问题都是有效对象'
        );
      }

      const question = q.question;
      const header = q.header;
      const options = q.options;
      const multiSelect = q.multiSelect === true;

      if (typeof question !== 'string' || !question.trim()) {
        return createErrorResult(
          'VALIDATION_ERROR',
          `questions[${i}].question 必须是非空字符串`,
          '提供有效的问题内容'
        );
      }

      if (typeof header !== 'string' || !header.trim()) {
        return createErrorResult(
          'VALIDATION_ERROR',
          `questions[${i}].header 必须是非空字符串`,
          '提供有效的标签'
        );
      }

      if (header.length > 12) {
        return createErrorResult(
          'VALIDATION_ERROR',
          `questions[${i}].header 长度不能超过 12 字符，当前: ${header.length}`,
          '缩短标签长度'
        );
      }

      if (!Array.isArray(options)) {
        return createErrorResult(
          'VALIDATION_ERROR',
          `questions[${i}].options 必须是数组`,
          '提供选项列表'
        );
      }

      if (options.length < 2 || options.length > 4) {
        return createErrorResult(
          'VALIDATION_ERROR',
          `questions[${i}].options 数量必须在 2-4 个之间，当前: ${options.length}`,
          '调整选项数量到有效范围'
        );
      }

      // 验证每个选项
      const validatedOptions: QuestionOption[] = [];
      for (let j = 0; j < options.length; j++) {
        const opt = options[j] as Record<string, unknown>;
        if (!opt || typeof opt !== 'object') {
          return createErrorResult(
            'VALIDATION_ERROR',
            `questions[${i}].options[${j}] 格式无效`,
            '确保每个选项都是有效对象'
          );
        }

        const label = opt.label;
        if (typeof label !== 'string' || !label.trim()) {
          return createErrorResult(
            'VALIDATION_ERROR',
            `questions[${i}].options[${j}].label 必须是非空字符串`,
            '提供有效的选项标签'
          );
        }

        validatedOptions.push({
          label: label.trim(),
          description: typeof opt.description === 'string' ? opt.description : undefined,
        });
      }

      questions.push({
        question: question.trim(),
        header: header.trim(),
        options: validatedOptions,
        multiSelect,
      });
    }

    // 构建发送给用户的消息
    const askMessage = {
      type: 'ask_user',
      chatId: ctx.chatId,
      timestamp: new Date().toISOString(),
      payload: {
        questions: questions.map((q, idx) => ({
          id: `q_${idx}`,
          question: q.question,
          header: q.header,
          options: q.options.map((opt, optIdx) => ({
            id: `q_${idx}_opt_${optIdx}`,
            label: opt.label,
            description: opt.description,
          })),
          multiSelect: q.multiSelect,
        })),
      },
    };

    // 发送问题到消息总线
    try {
      await ctx.sendToBus(askMessage);
    } catch (error) {
      return createErrorResult(
        'SERVICE_UNAVAILABLE',
        '无法发送问题到用户界面',
        '检查消息总线连接状态'
      );
    }

    // 返回提示信息
    // 注意：实际的响应需要通过消息总线异步接收
    // 这里返回的是发送成功的确认，用户响应需要通过其他机制处理
    const questionSummary = questions
      .map((q, idx) => `${idx + 1}. ${q.header}: ${q.question} (${q.options.length} 个选项${q.multiSelect ? ', 多选' : ''})`)
      .join('\n');

    return createSuccessResult(`已向用户发送问题，等待响应...\n\n问题列表:\n${questionSummary}`);
  },
});

// ============================================================================
// 工具集合
// ============================================================================

/** 核心工具列表 */
export const coreTools: Tool[] = [
  ReadTool,
  WriteTool,
  ExecTool,
  GlobTool,
  GrepTool,
  EditTool,
  ListDirectoryTool,
  TodoWriteTool,
  TodoReadTool,
  AskUserTool,
];

