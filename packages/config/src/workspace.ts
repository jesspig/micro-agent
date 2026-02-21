/**
 * 工作区访问控制
 */

import { resolve, dirname } from 'path';
import { homedir } from 'os';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';

/** 用户配置目录 */
const USER_CONFIG_DIR = '~/.microbot';

/** 默认允许访问的路径 */
const ALLOWED_DEFAULT_PATHS: string[] = [];

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
 * 验证工作区访问权限
 */
export function validateWorkspaceAccess(
  workspace: string,
  allowedWorkspaces: string[] = [],
  systemDefaultsDir: string
): void {
  const normalizedWorkspace = resolve(expandPath(workspace));
  const userDir = expandPath(USER_CONFIG_DIR);
  const defaultWorkspace = resolve(userDir, 'workspace');

  const allowedPaths = [
    ...ALLOWED_DEFAULT_PATHS,
    systemDefaultsDir,
    userDir,
    defaultWorkspace,
    ...allowedWorkspaces.map(expandPath),
  ];

  for (const allowed of allowedPaths) {
    if (normalizedWorkspace === resolve(allowed)) return;
    if (normalizedWorkspace.startsWith(resolve(allowed) + '/')) return;
  }

  throw new Error(
    `工作区访问被拒绝: ${workspace}\n` +
    `如需访问此路径，请在 ~/.microbot/settings.yaml 中添加:\n` +
    `workspaces:\n` +
    `  - ${workspace}`
  );
}

/**
 * 检查工作区是否可访问
 */
export function canAccessWorkspace(
  workspace: string,
  allowedWorkspaces: string[] = [],
  systemDefaultsDir: string
): boolean {
  try {
    validateWorkspaceAccess(workspace, allowedWorkspaces, systemDefaultsDir);
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

  const templatePath = resolve(systemDefaultsDir, 'settings.yaml');
  if (existsSync(templatePath)) {
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
  return `# microbot 配置文件
# 文档：https://github.com/jesspig/microbot

agents:
  models:
    chat: ollama/qwen3
  maxTokens: 8192
  temperature: 0.7

providers:
  ollama:
    baseUrl: http://localhost:11434/v1
    models:
      - id: qwen3
        level: medium

channels: {}
`;
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
