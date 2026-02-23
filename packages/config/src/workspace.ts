/**
 * 工作区访问控制
 */

import { resolve, dirname } from 'path';
import { homedir } from 'os';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import type { WorkspaceConfig } from './schema';

/** 用户配置目录 */
const USER_CONFIG_DIR = '~/.microbot';

/**
 * 展开路径（支持 ~ 前缀）
 */
export function expandPath(path: string): string {
  if (path.startsWith('~/')) {
    return resolve(homedir(), path.slice(2));
  }
  return resolve(path);
}

/**
 * 解析工作区路径列表
 */
export function resolveWorkspacePaths(workspaces: WorkspaceConfig[]): string[] {
  return workspaces.map(w => expandPath(w.path));
}

/**
 * 验证工作区访问权限
 *
 * MicroBot 是隔离的，只能读写工作区内的文件
 */
export function validateWorkspaceAccess(
  targetPath: string,
  allowedWorkspaces: WorkspaceConfig[] = []
): void {
  const normalizedTarget = resolve(expandPath(targetPath));
  const userDir = expandPath(USER_CONFIG_DIR);
  const defaultWorkspace = resolve(userDir, 'workspace');

  // 允许访问的路径
  const allowedPaths = [
    userDir,                    // ~/.microbot（配置目录）
    defaultWorkspace,           // 默认工作区
    ...resolveWorkspacePaths(allowedWorkspaces),
  ];

  for (const allowed of allowedPaths) {
    const normalizedAllowed = resolve(allowed);
    // 精确匹配或子路径匹配
    if (normalizedTarget === normalizedAllowed) return;
    if (normalizedTarget.startsWith(normalizedAllowed + '/')) return;
    if (normalizedTarget.startsWith(normalizedAllowed + '\\')) return;
  }

  // 构建错误信息
  const workspaceList = allowedWorkspaces.length > 0
    ? allowedWorkspaces.map(w => '  - ' + w.path).join('\n')
    : '  （未配置）';

  throw new Error(
    '工作区访问被拒绝: ' + targetPath + '\n' +
    '当前允许的工作区:\n' + workspaceList + '\n' +
    '如需访问此路径，请在 ~/.microbot/settings.yaml 中添加:\n' +
    'workspaces:\n' +
    '  - ' + targetPath
  );
}

/**
 * 检查工作区是否可访问
 */
export function canAccessWorkspace(
  targetPath: string,
  allowedWorkspaces: WorkspaceConfig[] = []
): boolean {
  try {
    validateWorkspaceAccess(targetPath, allowedWorkspaces);
    return true;
  } catch {
    return false;
  }
}

/**
 * 获取用户配置文件路径
 */
export function getUserConfigPath(): string {
  const userDir = expandPath(USER_CONFIG_DIR);
  const existing = findConfigFile(userDir);
  if (existing) return existing;
  return resolve(userDir, 'settings.yaml');
}

/**
 * 创建默认用户配置
 */
export function createDefaultUserConfig(systemDefaultsDir: string): void {
  const configPath = getUserConfigPath();
  if (existsSync(configPath)) return;

  const configDir = dirname(configPath);
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }

  // 查找模板文件（优先 settings.example.yaml）
  const templateNames = ['settings.example.yaml', 'settings.yaml'];
  let templatePath: string | null = null;
  for (const name of templateNames) {
    const p = resolve(systemDefaultsDir, name);
    if (existsSync(p)) {
      templatePath = p;
      break;
    }
  }

  if (templatePath) {
    const template = readFileSync(templatePath, 'utf-8');
    writeFileSync(configPath, template, 'utf-8');
  } else {
    writeFileSync(configPath, getMinimalConfig(), 'utf-8');
  }
}

/**
 * 获取最小配置（无模板时的备用）
 */
function getMinimalConfig(): string {
  return '' +
'# MicroBot 配置文件\n' +
'# 文档：https://microbot.dev/config\n' +
'\n' +
'agents:\n' +
'  models:\n' +
'    # chat: ollama/qwen3  # 必填\n' +
'\n' +
'providers:\n' +
'  # ollama:\n' +
'  #   baseUrl: http://localhost:11434/v1\n' +
'  #   models:\n' +
'  #     - qwen3\n' +
'\n';
}

/** 配置文件名列表 */
const CONFIG_FILE_NAMES = ['settings.yaml', 'settings.yml', 'settings.json'];

/**
 * 查找配置文件
 */
function findConfigFile(dir: string): string | null {
  for (const name of CONFIG_FILE_NAMES) {
    const path = resolve(dir, name);
    if (existsSync(path)) return path;
  }
  return null;
}
