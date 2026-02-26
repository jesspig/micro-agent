/**
 * 扩展发现
 * 
 * 扫描目录发现扩展
 */

import { readdirSync, statSync, readFileSync, existsSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { load } from 'js-yaml';
import { getLogger } from '@logtape/logtape';
import type { ExtensionDescriptor, ExtensionDiscoveryResult, ExtensionType } from '@micro-agent/types';

const log = getLogger(['extension', 'discovery']);

/** 扩展清单文件名 */
const MANIFEST_FILE_NAMES = ['extension.yaml', 'extension.yml', 'extension.json', 'package.json'];

/** 扩展入口文件 */
const ENTRY_FILES = ['index.ts', 'index.js', 'index.mjs'];

/**
 * 扩展发现器
 */
export class ExtensionDiscovery {
  private searchPaths: string[] = [];

  /**
   * 添加搜索路径
   */
  addSearchPath(path: string): void {
    const absolutePath = resolve(path);
    if (!this.searchPaths.includes(absolutePath)) {
      this.searchPaths.push(absolutePath);
    }
  }

  /**
   * 发现所有扩展
   */
  discover(): ExtensionDiscoveryResult {
    const descriptors: ExtensionDescriptor[] = [];
    const errors: Array<{ path: string; error: Error }> = [];
    let scannedDirs = 0;

    for (const searchPath of this.searchPaths) {
      if (!existsSync(searchPath)) {
        log.debug('搜索路径不存在: {path}', { path: searchPath });
        continue;
      }

      const result = this.scanDirectory(searchPath);
      descriptors.push(...result.descriptors);
      errors.push(...result.errors);
      scannedDirs += result.scannedDirs;
    }

    log.info('发现 {count} 个扩展', { count: descriptors.length });

    return { descriptors, errors, scannedDirs };
  }

  /**
   * 扫描目录
   */
  private scanDirectory(dir: string): ExtensionDiscoveryResult {
    const descriptors: ExtensionDescriptor[] = [];
    const errors: Array<{ path: string; error: Error }> = [];
    let scannedDirs = 1;

    try {
      const entries = readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const extensionPath = join(dir, entry.name);
        const result = this.tryLoadDescriptor(extensionPath);

        if (result.descriptor) {
          descriptors.push(result.descriptor);
        } else if (result.error) {
          errors.push({ path: extensionPath, error: result.error });
        }

        scannedDirs++;
      }
    } catch (e) {
      errors.push({ path: dir, error: e as Error });
    }

    return { descriptors, errors, scannedDirs };
  }

  /**
   * 尝试加载扩展描述符
   */
  private tryLoadDescriptor(extensionPath: string): {
    descriptor?: ExtensionDescriptor;
    error?: Error;
  } {
    // 查找清单文件
    let manifestPath: string | null = null;
    for (const name of MANIFEST_FILE_NAMES) {
      const path = join(extensionPath, name);
      if (existsSync(path)) {
        manifestPath = path;
        break;
      }
    }

    if (!manifestPath) {
      return { error: new Error('未找到扩展清单文件') };
    }

    try {
      const descriptor = this.loadDescriptor(manifestPath, extensionPath);
      
      // 验证必要字段
      if (!descriptor.id || !descriptor.name || !descriptor.version || !descriptor.type) {
        return { error: new Error('清单文件缺少必要字段') };
      }

      return { descriptor };
    } catch (e) {
      return { error: e as Error };
    }
  }

  /**
   * 加载描述符
   */
  private loadDescriptor(manifestPath: string, extensionPath: string): ExtensionDescriptor {
    const content = readFileSync(manifestPath, 'utf-8');
    const fileName = manifestPath.split(/[/\\]/).pop()?.toLowerCase() ?? '';

    let raw: Record<string, unknown>;

    if (fileName === 'package.json') {
      const pkg = JSON.parse(content);
      // 从 package.json 提取扩展信息
      raw = {
        id: pkg.name,
        name: pkg.displayName ?? pkg.name,
        version: pkg.version,
        type: pkg.microAgent?.type ?? 'tool',
        description: pkg.description,
        author: pkg.author,
        main: pkg.main ?? 'index.js',
        dependencies: pkg.dependencies ? Object.keys(pkg.dependencies) : [],
      };
    } else {
      raw = load(content) as Record<string, unknown>;
    }

    // 验证扩展类型
    const type = raw.type as ExtensionType;
    const validTypes: ExtensionType[] = ['tool', 'channel', 'skill', 'agent', 'workflow', 'command', 'mcp-client', 'mcp-server'];
    if (!validTypes.includes(type)) {
      throw new Error(`无效的扩展类型: ${type}`);
    }

    return {
      id: raw.id as string,
      name: raw.name as string,
      version: raw.version as string,
      type,
      description: raw.description as string | undefined,
      author: raw.author as string | undefined,
      main: (raw.main as string) ?? this.findEntryFile(extensionPath),
      dependencies: raw.dependencies as string[] | undefined,
    };
  }

  /**
   * 查找入口文件
   */
  private findEntryFile(extensionPath: string): string {
    for (const name of ENTRY_FILES) {
      const path = join(extensionPath, name);
      if (existsSync(path)) {
        return name;
      }
    }
    return 'index.js';
  }
}
