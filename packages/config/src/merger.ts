/**
 * 配置合并模块
 *
 * 提供三级配置合并功能，支持来源追踪。
 */

import { existsSync, statSync } from 'fs';
import { resolve } from 'path';
import { deepMerge, loadConfigFile } from './utils';
import { ConfigLevel } from './loader';
import type { Config } from './schema';

/** 配置层级类型 */
export type ConfigScope = 'user' | 'project' | 'directory';

/** 配置源 */
export interface ConfigSource {
  /** 配置层级 */
  level: ConfigScope;
  /** 配置文件路径 */
  path: string;
  /** 配置内容 */
  content: Record<string, unknown>;
  /** 最后修改时间 */
  modifiedAt?: Date;
}

/** 合并结果 */
export interface MergedConfigResult {
  /** 合并后的配置 */
  config: Config;
  /** 配置来源列表（按优先级从低到高） */
  sources: ConfigSource[];
}

/**
 * 合并多级配置
 *
 * @param baseConfig - 基础配置
 * @param configPaths - 配置路径列表（按优先级排序）
 * @returns 合并结果
 */
export function mergeConfigs(
  baseConfig: Record<string, unknown>,
  configPaths: Array<{ level: ConfigLevel; path: string }>
): MergedConfigResult {
  const sources: ConfigSource[] = [];
  let merged = { ...baseConfig };

  for (const { level, path } of configPaths) {
    if (!existsSync(path)) continue;

    const content = loadConfigFile(path);
    const stats = statSync(path);
    const scope = levelToScope(level);

    sources.push({
      level: scope,
      path,
      content,
      modifiedAt: stats.mtime,
    });

    merged = deepMerge(merged, content);
  }

  return {
    config: merged as Config,
    sources,
  };
}

/**
 * 将 ConfigLevel 枚举转换为 ConfigScope 类型
 */
function levelToScope(level: ConfigLevel): ConfigScope {
  switch (level) {
    case ConfigLevel.USER:
      return 'user';
    case ConfigLevel.PROJECT:
      return 'project';
    case ConfigLevel.DIRECTORY:
      return 'directory';
    default:
      return 'user';
  }
}

/**
 * 获取配置差异
 *
 * 比较两个配置，返回差异部分
 */
export function getConfigDiff(
  base: Record<string, unknown>,
  override: Record<string, unknown>
): Record<string, unknown> {
  const diff: Record<string, unknown> = {};

  for (const key of Object.keys(override)) {
    const baseValue = base[key];
    const overrideValue = override[key];

    if (overrideValue === undefined) continue;

    if (JSON.stringify(baseValue) !== JSON.stringify(overrideValue)) {
      diff[key] = overrideValue;
    }
  }

  return diff;
}
