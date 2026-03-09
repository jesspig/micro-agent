/**
 * 热重载支持
 *
 * 监听扩展目录变化，实现优雅重载
 */

import { resolve, join } from 'path';
import { existsSync, statSync, readdirSync } from 'fs';
import { getLogger } from '@logtape/logtape';
import { ExtensionLoader } from './loader';

const log = getLogger(['extension', 'hot-reload']);

/** 热重载配置 */
export interface HotReloadConfig {
  /** 是否启用热重载 */
  enabled: boolean;
  /** 防抖延迟（毫秒） */
  debounceMs: number;
  /** 等待当前调用完成的超时时间（毫秒） */
  gracefulTimeout: number;
}

/** 默认配置 */
const DEFAULT_CONFIG: HotReloadConfig = {
  enabled: true,
  debounceMs: 1000,
  gracefulTimeout: 30000,
};

/** 变更队列项 */
interface PendingChange {
  type: 'add' | 'change' | 'delete';
  path: string;
  timestamp: number;
}

/** 文件状态记录 */
interface FileState {
  mtime: number;
  size: number;
}

/**
 * 热重载管理器
 */
export class HotReloadManager {
  private config: HotReloadConfig;
  private loader: ExtensionLoader;
  private fileStates = new Map<string, FileState>();
  private watchedPaths = new Set<string>();
  private checkInterval?: ReturnType<typeof setInterval>;
  private pendingChanges = new Map<string, PendingChange>();
  private debounceTimer?: ReturnType<typeof setTimeout>;
  private activeCalls = 0;
  private isReloading = false;

