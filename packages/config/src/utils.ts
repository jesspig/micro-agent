/**
 * 配置工具函数
 */

import { readFileSync, existsSync } from 'fs';
import { load } from 'js-yaml';
import { resolve, dirname, basename } from 'path';

/**
 * 深度合并对象
 * 
 * 规则：
 * - null 值会被跳过（YAML 空值不应覆盖默认值）
 * - undefined 值会被跳过
 * - providers 字段直接替换（而非合并）
 */
export function deepMerge<T extends Record<string, unknown>>(
  target: T,
  source: Partial<T>
): T {
  const result = { ...target };

  for (const key of Object.keys(source) as (keyof T)[]) {
    const sourceValue = source[key];
    const targetValue = result[key];

    // 跳过 null 和 undefined
    if (sourceValue === undefined || sourceValue === null) continue;

    // providers 特殊处理：直接替换（但仅当有实际内容时）
    if (key === 'providers' && typeof sourceValue === 'object') {
      result[key] = sourceValue as T[keyof T];
      continue;
    }

    // 递归合并对象
    if (
      typeof sourceValue === 'object' &&
      !Array.isArray(sourceValue) &&
      targetValue !== undefined &&
      targetValue !== null &&
      typeof targetValue === 'object' &&
      !Array.isArray(targetValue)
    ) {
      result[key] = deepMerge(
        targetValue as Record<string, unknown>,
        sourceValue as Record<string, unknown>
      ) as T[keyof T];
    } else {
      result[key] = sourceValue as T[keyof T];
    }
  }

  return result;
}

/**
 * 递归解析环境变量
 */
export function resolveEnvVars(obj: unknown): unknown {
  if (typeof obj === 'string') {
    return obj.replace(/\$\{(\w+)\}/g, (_, key) => process.env[key] ?? '');
  }
  if (Array.isArray(obj)) {
    return obj.map(resolveEnvVars);
  }
  if (obj && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [k, resolveEnvVars(v)])
    );
  }
  return obj;
}

/** 配置文件名列表 */
export const CONFIG_FILE_NAMES = ['settings.yaml', 'settings.yml', 'settings.json'];

/**
 * 查找配置文件
 */
export function findConfigFile(dir: string): string | null {
  for (const name of CONFIG_FILE_NAMES) {
    const path = resolve(dir, name);
    if (existsSync(path)) return path;
  }
  return null;
}

/**
 * 加载配置文件
 */
export function loadConfigFile(filePath: string): Record<string, unknown> {
  const content = readFileSync(filePath, 'utf-8');
  const ext = basename(filePath).split('.').pop()?.toLowerCase();

  let config: Record<string, unknown> | undefined;

  switch (ext) {
    case 'yaml':
    case 'yml':
      config = load(content) as Record<string, unknown> | undefined;
      break;
    case 'json':
      config = JSON.parse(content);
      break;
    default:
      config = load(content) as Record<string, unknown> | undefined;
  }

  return resolveEnvVars(config || {}) as Record<string, unknown>;
}

/**
 * 构建从 workspace 到 currentDir 的路径链
 */
export function buildPathChain(workspace: string, currentDir: string): string[] {
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
 * 获取内置默认配置
 */
export function getBuiltinDefaults(): Record<string, unknown> {
  return {
    agents: {
      workspace: '~/.micro-agent/workspace',
      maxTokens: 512,
      temperature: 0.7,
      executor: {
        maxIterations: 20,
      },
    },
    providers: {},
    channels: {},
  };
}
