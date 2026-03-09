/**
 * 日志持久化器
 * 
 * 实现完整的结构化日志持久化，支持日志轮转和压缩归档。
 */

import { 
  mkdirSync, 
  existsSync, 
  statSync, 
  readdirSync, 
  createWriteStream,
  unlinkSync,
  createReadStream,
} from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createGzip, createGunzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';

// ============================================================
// 类型定义
// ============================================================

/** 日志持久化配置 */
export interface LogPersisterConfig {
  /** 日志目录路径 */
  logDir: string;
  /** 日志文件前缀 */
  filePrefix: string;
  /** 单个文件最大大小（字节） */
  maxFileSize: number;
  /** 最大保留文件数 */
  maxFiles: number;
  /** 最大保留天数 */
  maxDays: number;
  /** 是否启用压缩 */
  enableCompression: boolean;
  /** 压缩阈值（文件大小超过此值才压缩） */
  compressionThreshold: number;
  /** 写入缓冲区大小 */
  bufferSize: number;
  /** 刷新间隔（毫秒） */
  flushInterval: number;
}

/** 默认配置 */
const DEFAULT_CONFIG: LogPersisterConfig = {
  logDir: '~/.micro-agent/logs/memory',
  filePrefix: 'memory',
  maxFileSize: 10 * 1024 * 1024, // 10MB
  maxFiles: 30,
  maxDays: 30,
  enableCompression: true,
  compressionThreshold: 1024 * 1024, // 1MB
  bufferSize: 1000,
  flushInterval: 5000,
};

/** 日志文件信息 */
interface LogFileInfo {
  path: string;
  size: number;
  createdAt: Date;
  modifiedAt: Date;
  compressed: boolean;
}

/** 写入状态 */
interface WriterState {
  currentFile: string;
  writer: ReturnType<typeof createWriteStream>;
  size: number;
  createdAt: Date;
}

// ============================================================
// 日志持久化器
// ============================================================

/**
 * 日志持久化器
 * 
 * 提供日志文件的持久化存储，支持：
 * - 日志轮转（按大小和时间）
 * - 压缩归档（gzip）
 * - 自动清理过期文件
 */
export class LogPersister {
  private config: LogPersisterConfig;
  private logDir: string;
  private buffer: string[] = [];
  private writer?: WriterState;
  private flushTimer?: ReturnType<typeof setInterval>;
  private isFlushing = false;

  constructor(config: Partial<LogPersisterConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logDir = this.expandPath(this.config.logDir);
    this.ensureLogDir();
  }

  /**
   * 展开路径
   */
  private expandPath(path: string): string {
    if (path.startsWith('~')) {
      return join(homedir(), path.slice(1));
    }
    return path;
  }

  /**
   * 确保日志目录存在
   */
  private ensureLogDir(): void {
    if (!existsSync(this.logDir)) {
      mkdirSync(this.logDir, { recursive: true });
    }
  }

  /**
   * 生成日志文件名
   */
  private generateFileName(): string {
    const now = new Date();
    const date = now.toISOString().split('T')[0];
    const time = now.toTimeString().split(' ')[0].replace(/:/g, '-');
    return `${this.config.filePrefix}-${date}-${time}.log`;
  }

  /**
   * 获取当前日期字符串
   */
  private getCurrentDate(): string {
    return new Date().toISOString().split('T')[0];
  }

  /**
   * 获取日志文件列表
   */
  private getLogFiles(): LogFileInfo[] {
    const files: LogFileInfo[] = [];
    
    try {
      const entries = readdirSync(this.logDir);
      
      for (const entry of entries) {
        if (!entry.startsWith(this.config.filePrefix)) continue;
        if (!entry.endsWith('.log') && !entry.endsWith('.log.gz')) continue;
        
        const filePath = join(this.logDir, entry);
        try {
          const stats = statSync(filePath);
          files.push({
            path: filePath,
            size: stats.size,
            createdAt: stats.birthtime,
            modifiedAt: stats.mtime,
            compressed: entry.endsWith('.gz'),
          });
        } catch {
          // 忽略无法访问的文件
        }
      }
    } catch {
      // 忽略目录读取错误
    }
    
    // 按修改时间降序排列
    return files.sort((a, b) => b.modifiedAt.getTime() - a.modifiedAt.getTime());
  }

