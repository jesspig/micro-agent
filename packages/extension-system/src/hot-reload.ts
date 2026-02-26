/**
 * 热重载支持
 * 
 * 监听扩展目录变化，实现优雅重载
 */

import { watch, FSWatcher } from 'fs';
import { resolve, dirname } from 'path';
import { getLogger } from '@logtape/logtape';
import type { ExtensionChangeEvent, ExtensionType } from '@micro-agent/types';
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

/**
 * 热重载管理器
 * 
 * 实现扩展的热重载，支持：
 * - 监听文件变更
 * - 防抖处理
 * - 优雅等待当前调用完成
 */
export class HotReloadManager {
  private config: HotReloadConfig;
  private loader: ExtensionLoader;
  private watchers: FSWatcher[] = [];
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
   * @param paths - 监听路径列表
   */
  start(paths: string[]): void {
    if (!this.config.enabled) {
      log.debug('热重载未启用');
      return;
    }

    for (const path of paths) {
      this.watchPath(path);
    }

    log.info('热重载已启动，监听 {count} 个路径', { count: paths.length });
  }

  /**
   * 停止监听
   */
  stop(): void {
    for (const watcher of this.watchers) {
      watcher.close();
    }
    this.watchers = [];

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    log.info('热重载已停止');
  }

  /**
   * 标记调用开始
   * 用于追踪正在进行的扩展调用
   */
  beginCall(): void {
    this.activeCalls++;
  }

  /**
   * 标记调用结束
   */
  endCall(): void {
    this.activeCalls--;
    
    // 如果有待处理的变更且没有活动调用，触发重载
    if (this.pendingChanges.size > 0 && this.activeCalls === 0 && !this.isReloading) {
      this.processPendingChanges();
    }
  }

  /**
   * 监听路径
   */
  private watchPath(path: string): void {
    const absolutePath = resolve(path);
    
    const watcher = watch(
      absolutePath,
      { recursive: true },
      (event, filename) => {
        if (!filename) return;
        
        // 过滤非扩展文件
        if (!this.isExtensionFile(filename)) return;

        const changePath = resolve(absolutePath, filename);
        this.handleChange(event, changePath);
      }
    );

    this.watchers.push(watcher);
  }

  /**
   * 处理文件变更
   */
  private handleChange(event: string, path: string): void {
    const changeType = event === 'rename' ? 'add' : 'change';
    
    // 简单检查文件是否被删除
    try {
      require.resolve(path);
    } catch {
      // 文件不存在，可能是删除
      this.pendingChanges.set(path, {
        type: 'delete',
        path,
        timestamp: Date.now(),
      });
      this.scheduleProcess();
      return;
    }

    this.pendingChanges.set(path, {
      type: changeType as 'add' | 'change',
      path,
      timestamp: Date.now(),
    });

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

    // 等待活动调用完成
    if (this.activeCalls > 0) {
      log.debug('等待 {count} 个活动调用完成', { count: this.activeCalls });
      await this.waitForGracefulShutdown();
    }

    this.isReloading = true;

    try {
      // 按扩展分组变更
      const changesByExtension = this.groupChangesByExtension();

      for (const [extensionId, changes] of changesByExtension) {
        const latestChange = changes.sort((a, b) => b.timestamp - a.timestamp)[0];
        
        log.info('热重载扩展: {id} ({type})', { 
          id: extensionId, 
          type: latestChange.type 
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
      // 从路径提取扩展 ID
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
    // 简单实现：取倒数第二级目录名
    const parts = path.split(/[/\\]/);
    return parts[parts.length - 2] ?? parts[parts.length - 1];
  }

  /**
   * 检查是否为扩展文件
   */
  private isExtensionFile(filename: string): boolean {
    const ext = filename.split('.').pop()?.toLowerCase();
    return ['ts', 'js', 'mjs', 'json', 'yaml', 'yml'].includes(ext ?? '');
  }
}