  constructor(loader: ExtensionLoader, config?: Partial<HotReloadConfig>) {
    this.loader = loader;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 启动监听
   */
  start(paths: string[]): void {
    if (!this.config.enabled) {
      log.debug('热重载未启用');
      return;
    }

    for (const path of paths) {
      this.watchPath(path);
    }

    // 启动定期检查
    this.checkInterval = setInterval(() => {
      this.checkAllPaths();
    }, this.config.debounceMs);

    log.info('热重载已启动，监听 {count} 个路径', { count: paths.length });
  }

  /**
   * 停止监听
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = undefined;
    }

    this.fileStates.clear();
    this.watchedPaths.clear();

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    log.info('热重载已停止');
  }

  /**
   * 标记调用开始
   */
  beginCall(): void {
    this.activeCalls++;
  }

  /**
   * 标记调用结束
   */
  endCall(): void {
    this.activeCalls--;

    if (this.pendingChanges.size > 0 && this.activeCalls === 0 && !this.isReloading) {
      this.processPendingChanges();
    }
  }

  /**
   * 监听路径
   */
  private watchPath(path: string): void {
    const absolutePath = resolve(path);
    this.watchedPaths.add(absolutePath);

    // 初始化文件状态
    this.initializeFileStates(absolutePath);
  }

  /**
   * 初始化路径下所有文件的状态
   */
  private initializeFileStates(rootPath: string): void {
    if (!existsSync(rootPath)) {
      return;
    }

    const stats = statSync(rootPath);

    if (stats.isFile()) {
      this.fileStates.set(rootPath, {
        mtime: stats.mtimeMs,
        size: stats.size,
      });
      return;
    }

    if (stats.isDirectory()) {
      try {
        const entries = readdirSync(rootPath, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = join(rootPath, entry.name);
          if (entry.isDirectory()) {
            // 递归处理子目录（排除 node_modules）
            if (entry.name !== 'node_modules' && !entry.name.startsWith('.')) {
              this.initializeFileStates(fullPath);
            }
          } else if (entry.isFile() && this.isWatchableFile(entry.name)) {
            const fileStats = statSync(fullPath);
            this.fileStates.set(fullPath, {
              mtime: fileStats.mtimeMs,
              size: fileStats.size,
            });
          }
        }
      } catch (error) {
        log.debug('无法读取目录', { path: rootPath, error: String(error) });
      }
    }
  }

  /**
   * 判断是否是可监听的文件
   */
  private isWatchableFile(filename: string): boolean {
    const watchableExtensions = ['.ts', '.js', '.json', '.yaml', '.yml'];
    return watchableExtensions.some(ext => filename.endsWith(ext));
  }

  /**
   * 检查所有监听路径的变更
   */
  private checkAllPaths(): void {
    for (const rootPath of this.watchedPaths) {
      this.checkForChanges(rootPath);
    }
  }

  /**
   * 检查文件变更
   */
  private checkForChanges(rootPath: string): void {
    if (!existsSync(rootPath)) {
      // 路径被删除
      for (const [filePath] of this.fileStates) {
        if (filePath.startsWith(rootPath)) {
          this.handleChange('delete', filePath);
          this.fileStates.delete(filePath);
        }
      }
      return;
    }

    const stats = statSync(rootPath);

    if (stats.isFile()) {
      this.checkFileChange(rootPath, stats);
      return;
    }

    if (stats.isDirectory()) {
      // 检查目录下的文件
      this.checkDirectoryChanges(rootPath);
    }
  }

  /**
   * 检查目录变更
   */
  private checkDirectoryChanges(dirPath: string): void {
    try {
      const entries = readdirSync(dirPath, { withFileTypes: true });
      const currentFiles = new Set<string>();

      for (const entry of entries) {
        const fullPath = join(dirPath, entry.name);

        if (entry.isDirectory()) {
          // 递归处理子目录（排除 node_modules）
          if (entry.name !== 'node_modules' && !entry.name.startsWith('.')) {
            this.checkDirectoryChanges(fullPath);
          }
        } else if (entry.isFile() && this.isWatchableFile(entry.name)) {
          currentFiles.add(fullPath);

          try {
            const fileStats = statSync(fullPath);
            this.checkFileChange(fullPath, fileStats);
          } catch (error) {
            log.debug('无法检查文件状态', { path: fullPath, error: String(error) });
          }
        }
      }

      // 检查是否有文件被删除
      for (const [filePath] of this.fileStates) {
        if (filePath.startsWith(dirPath) && !currentFiles.has(filePath) && !existsSync(filePath)) {
          this.handleChange('delete', filePath);
          this.fileStates.delete(filePath);
        }
      }
    } catch (error) {
      log.debug('无法检查目录变更', { path: dirPath, error: String(error) });
    }
  }

  /**
   * 检查单个文件变更
   */
  private checkFileChange(filePath: string, stats: { mtimeMs: number; size: number }): void {
    const previousState = this.fileStates.get(filePath);

    if (!previousState) {
      // 新文件
      this.fileStates.set(filePath, {
        mtime: stats.mtimeMs,
        size: stats.size,
      });
      this.handleChange('add', filePath);
      return;
    }

    // 检查 mtime 或 size 变化
    if (previousState.mtime !== stats.mtimeMs || previousState.size !== stats.size) {
      this.fileStates.set(filePath, {
        mtime: stats.mtimeMs,
        size: stats.size,
      });
      this.handleChange('change', filePath);
    }
  }

  /**
   * 处理文件变更
   */
  private handleChange(event: 'add' | 'change' | 'delete', path: string): void {
    // 忽略临时文件和备份文件
    if (path.includes('.tmp') || path.includes('.bak') || path.includes('~')) {
      return;
    }

    this.pendingChanges.set(path, {
      type: event,
      path,
      timestamp: Date.now(),
    });

    log.debug('检测到文件变更', { event, path });

    this.scheduleProcess();
  }

  /**
   * 调度变更处理
   */
  private scheduleProcess(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.processPendingChanges();
    }, this.config.debounceMs);
  }

  /**
   * 处理待处理的变更
   */
  private async processPendingChanges(): Promise<void> {
    if (this.pendingChanges.size === 0 || this.isReloading) return;

    if (this.activeCalls > 0) {
      log.debug('等待 {count} 个活动调用完成', { count: this.activeCalls });
      await this.waitForGracefulShutdown();
    }

    this.isReloading = true;

    try {
      const changesByExtension = this.groupChangesByExtension();

      for (const [extensionId, changes] of changesByExtension) {
        const latestChange = changes.sort((a, b) => b.timestamp - a.timestamp)[0];

        log.info('热重载扩展: {id} ({type})', {
          id: extensionId,
          type: latestChange.type,
        });

        if (latestChange.type === 'delete') {
          await this.loader.unloadExtension(extensionId);
        } else {
          await this.loader.reloadExtension(extensionId);
        }
      }

      this.pendingChanges.clear();
    } finally {
      this.isReloading = false;
    }
  }

  /**
   * 等待优雅关闭
   */
  private async waitForGracefulShutdown(): Promise<void> {
    const startTime = Date.now();

    while (this.activeCalls > 0) {
      if (Date.now() - startTime > this.config.gracefulTimeout) {
        log.warn('等待超时，强制重载');
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  /**
   * 按扩展分组变更
   */
  private groupChangesByExtension(): Map<string, PendingChange[]> {
    const groups = new Map<string, PendingChange[]>();

    for (const change of this.pendingChanges.values()) {
      const extensionId = this.extractExtensionId(change.path);

      if (!groups.has(extensionId)) {
        groups.set(extensionId, []);
      }
      groups.get(extensionId)!.push(change);
    }

    return groups;
  }

  /**
   * 提取扩展 ID
   */
  private extractExtensionId(path: string): string {
    const parts = path.split(/[/\\]/);
    return parts[parts.length - 2] ?? parts[parts.length - 1];
  }
}

/**
 * 创建热重载管理器
 */
export function createHotReloadManager(loader: ExtensionLoader, config?: Partial<HotReloadConfig>): HotReloadManager {
  return new HotReloadManager(loader, config);
}