  /**
   * 初始化写入器
   */
  private initWriter(): void {
    if (this.writer) return;
    
    const fileName = this.generateFileName();
    const filePath = join(this.logDir, fileName);
    
    this.writer = {
      currentFile: filePath,
      writer: createWriteStream(filePath, { flags: 'a' }),
      size: 0,
      createdAt: new Date(),
    };
    
    // 检查文件是否存在并获取大小
    if (existsSync(filePath)) {
      try {
        this.writer.size = statSync(filePath).size;
      } catch {
        // 忽略
      }
    }
  }

  /**
   * 检查是否需要轮转
   */
  private shouldRotate(): boolean {
    if (!this.writer) return false;
    
    // 检查文件大小
    if (this.writer.size >= this.config.maxFileSize) {
      return true;
    }
    
    // 检查日期变更
    const currentDate = this.getCurrentDate();
    const fileDate = this.writer.createdAt.toISOString().split('T')[0];
    if (currentDate !== fileDate) {
      return true;
    }
    
    return false;
  }

  /**
   * 执行日志轮转
   */
  private rotate(): void {
    if (!this.writer) return;
    
    // 关闭当前写入器
    this.writer.writer.end();
    
    // 压缩旧文件（如果启用）
    if (this.config.enableCompression && this.writer.size >= this.config.compressionThreshold) {
      this.compressFile(this.writer.currentFile).catch(() => {
        // 忽略压缩错误
      });
    }
    
    // 重置写入器
    this.writer = undefined;
    
    // 清理过期文件
    this.cleanupOldFiles();
  }

  /**
   * 压缩日志文件
   */
  private async compressFile(filePath: string): Promise<void> {
    const gzPath = `${filePath}.gz`;
    
    try {
      const source = createReadStream(filePath);
      const dest = createWriteStream(gzPath);
      const gzip = createGzip();
      
      await pipeline(source, gzip, dest);
      
      // 压缩成功后删除原文件
      unlinkSync(filePath);
    } catch (error) {
      // 压缩失败，删除未完成的压缩文件
      if (existsSync(gzPath)) {
        try {
          unlinkSync(gzPath);
        } catch {
          // 忽略
        }
      }
      throw error;
    }
  }

  /**
   * 解压日志文件
   */
  async decompressFile(gzPath: string): Promise<string> {
    const outputPath = gzPath.replace(/\.gz$/, '');
    
    return new Promise((resolve, reject) => {
      const source = createReadStream(gzPath);
      const dest = createWriteStream(outputPath);
      const gunzipStream = createGunzip();
      
      source.pipe(gunzipStream).pipe(dest);
      
      dest.on('finish', () => resolve(outputPath));
      dest.on('error', reject);
      source.on('error', reject);
      gunzipStream.on('error', reject);
    });
  }

  /**
   * 清理过期文件
   */
  private cleanupOldFiles(): void {
    const files = this.getLogFiles();
    const now = Date.now();
    const maxAgeMs = this.config.maxDays * 24 * 60 * 60 * 1000;
    
    let deleted = 0;
    
    for (const file of files) {
      // 保留最新的 maxFiles 个文件
      if (deleted < files.length - this.config.maxFiles) {
        try {
          unlinkSync(file.path);
          deleted++;
          continue;
        } catch {
          // 忽略删除错误
        }
      }
      
      // 删除过期文件
      const age = now - file.modifiedAt.getTime();
      if (age > maxAgeMs) {
        try {
          unlinkSync(file.path);
          deleted++;
        } catch {
          // 忽略删除错误
        }
      }
    }
  }

  /**
   * 刷新缓冲区到文件
   */
  private async flushBuffer(): Promise<void> {
    if (this.isFlushing || this.buffer.length === 0) return;
    
    this.isFlushing = true;
    
    try {
      // 检查是否需要轮转
      if (this.shouldRotate()) {
        this.rotate();
      }
      
      // 初始化写入器
      this.initWriter();
      
      if (!this.writer) return;
      
      // 写入缓冲区内容
      const content = this.buffer.join('\n') + '\n';
      const written = await new Promise<number>((resolve, reject) => {
        this.writer!.writer.write(content, (error) => {
          if (error) reject(error);
          else resolve(Buffer.byteLength(content, 'utf-8'));
        });
      });
      
      this.writer.size += written;
      this.buffer = [];
    } finally {
      this.isFlushing = false;
    }
  }

  /**
   * 启动定时刷新
   */
  start(): void {
    if (this.flushTimer) return;
    
    this.flushTimer = setInterval(() => {
      this.flushBuffer().catch(() => {
        // 忽略刷新错误
      });
    }, this.config.flushInterval);
  }

