/**
 * 知识库文件监控器
 * 
 * 负责监控知识库目录的文件变更
 */

import { mkdir, stat, watch } from 'fs/promises';
import { join } from 'path';
import type { WatchEventType } from 'fs';
import type { KnowledgeDocument } from './types';
import { isKnowledgeFileSupported } from './types';
import { getLogger } from '@logtape/logtape';

const log = getLogger(['knowledge', 'watcher']);

export type FileChangeType = 'add' | 'change' | 'unlink';

/**
 * 文件变更事件
 */
export interface FileChangeEvent {
  filename: string;
  changeType: FileChangeType;
}

/**
 * 文件监控器接口
 */
export interface FileWatcher {
  /** 启动监控 */
  startWatching(): Promise<void>;
  
  /** 停止监控 */
  stopWatching(): void;
  
  /** 获取待处理的变更 */
  getPendingChanges(): Map<string, FileChangeType>;
  
  /** 调度处理 */
  scheduleDebounceProcess(callback: () => void): void;
  
  /** 是否正在监控 */
  isWatching(): boolean;
}

/**
 * 文件监控器配置
 */
export interface WatcherConfig {
  /** 知识库根目录 */
  basePath: string;
  /** 防抖延迟（毫秒） */
  debounceDelay: number;
}

/**
 * 创建文件监控器
 */
export function createFileWatcher(
  config: WatcherConfig,
  getDocuments: () => Map<string, KnowledgeDocument>,
  onFileChange?: (event: FileChangeEvent) => void
): FileWatcher {
  let watcher: AsyncIterable<{ eventType: WatchEventType; filename: string | null }> | undefined;
  let watcherAbortController: AbortController | undefined;
  let debounceTimer: Timer | undefined;
  const pendingChanges = new Map<string, FileChangeType>();

  // 内部方法：监测循环
  const runWatchLoop = (): void => {
    if (!watcher) return;

    (async () => {
      try {
        for await (const event of watcher!) {
          if (watcherAbortController?.signal.aborted) break;

          const { eventType, filename } = event;
          if (!filename) continue;

          if (!isKnowledgeFileSupported(filename)) continue;

          handleFileEvent(eventType, filename);
        }
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          log.error('文件监测错误', { error: String(error) });
        }
      }
    })();
  };

  // 内部方法：处理文件事件
  const handleFileEvent = (eventType: WatchEventType, filename: string): void => {
    const changeType = eventType === 'rename' ? 'add' : 'change';
    const fullPath = join(config.basePath, filename);

    stat(fullPath)
      .then(() => {
        pendingChanges.set(filename, changeType);
        runScheduleDebounceProcess(() => {
          onFileChange?.({ filename, changeType });
        });
      })
      .catch((error) => {
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage.includes('ENOENT') || errorMessage.includes('file not found')) {
          if (getDocuments().has(filename)) {
            pendingChanges.set(filename, 'unlink');
            runScheduleDebounceProcess(() => {
              onFileChange?.({ filename, changeType: 'unlink' });
            });
          }
        } else {
          log.warn('检查文件状态失败', { filename, error: errorMessage });
        }
      });
  };

  // 内部方法：调度防抖处理
  const runScheduleDebounceProcess = (callback: () => void): void => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(() => {
      callback();
    }, config.debounceDelay);
  };

  return {
    /**
     * 启动文件监测
     */
    async startWatching(): Promise<void> {
      const docsDir = config.basePath;

      try {
        // 确保目录存在
        await mkdir(docsDir, { recursive: true });

        watcherAbortController = new AbortController();

        // 使用 fs/promises 的 watch API
        watcher = watch(docsDir, {
          recursive: true,
          signal: watcherAbortController.signal,
        });

        // 启动监测循环
        runWatchLoop();

        log.info('文件监测已启动');
      } catch (error) {
        log.error('启动文件监测失败', { error: String(error) });
      }
    },

    /**
     * 停止文件监测
     */
    stopWatching(): void {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = undefined;
      }

      watcherAbortController?.abort();
      watcherAbortController = undefined;
      watcher = undefined;
      pendingChanges.clear();

      log.info('文件监测已停止');
    },

    /**
     * 获取待处理的变更
     */
    getPendingChanges(): Map<string, FileChangeType> {
      return pendingChanges;
    },

    /**
     * 调度防抖处理
     */
    scheduleDebounceProcess(callback: () => void): void {
      runScheduleDebounceProcess(callback);
    },

    /**
     * 是否正在监控
     */
    isWatching(): boolean {
      return watcher !== undefined;
    },
  };
}
