/**
 * Config 模板索引
 *
 * 导出配置模板相关内容
 */

import { readdirSync } from 'fs';
import { join } from 'path';

/**
 * 获取配置模板目录
 */
export function getConfigsDir(): string {
  return import.meta.dir;
}

/**
 * 列出可用配置模板
 */
export function listConfigTemplates(): string[] {
  const dir = getConfigsDir();
  try {
    return readdirSync(dir).filter(f => f.endsWith('.yaml') || f.endsWith('.yml') || f.endsWith('.json'));
  } catch {
    return [];
  }
}

// 空模块导出
export {};