  /**
   * 停止持久化器
   */
  async stop(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }
    
    // 最后一次刷新
    await this.flushBuffer();
    
    // 关闭写入器
    if (this.writer) {
      await new Promise<void>((resolve) => {
        this.writer!.writer.end(() => resolve());
      });
      this.writer = undefined;
    }
  }

  /**
   * 写入日志条目
   */
  write(entry: Record<string, unknown>): void {
    const line = JSON.stringify(entry);
    this.buffer.push(line);
    
    // 缓冲区满时立即刷新
    if (this.buffer.length >= this.config.bufferSize) {
      this.flushBuffer().catch(() => {
        // 忽略刷新错误
      });
    }
  }

  /**
   * 写入多行日志
   */
  writeLines(entries: Record<string, unknown>[]): void {
    for (const entry of entries) {
      this.write(entry);
    }
  }

  /**
   * 手动刷新
   */
  async flush(): Promise<void> {
    await this.flushBuffer();
  }

  /**
   * 获取日志文件统计
   */
  getStats(): {
    totalFiles: number;
    totalSize: number;
    oldestFile?: Date;
    newestFile?: Date;
    compressedCount: number;
  } {
    const files = this.getLogFiles();
    
    let totalSize = 0;
    let oldestFile: Date | undefined;
    let newestFile: Date | undefined;
    let compressedCount = 0;
    
    for (const file of files) {
      totalSize += file.size;
      
      if (!oldestFile || file.modifiedAt < oldestFile) {
        oldestFile = file.modifiedAt;
      }
      if (!newestFile || file.modifiedAt > newestFile) {
        newestFile = file.modifiedAt;
      }
      
      if (file.compressed) {
        compressedCount++;
      }
    }
    
    return {
      totalFiles: files.length,
      totalSize,
      oldestFile,
      newestFile,
      compressedCount,
    };
  }

  /**
   * 读取日志文件
   */
  async readLogs(options: {
    limit?: number;
    offset?: number;
    startDate?: Date;
    endDate?: Date;
  } = {}): Promise<string[]> {
    const { limit = 100, offset = 0, startDate, endDate } = options;
    const files = this.getLogFiles();
    const lines: string[] = [];
    let skipped = 0;
    
    for (const file of files) {
      // 检查日期范围
      if (startDate && file.modifiedAt < startDate) continue;
      if (endDate && file.modifiedAt > endDate) continue;
      
      // 读取文件内容
      let filePath = file.path;
      let needsCleanup = false;
      
      // 如果是压缩文件，先解压
      if (file.compressed) {
        try {
          filePath = await this.decompressFile(file.path);
          needsCleanup = true;
        } catch {
          continue;
        }
      }
      
      try {
        const content = await import('node:fs/promises').then(fs => fs.readFile(filePath, 'utf-8'));
        const fileLines = content.split('\n').filter(l => l.trim());
        
        for (const line of fileLines) {
          if (skipped < offset) {
            skipped++;
            continue;
          }
          
          lines.push(line);
          
          if (lines.length >= limit) {
            break;
          }
        }
      } catch {
        // 忽略读取错误
      } finally {
        // 清理解压的临时文件
        if (needsCleanup) {
          try {
            unlinkSync(filePath);
          } catch {
            // 忽略
          }
        }
      }
      
      if (lines.length >= limit) {
        break;
      }
    }
    
    return lines;
  }

  /**
   * 强制压缩所有未压缩的日志文件
   */
  async compressAll(): Promise<number> {
    const files = this.getLogFiles().filter(f => !f.compressed);
    let compressed = 0;
    
    for (const file of files) {
      try {
        await this.compressFile(file.path);
        compressed++;
      } catch {
        // 忽略压缩错误
      }
    }
    
    return compressed;
  }
}

// ============================================================
// 全局实例
// ============================================================

/** 全局日志持久化器实例 */
let globalPersister: LogPersister | null = null;

/**
 * 获取全局日志持久化器
 */
export function getLogPersister(config?: Partial<LogPersisterConfig>): LogPersister {
  if (!globalPersister) {
    globalPersister = new LogPersister(config);
  }
  return globalPersister;
}

/**
 * 重置全局日志持久化器
 */
export async function resetLogPersister(): Promise<void> {
  if (globalPersister) {
    await globalPersister.stop();
    globalPersister = null;
  }
}
