/**
 * 扩展发现
 *
 * 扫描目录发现扩展
 */

import { join, resolve } from 'path';
import { getLogger } from '@logtape/logtape';
import type { ExtensionDescriptor, ExtensionDiscoveryResult, ExtensionType } from '@micro-agent/types';
import { EXTENSION_TYPES, isValidExtensionType } from '@micro-agent/types';

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
  async discover(): Promise<ExtensionDiscoveryResult> {
    const descriptors: ExtensionDescriptor[] = [];
    const errors: Array<{ path: string; error: Error }> = [];
    let scannedDirs = 0;

    for (const searchPath of this.searchPaths) {
      // 使用 Bun 的 API 检查路径是否存在
      try {
        const stat = Bun.file(searchPath);
        if (!(await stat.exists())) {
          log.debug('搜索路径不存在: {path}', { path: searchPath });
          continue;
        }
      } catch {
        continue;
      }

      const result = await this.scanDirectory(searchPath);
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
  private async scanDirectory(dir: string): Promise<ExtensionDiscoveryResult> {
    const descriptors: ExtensionDescriptor[] = [];
    const errors: Array<{ path: string; error: Error }> = [];
    let scannedDirs = 1;

    try {
      // 使用 Bun 的 glob 来列出目录内容
      const entries = Array.from(new Bun.Glob('*').scanSync(dir));

      for (const entry of entries) {
        const extensionPath = join(dir, entry);
        
        // 检查是否为目录
        try {
          const stat = Bun.file(extensionPath);
          const exists = await stat.exists();
          if (!exists) continue;
          
          // 检查是否为目录（通过尝试读取其内容）
          try {
            const subdirEntries = Array.from(new Bun.Glob('*').scanSync(extensionPath));
            if (subdirEntries.length === 0 && (await Bun.file(extensionPath).exists())) {
              // 可能是文件，跳过
              continue;
            }
          } catch {
            continue;
          }
        } catch {
          continue;
        }

        const result = await this.tryLoadDescriptor(extensionPath);

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
  private async tryLoadDescriptor(extensionPath: string): Promise<{
    descriptor?: ExtensionDescriptor;
    error?: Error;
  }> {
    // 查找清单文件
    let manifestPath: string | null = null;
    for (const name of MANIFEST_FILE_NAMES) {
      const path = join(extensionPath, name);
      try {
        const file = Bun.file(path);
        if (await file.exists()) {
          manifestPath = path;
          break;
        }
      } catch {
        continue;
      }
    }

    if (!manifestPath) {
      return { error: new Error('未找到扩展清单文件') };
    }

    try {
      const descriptor = await this.loadDescriptor(manifestPath, extensionPath);

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
  private async loadDescriptor(manifestPath: string, extensionPath: string): Promise<ExtensionDescriptor> {
    const file = Bun.file(manifestPath);
    const content = await file.text();
    const fileName = manifestPath.split(/[/\\]/).pop()?.toLowerCase() ?? '';

    let raw: Record<string, unknown>;

    if (fileName === 'package.json') {
      const pkg = JSON.parse(content);
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
    } else if (fileName.endsWith('.yaml') || fileName.endsWith('.yml')) {
      // 简单 YAML 解析（避免依赖 js-yaml）
      raw = this.parseSimpleYaml(content);
    } else {
      raw = JSON.parse(content);
    }

    // 验证扩展类型
    const type = raw.type as ExtensionType;
    if (!isValidExtensionType(type)) {
      throw new Error(`无效的扩展类型: ${type}，有效类型: ${EXTENSION_TYPES.join(', ')}`);
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
   * 简单 YAML 解析
   */
  private parseSimpleYaml(content: string): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    const lines = content.split('\n');
    let currentKey = '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const colonIndex = trimmed.indexOf(':');
      if (colonIndex > 0) {
        currentKey = trimmed.slice(0, colonIndex).trim();
        const value = trimmed.slice(colonIndex + 1).trim();
        
        if (value) {
          // 移除引号
          result[currentKey] = value.replace(/^['"]|['"]$/g, '');
        } else {
          result[currentKey] = '';
        }
      } else if (currentKey && trimmed.startsWith('- ')) {
        // 数组项
        const arr = result[currentKey] as string[] | undefined ?? [];
        arr.push(trimmed.slice(2).trim());
        result[currentKey] = arr;
      }
    }

    return result;
  }

  /**
   * 查找入口文件
   */
  private async findEntryFile(extensionPath: string): Promise<string> {
    for (const name of ENTRY_FILES) {
      const path = join(extensionPath, name);
      try {
        const file = Bun.file(path);
        if (await file.exists()) {
          return name;
        }
      } catch {
        continue;
      }
    }
    return 'index.js';
  }
}

/**
 * 创建扩展发现器
 */
export function createExtensionDiscovery(): ExtensionDiscovery {
  return new ExtensionDiscovery();
}
