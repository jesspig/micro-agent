/**
 * 技能命令安全验证模块
 *
 * 使用白名单和严格解析来防止命令注入攻击
 */

import { parse } from "shell-quote";

// ============================================================================
// 常量定义
// ============================================================================

/** 命令白名单（按类别组织） */
const ALLOWED_COMMANDS = new Set([
  // 文件操作（只读）
  "ls",
  "dir",
  "cat",
  "type",
  "head",
  "tail",
  "grep",
  "find",
  "tree",
  "file",
  "wc",
  "stat",

  // 开发工具
  "node",
  "python",
  "python3",
  "bun",
  "deno",
  "npm",
  "pnpm",
  "yarn",
  "cargo",
  "go",
  "rustc",
  "gcc",
  "g++",
  "clang",
  "clang++",

  // 版本控制
  "git",
  "hg",
  "svn",

  // 构建工具
  "make",
  "cmake",
  "meson",
  "ninja",
  "gradle",
  "maven",
  "mvn",

  // 测试工具
  "jest",
  "vitest",
  "pytest",
  "cargo-test",

  // 文档工具
  "tsc",
  "eslint",
  "prettier",
  "black",
  "ruff",

  // 压缩解压
  "tar",
  "zip",
  "unzip",
  "gzip",
  "gunzip",
  "xz",
  "unxz",

  // 网络（只读）
  "curl",
  "wget",
  "ping",
  "traceroute",
  "nslookup",
  "dig",

  // 系统（只读）
  "echo",
  "pwd",
  "date",
  "whoami",
  "env",
  "printenv",
  "uname",
  "df",
  "du",
  "ps",
  "top",

  // 其他
  "ln",
  "cp",
  "mv",
  "mkdir",
  "touch",
  "chmod",
  "chown",
]);

/** 危险参数模式（即使命令在白名单中，包含这些参数也会被拒绝） */
const DANGEROUS_PATTERNS = [
  // 权限提升
  /sudo\b/i,
  /su\b/i,
  /doas\b/i,
  /run0\b/i,

  // 破坏性操作
  /\brm\s+-rf?\s+[\/\*~]/i,
  /\brm\s+-rf?\s+\.\./i,
  /:(){:\|:&};:/i,     // fork bomb
  /\>?\s*\/dev\/[a-z]+/i, // 直接写设备

  // 管道到 shell（危险）
  /\|\s*(sh|bash|zsh|fish|pwsh|powershell)/i,

  // 下载并执行
  /curl.*\|\s*(sh|bash)/i,
  /wget.*\|\s*(sh|bash)/i,
  /curl.*\>\s*.*\.sh/i,
  /wget.*\>\s*.*\.sh/i,

  // 格式化
  /\bmkfs\b/i,
  /\bformat\b/i,

  // 磁盘操作
  /\bdd\s+if=/i,
  /\bdd\s+of=/i,
];

/** 参数长度限制（防止参数注入） */
const MAX_ARG_LENGTH = 1000;
const MAX_ARGS_COUNT = 50;

// ============================================================================
// 类型定义
// ============================================================================

/** 命令解析结果 */
export interface ParsedCommand {
  /** 命令名称 */
  command: string;
  /** 参数列表 */
  args: string[];
  /** 是否被允许 */
  allowed: boolean;
  /** 拒绝原因 */
  reason?: string;
}

// ============================================================================
// 验证函数
// ============================================================================

/**
 * 验证单个参数是否安全
 */
function isArgSafe(arg: string): boolean {
  // 检查长度
  if (arg.length > MAX_ARG_LENGTH) {
    return false;
  }

  // 检查是否包含路径遍历
  if (arg.includes("..")) {
    return false;
  }

  // 检查是否包含命令替换
  if (arg.includes("$(") || arg.includes("`") || arg.includes("${")) {
    return false;
  }

  return true;
}

/**
 * 验证命令字符串是否包含危险模式
 */
function hasDangerousPattern(command: string): boolean {
  return DANGEROUS_PATTERNS.some(pattern => pattern.test(command));
}

/**
 * 解析并验证命令
 *
 * @param command - 要验证的命令字符串
 * @returns 解析结果
 */
export function validateCommand(command: string): ParsedCommand {
  // 去除首尾空白
  const trimmed = command.trim();

  // 检查危险模式
  if (hasDangerousPattern(trimmed)) {
    return {
      command: trimmed,
      args: [],
      allowed: false,
      reason: "命令包含危险模式",
    };
  }

  // 解析命令
  let tokens: string[];
  try {
    tokens = parse(trimmed);
  } catch {
    return {
      command: trimmed,
      args: [],
      allowed: false,
      reason: "命令语法错误",
    };
  }

  // 空命令
  if (tokens.length === 0) {
    return {
      command: trimmed,
      args: [],
      allowed: false,
      reason: "空命令",
    };
  }

  // 获取命令名称（去除路径前缀）
  const fullCommand = tokens[0]!;
  const commandName = fullCommand.split(/[\/\\]/).pop()!;

  // 检查命令是否在白名单中
  if (!ALLOWED_COMMANDS.has(commandName)) {
    return {
      command: commandName,
      args: tokens.slice(1),
      allowed: false,
      reason: `命令 "${commandName}" 不在允许列表中`,
    };
  }

  // 验证参数
  const args = tokens.slice(1);

  if (args.length > MAX_ARGS_COUNT) {
    return {
      command: commandName,
      args,
      allowed: false,
      reason: `参数过多 (${args.length}/${MAX_ARGS_COUNT})`,
    };
  }

  for (const arg of args) {
    if (typeof arg === "string" && !isArgSafe(arg)) {
      return {
        command: commandName,
        args,
        allowed: false,
        reason: `参数不安全: ${arg}`,
      };
    }
  }

  return {
    command: commandName,
    args,
    allowed: true,
  };
}

/**
 * 获取允许的命令列表
 */
export function getAllowedCommands(): string[] {
  return Array.from(ALLOWED_COMMANDS).sort();
}

/**
 * 检查命令是否在白名单中
 */
export function isCommandAllowed(command: string): boolean {
  const result = validateCommand(command);
  return result.allowed;
}
