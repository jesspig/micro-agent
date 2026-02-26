/**
 * 模板文件处理
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { expandPath } from './workspace';

/** 用户配置目录 */
const USER_CONFIG_DIR = '~/.micro-agent';

/** 模板文件名列表 */
export const TEMPLATE_FILE_NAMES = ['SOUL.md', 'AGENTS.md', 'USER.md', 'IDENTITY.md', 'TOOLS.md', 'HEARTBEAT.md'];

/**
 * 查找模板文件
 */
export function findTemplateFile(
  fileName: string,
  systemDefaultsDir: string,
  workspace?: string,
  currentDir?: string
): string | null {
  const searchPaths = buildSearchPaths(fileName, systemDefaultsDir, workspace, currentDir);

  for (const p of searchPaths) {
    if (existsSync(p)) return p;
  }

  return null;
}

/**
 * 构建搜索路径列表
 */
function buildSearchPaths(
  fileName: string,
  systemDefaultsDir: string,
  workspace?: string,
  currentDir?: string
): string[] {
  const paths: string[] = [];

  // 目录级（向上递归，越近优先级越高）
  if (currentDir && workspace) {
    const normalizedCurrent = resolve(currentDir);
    const normalizedWorkspace = resolve(workspace);

    if (normalizedCurrent.startsWith(normalizedWorkspace)) {
      const pathChain = buildPathChain(normalizedWorkspace, normalizedCurrent);

      for (const d of pathChain) {
        paths.push(resolve(d, '.micro-agent', fileName));
        paths.push(resolve(d, fileName));
      }
    }
  }

  // 项目级
  if (workspace) {
    paths.push(resolve(workspace, '.micro-agent', fileName));
    paths.push(resolve(workspace, fileName));
  }

  // 用户级
  paths.push(resolve(expandPath(USER_CONFIG_DIR), fileName));
  paths.push(resolve(expandPath(USER_CONFIG_DIR), 'workspace', fileName));

  // 系统级（优先级最低）
  paths.push(resolve(systemDefaultsDir, fileName));

  return paths;
}

/**
 * 构建从 currentDir 向上到 workspace 的路径链
 */
function buildPathChain(workspace: string, currentDir: string): string[] {
  const chain: string[] = [];
  let dir = currentDir;

  while (dir.length >= workspace.length) {
    chain.push(dir);
    if (dir === workspace) break;

    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return chain;
}

/**
 * 加载模板文件内容
 */
export function loadTemplateFile(
  fileName: string,
  systemDefaultsDir: string,
  workspace?: string,
  currentDir?: string
): string | null {
  const filePath = findTemplateFile(fileName, systemDefaultsDir, workspace, currentDir);
  if (!filePath) return null;

  return readFileSync(filePath, 'utf-8');
}

/**
 * 加载所有模板文件
 */
export function loadAllTemplateFiles(
  systemDefaultsDir: string,
  workspace?: string,
  currentDir?: string
): Map<string, string> {
  const templates = new Map<string, string>();

  for (const fileName of TEMPLATE_FILE_NAMES) {
    const content = loadTemplateFile(fileName, systemDefaultsDir, workspace, currentDir);
    if (content) {
      templates.set(fileName, content);
    }
  }

  return templates;
}
