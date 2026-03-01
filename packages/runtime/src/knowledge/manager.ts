/**
 * 知识库管理器
 * 
 * 管理用户上传到 ~/.micro-agent/knowledge/ 目录的文档，提供：
 * 1. 文档扫描和索引
 * 2. 后台闲时构建向量索引（存入 MemoryStore）
 * 3. 文件变更监控
 * 
 * 注意：向量检索已迁移到 MemoryStore，使用 dualLayerSearch() 方法
 * 索引存储使用 SQLite（Bun 内置），位于 ~/.micro-agent/data/knowledge.db
 */

import { mkdir, readdir, readFile, stat, watch } from 'fs/promises';
import { join, basename, extname, relative } from 'path';
import { createHash } from 'crypto';
import { homedir } from 'os';
import { Database } from 'bun:sqlite';
import type { WatchEventType } from 'fs';
import type {
  KnowledgeBaseConfig,
  KnowledgeDocument,
  KnowledgeDocMetadata,
  KnowledgeDocStatus,
  KnowledgeChunk,
  KnowledgeBaseStats,
  BackgroundBuildStatus,
  KnowledgeDocType,
} from './types';
import {
  getKnowledgeDocType,
  isKnowledgeFileSupported,
  KNOWLEDGE_FILE_EXTENSIONS,
} from './types';
import { getLogger } from '@logtape/logtape';
import type { MemoryStore } from '../memory/store';

const log = getLogger(['knowledge']);

// 可选依赖的类型定义
interface MammothModule {
  extractRawText(input: { path: string }): Promise<{ value: string; messages: string[] }>;
}

interface XLSXModule {
  readFile(path: string): {
    SheetNames: string[];
    Sheets: Record<string, unknown>;
  };
  utils: {
    sheet_to_json<T>(worksheet: unknown, opts?: { header?: number }): T[];
  };
}

/**
 * 提取文档内容
 * 根据文件类型使用不同的提取策略
 * 支持懒加载可选依赖
 */
async function extractDocumentContent(filePath: string, fileType: KnowledgeDocType): Promise<string> {
  const ext = extname(filePath).toLowerCase();

  // CSV/TSV 文件 - 解析为表格文本
  if (fileType === 'csv' || ext === '.csv' || ext === '.tsv') {
    const rawContent = await readFile(filePath, 'utf-8');
    return parseCSVContent(rawContent, ext === '.tsv' ? '\t' : ',');
  }

  // Word 文档 (.docx)
  if (fileType === 'word' && ext === '.docx') {
    try {
      // @ts-ignore - 可选依赖，运行时动态加载
      const mammoth = (await import('mammoth')) as MammothModule;
      const result = await mammoth.extractRawText({ path: filePath });
      return `[Word 文档: ${basename(filePath)}]\n\n${result.value}`;
    } catch (error) {
      return `[Word 文档: ${basename(filePath)}]\n\n注意: 解析失败。请安装解析库: bun add mammoth\n错误: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  // Excel 表格 (.xlsx, .xls)
  if (fileType === 'excel' && (ext === '.xlsx' || ext === '.xls')) {
    try {
      // @ts-ignore - 可选依赖，运行时动态加载
      const xlsx = (await import('xlsx')) as XLSXModule;
      const workbook = xlsx.readFile(filePath);

      const result: string[] = [];
      result.push(`[Excel 表格: ${basename(filePath)}]`);
      result.push(`工作表数量: ${workbook.SheetNames.length}`);
      result.push('');

      // 解析每个工作表
      for (const sheetName of workbook.SheetNames.slice(0, 3)) { // 最多3个工作表
        const worksheet = workbook.Sheets[sheetName];
        const data = xlsx.utils.sheet_to_json(worksheet, { header: 1 }) as unknown[][];

        result.push(`--- 工作表: ${sheetName} ---`);
        result.push(`行数: ${data.length}`);

        // 前10行数据预览
        const previewRows = Math.min(data.length, 10);
        for (let i = 0; i < previewRows; i++) {
          const row = data[i];
          if (Array.isArray(row) && row.length > 0) {
            result.push(`行 ${i + 1}: ${row.join(' | ')}`);
          }
        }

        if (data.length > 10) {
          result.push(`... (还有 ${data.length - 10} 行)`);
        }
        result.push('');
      }

      if (workbook.SheetNames.length > 3) {
        result.push(`... (还有 ${workbook.SheetNames.length - 3} 个工作表)`);
      }

      return result.join('\n');
    } catch (error) {
      return `[Excel 表格: ${basename(filePath)}]\n\n注意: 解析失败。请安装解析库: bun add xlsx\n错误: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  // 旧版 Word (.doc) 不支持，提示转换
  if (fileType === 'word' && ext === '.doc') {
    return `[Word 文档: ${basename(filePath)}]\n\n注意: .doc 格式需要额外工具。建议转换为 .docx 或 .txt 格式后重新上传。`;
  }

  // PowerPoint 演示文稿 - 暂不支持，提示转换
  if (fileType === 'powerpoint' || ext === '.pptx' || ext === '.ppt') {
    return `[PowerPoint 演示文稿: ${basename(filePath)}]\n\n注意: PowerPoint 解析暂不支持。建议:\n1. 转换为 PDF 后上传\n2. 或使用 "另存为图片" 导出后通过图片方式查看`;
  }

  // PDF 文档
  if (fileType === 'pdf' || ext === '.pdf') {
    try {
      // @ts-ignore - 可选依赖，运行时动态加载
      const pdfParse = await import('pdf-parse');
      const dataBuffer = await readFile(filePath);
      const data = await pdfParse.default(dataBuffer);
      return `[PDF 文档: ${basename(filePath)}]\n\n${data.text}`;
    } catch (error) {
      return `[PDF 文档: ${basename(filePath)}]\n\n注意: PDF 解析失败。\n错误: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  // 其他类型 - 直接读取为文本
  return await readFile(filePath, 'utf-8');
}

/**
 * 解析 CSV/TSV 内容为可读文本
 */
function parseCSVContent(content: string, delimiter: string = ','): string {
  const lines = content.split(/\r?\n/).filter(line => line.trim());
  if (lines.length === 0) return '';

  // 解析表头
  const headers = lines[0].split(delimiter).map(h => h.trim().replace(/^["']|["']$/g, ''));

  // 构建表格文本表示
  const result: string[] = [];
  result.push('表格数据:');
  result.push('');
  result.push(`列数: ${headers.length}, 行数: ${lines.length - 1}`);
  result.push(`列名: ${headers.join(', ')}`);
  result.push('');

  // 前10行数据预览
  const previewRows = Math.min(lines.length - 1, 10);
  for (let i = 1; i <= previewRows; i++) {
    const values = lines[i].split(delimiter).map(v => v.trim().replace(/^["']|["']$/g, ''));
    result.push(`行 ${i}: ${values.join(' | ')}`);
  }

  if (lines.length > 11) {
    result.push(`... (还有 ${lines.length - 11} 行)`);
  }

  return result.join('\n');
}

/** 默认配置 */
const DEFAULT_CONFIG: KnowledgeBaseConfig = {
  basePath: join(homedir(), '.micro-agent', 'knowledge'),
  chunkSize: 1000,
  chunkOverlap: 200,
  maxSearchResults: 5,
  minSimilarityScore: 0.6,
  backgroundBuild: {
    enabled: true,
    interval: 60000, // 1分钟检查一次
    batchSize: 3,
    idleDelay: 5000, // 空闲5秒后开始处理
  },
};

/** 数据目录路径 */
const DATA_DIR = () => join(homedir(), '.micro-agent', 'data');
/** SQLite 数据库文件名 */
const DB_FILE = 'knowledge.db';

/**
 * 知识库管理器
 */
export class KnowledgeBaseManager {
  private config: KnowledgeBaseConfig;
  private memoryStore?: MemoryStore;
  private documents: Map<string, KnowledgeDocument> = new Map();
  private isInitialized = false;
  private db?: Database;
  
  // 后台构建相关
  private buildStatus: BackgroundBuildStatus = {
    isRunning: false,
    processedCount: 0,
    queueLength: 0,
    lastActivityTime: Date.now(),
  };
  private buildTimer?: Timer;
  private buildAbortController?: AbortController;

  // 文件监测相关
  private watcher?: AsyncIterable<{ eventType: WatchEventType; filename: string | null }>;
  private watcherAbortController?: AbortController;
  private pendingChanges: Map<string, 'add' | 'change' | 'unlink'> = new Map();
  private debounceTimer?: Timer;

  constructor(
    config?: Partial<KnowledgeBaseConfig>,
    memoryStore?: MemoryStore
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.memoryStore = memoryStore;
  }

  /**
   * 初始化知识库
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    // 创建知识库目录
    await mkdir(this.config.basePath, { recursive: true });

    // 创建数据目录并初始化 SQLite 数据库
    await this.initDatabase();

    // 加载已有索引
    await this.loadIndex();

    // 扫描文件变更
    await this.scanDocuments();

    // 启动文件监测
    await this.startWatching();

    // 立即处理待索引文档（不等待后台构建）
    await this.processPendingDocuments();

    // 启动后台构建（用于后续新增文档）
    if (this.config.backgroundBuild.enabled) {
      this.startBackgroundBuild();
    }

    this.isInitialized = true;
    
    // 统计索引状态
    const indexedCount = Array.from(this.documents.values()).filter(d => d.status === 'indexed').length;
    const pendingCount = Array.from(this.documents.values()).filter(d => d.status === 'pending').length;
    
    log.info('📚 [KnowledgeBase] 知识库已初始化', { 
      docCount: this.documents.size,
      indexedCount,
      pendingCount,
      memoryStore: !!this.memoryStore,
    });
  }

  /**
   * 关闭知识库
   */
  async shutdown(): Promise<void> {
    this.stopWatching();
    this.stopBackgroundBuild();
    this.closeDatabase();
    this.isInitialized = false;
    console.log('[KnowledgeBase] 知识库已关闭');
  }

  // ============================================================================
  // 文档管理
  // ============================================================================

  /**
   * 扫描文档目录，检测新增、修改和删除的文件
   */
  async scanDocuments(): Promise<void> {
    const docsDir = this.config.basePath;
    
    try {
      // 获取当前所有文件
      const files = await this.listAllFiles(docsDir);
      const currentPaths = new Set<string>();

      for (const filePath of files) {
        if (!isKnowledgeFileSupported(filePath)) continue;

        const relativePath = relative(docsDir, filePath);
        currentPaths.add(relativePath);

        // 检查文件是否需要更新
        const fileStat = await stat(filePath);
        const existingDoc = this.documents.get(relativePath);

        if (!existingDoc) {
          // 新增文件
          await this.addDocument(filePath, relativePath);
        } else if (fileStat.mtimeMs > existingDoc.metadata.modifiedAt) {
          // 文件已修改，重新索引
          await this.updateDocument(filePath, relativePath);
        }
      }

      // 检查被删除的文件
      for (const [path, doc] of this.documents) {
        if (!currentPaths.has(path)) {
          await this.removeDocument(path);
        }
      }

      console.log(`[KnowledgeBase] 文档扫描完成，共 ${this.documents.size} 个文档`);
    } catch (error) {
      console.error('[KnowledgeBase] 文档扫描失败:', error);
    }
  }

  /**
   * 添加新文档
   */
  private async addDocument(
    filePath: string,
    relativePath: string
  ): Promise<KnowledgeDocument> {
    const fileType = getKnowledgeDocType(filePath);
    const content = await extractDocumentContent(filePath, fileType);
    const fileStat = await stat(filePath);
    const fileHash = this.computeHash(content);

    const doc: KnowledgeDocument = {
      id: this.generateDocId(),
      path: relativePath,
      content,
      metadata: {
        originalName: basename(filePath),
        fileType: fileType,
        fileSize: fileStat.size,
        fileHash,
        modifiedAt: fileStat.mtimeMs,
        title: this.extractTitle(content, basename(filePath)),
      },
      status: 'pending',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.documents.set(relativePath, doc);
    this.buildStatus.queueLength++;
    
    // 保存到 SQLite
    this.saveDocumentIndex(doc);
    
    console.log(`[KnowledgeBase] 新增文档: ${relativePath}`);
    return doc;
  }

  /**
   * 更新已有文档
   */
  private async updateDocument(
    filePath: string,
    relativePath: string
  ): Promise<void> {
    const fileType = getKnowledgeDocType(filePath);
    const content = await extractDocumentContent(filePath, fileType);
    const fileStat = await stat(filePath);
    const fileHash = this.computeHash(content);

    const existingDoc = this.documents.get(relativePath);
    if (!existingDoc) return;

    // 检查内容是否真的变化
    if (existingDoc.metadata.fileHash === fileHash) {
      // 仅更新时间戳
      existingDoc.metadata.modifiedAt = fileStat.mtimeMs;
      existingDoc.updatedAt = Date.now();
      this.saveDocumentIndex(existingDoc);
      return;
    }

    // 内容变化，重新索引
    existingDoc.content = content;
    existingDoc.metadata.fileHash = fileHash;
    existingDoc.metadata.fileSize = fileStat.size;
    existingDoc.metadata.modifiedAt = fileStat.mtimeMs;
    existingDoc.metadata.title = this.extractTitle(content, basename(filePath));
    existingDoc.status = 'pending';
    existingDoc.chunks = undefined;
    existingDoc.updatedAt = Date.now();
    existingDoc.indexedAt = undefined;

    this.buildStatus.queueLength++;
    
    // 更新 SQLite
    this.saveDocumentIndex(existingDoc);
    
    console.log(`[KnowledgeBase] 更新文档: ${relativePath}`);
  }

  /**
   * 移除文档
   */
  private async removeDocument(relativePath: string): Promise<void> {
    const doc = this.documents.get(relativePath);
    if (!doc) return;

    this.documents.delete(relativePath);
    
    // 从 SQLite 删除
    this.deleteDocumentIndex(relativePath);
    
    // 从 MemoryStore 删除文档块
    if (this.memoryStore) {
      try {
        await this.memoryStore.deleteDocumentChunks(doc.id);
      } catch (error) {
        log.warn('📄 [KnowledgeBase] 删除文档块失败', { 
          docId: doc.id, 
          error: String(error),
        });
      }
    }

    log.info('📄 [KnowledgeBase] 删除文档', { path: relativePath });
  }

  // ============================================================================
  // 文档分块
  // ============================================================================

  /**
   * 将文档分块
   */
  private chunkDocument(doc: KnowledgeDocument): KnowledgeChunk[] {
    const chunks: KnowledgeChunk[] = [];
    const { chunkSize, chunkOverlap } = this.config;
    const content = doc.content;

    // 按段落分割
    const paragraphs = content.split(/\n\s*\n/);
    let currentChunk = '';
    let currentPos = 0;
    let chunkStartPos = 0;

    for (const paragraph of paragraphs) {
      const trimmedParagraph = paragraph.trim();
      if (!trimmedParagraph) continue;

      // 如果当前块加上新段落超过限制，先保存当前块
      if (currentChunk.length + trimmedParagraph.length > chunkSize && currentChunk.length > 0) {
        chunks.push(this.createChunk(doc.id, currentChunk, chunkStartPos, currentPos));
        
        // 保留重叠部分
        const overlapText = currentChunk.slice(-chunkOverlap);
        currentChunk = overlapText + '\n\n' + trimmedParagraph;
        chunkStartPos = currentPos - overlapText.length;
      } else {
        if (currentChunk.length > 0) {
          currentChunk += '\n\n';
          currentPos += 2;
        }
        currentChunk += trimmedParagraph;
      }
      
      currentPos += trimmedParagraph.length;
    }

    // 保存最后一个块
    if (currentChunk.length > 0) {
      chunks.push(this.createChunk(doc.id, currentChunk, chunkStartPos, content.length));
    }

    return chunks;
  }

  /**
   * 创建块
   */
  private createChunk(
    docId: string,
    content: string,
    startPos: number,
    endPos: number
  ): KnowledgeChunk {
    return {
      id: `${docId}_chunk_${startPos}`,
      docId,
      content,
      startPos,
      endPos,
    };
  }

  // ============================================================================
  // 向量索引（存入 MemoryStore）
  // ============================================================================

  /**
   * 构建文档向量索引
   * 
   * 将文档分块存入 MemoryStore，向量检索通过 MemoryStore.dualLayerSearch() 实现
   */
  private async buildDocumentIndex(doc: KnowledgeDocument): Promise<void> {
    if (!this.memoryStore) {
      doc.status = 'error';
      doc.error = 'MemoryStore 未注入';
      this.saveDocumentIndex(doc);
      log.error('📄 [KnowledgeBase] MemoryStore 未注入，无法构建索引');
      return;
    }

    doc.status = 'processing';
    this.saveDocumentIndex(doc);

    try {
      // 分块
      const chunks = this.chunkDocument(doc);
      
      // 存储到 MemoryStore（向量由 MemoryStore 内部生成）
      await this.memoryStore.storeDocumentChunks(
        doc.id,
        chunks,
        doc.metadata
      );

      doc.chunks = chunks;
      doc.status = 'indexed';
      doc.indexedAt = Date.now();

      // 更新 SQLite
      this.saveDocumentIndex(doc);

      log.info('📄 [KnowledgeBase] 文档索引完成', { 
        path: doc.path, 
        chunkCount: chunks.length,
        docId: doc.id,
      });
    } catch (error) {
      doc.status = 'error';
      doc.error = String(error);
      this.saveDocumentIndex(doc);
      log.error('📄 [KnowledgeBase] 文档索引失败', { 
        path: doc.path, 
        error: String(error),
      });
    }
  }

  // ============================================================================
  // 后台构建
  // ============================================================================

  /**
   * 启动后台构建
   */
  private startBackgroundBuild(): void {
    if (this.buildTimer) return;

    this.buildAbortController = new AbortController();
    
    const runBuild = async () => {
      if (this.buildAbortController?.signal.aborted) return;
      
      await this.processPendingDocuments();
      
      this.buildTimer = setTimeout(runBuild, this.config.backgroundBuild.interval);
    };

    // 延迟启动
    setTimeout(runBuild, this.config.backgroundBuild.idleDelay);
    console.log('[KnowledgeBase] 后台构建已启动');
  }

  /**
   * 停止后台构建
   */
  private stopBackgroundBuild(): void {
    if (this.buildTimer) {
      clearTimeout(this.buildTimer);
      this.buildTimer = undefined;
    }
    this.buildAbortController?.abort();
    this.buildStatus.isRunning = false;
    console.log('[KnowledgeBase] 后台构建已停止');
  }

  // ============================================================================
  // 文件监测
  // ============================================================================

  /**
   * 启动文件监测
   */
  private async startWatching(): Promise<void> {
    const docsDir = this.config.basePath;
    
    try {
      // 确保目录存在
      await mkdir(docsDir, { recursive: true });

      this.watcherAbortController = new AbortController();
      
      // 使用 fs/promises 的 watch API
      this.watcher = watch(docsDir, { 
        recursive: true,
        signal: this.watcherAbortController.signal,
      });

      // 启动监测循环
      this.watchLoop();
      
      console.log('[KnowledgeBase] 文件监测已启动');
    } catch (error) {
      console.error('[KnowledgeBase] 启动文件监测失败:', error);
    }
  }

  /**
   * 监测循环
   */
  private async watchLoop(): Promise<void> {
    if (!this.watcher) return;

    try {
      for await (const event of this.watcher) {
        if (this.watcherAbortController?.signal.aborted) break;
        
        const { eventType, filename } = event;
        if (!filename) continue;

        // 只处理支持的文件类型
        if (!isKnowledgeFileSupported(filename)) continue;

        // 记录变更事件
        this.recordFileChange(eventType, filename);
      }
    } catch (error) {
      // 忽略 abort 错误
      if ((error as Error).name !== 'AbortError') {
        console.error('[KnowledgeBase] 文件监测错误:', error);
      }
    }
  }

  /**
   * 记录文件变更（带防抖）
   */
  private recordFileChange(eventType: WatchEventType, filename: string): void {
    const changeType = eventType === 'rename' ? 'add' : 'change';
    
    // 检查文件是否实际存在
    const fullPath = join(this.config.basePath, filename);
    
    // 使用 stat 检查文件是否存在
    stat(fullPath)
      .then(() => {
        // 文件存在，记录为新增或修改
        this.pendingChanges.set(filename, changeType);
        this.scheduleDebounceProcess();
      })
      .catch(() => {
        // 文件不存在，可能是删除事件
        if (this.documents.has(filename)) {
          this.pendingChanges.set(filename, 'unlink');
          this.scheduleDebounceProcess();
        }
      });
  }

  /**
   * 调度防抖处理
   */
  private scheduleDebounceProcess(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    
    // 500ms 防抖
    this.debounceTimer = setTimeout(() => {
      this.processPendingChanges();
    }, 500);
  }

  /**
   * 处理累积的文件变更
   */
  private async processPendingChanges(): Promise<void> {
    if (this.pendingChanges.size === 0) return;

    const changes = new Map(this.pendingChanges);
    this.pendingChanges.clear();

    console.log(`[KnowledgeBase] 检测到 ${changes.size} 个文件变更`);

    for (const [filename, changeType] of changes) {
      const docsDir = this.config.basePath;
      const filePath = join(docsDir, filename);
      const relativePath = filename;

      try {
        if (changeType === 'unlink') {
          await this.removeDocument(relativePath);
        } else {
          // 检查是否是新文件
          const existingDoc = this.documents.get(relativePath);
          if (existingDoc) {
            await this.updateDocument(filePath, relativePath);
          } else {
            await this.addDocument(filePath, relativePath);
          }
        }
      } catch (error) {
        console.error(`[KnowledgeBase] 处理文件变更失败: ${filename}`, error);
      }
    }

    // 如果有待处理的文档，立即触发构建
    const hasPending = Array.from(this.documents.values()).some(d => d.status === 'pending');
    if (hasPending) {
      this.processPendingDocuments().catch(err => {
        console.error('[KnowledgeBase] 后台构建失败:', err);
      });
    }
  }

  /**
   * 停止文件监测
   */
  private stopWatching(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = undefined;
    }

    this.watcherAbortController?.abort();
    this.watcherAbortController = undefined;
    this.watcher = undefined;
    this.pendingChanges.clear();
    
    console.log('[KnowledgeBase] 文件监测已停止');
  }

  /**
   * 处理待处理的文档
   */
  private async processPendingDocuments(): Promise<void> {
    const pendingDocs = Array.from(this.documents.values())
      .filter(doc => doc.status === 'pending')
      .slice(0, this.config.backgroundBuild.batchSize);

    if (pendingDocs.length === 0) return;

    this.buildStatus.isRunning = true;
    this.buildStatus.queueLength = pendingDocs.length;

    for (const doc of pendingDocs) {
      if (this.buildAbortController?.signal.aborted) break;
      
      this.buildStatus.currentDocId = doc.id;
      await this.buildDocumentIndex(doc);
      this.buildStatus.processedCount++;
      this.buildStatus.queueLength--;
      this.buildStatus.lastActivityTime = Date.now();
    }

    this.buildStatus.isRunning = false;
    this.buildStatus.currentDocId = undefined;
  }

  // ============================================================================
  // 搜索检索
  // ============================================================================

  // ============================================================================
  // 数据库管理
  // ============================================================================

  /**
   * 初始化 SQLite 数据库
   */
  private async initDatabase(): Promise<void> {
    try {
      // 创建数据目录
      const dataDir = DATA_DIR();
      await mkdir(dataDir, { recursive: true });

      // 打开/创建数据库
      const dbPath = join(dataDir, DB_FILE);
      this.db = new Database(dbPath);

      // 创建文档索引表（metadata 存储为 JSON）
      this.db.run(`
        CREATE TABLE IF NOT EXISTS documents (
          id TEXT PRIMARY KEY,
          path TEXT UNIQUE NOT NULL,
          content_preview TEXT,
          metadata_json TEXT NOT NULL,
          status TEXT NOT NULL,
          error TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          indexed_at INTEGER
        )
      `);

      // 创建路径索引
      this.db.run(`
        CREATE INDEX IF NOT EXISTS idx_documents_path ON documents(path)
      `);

      // 创建状态索引
      this.db.run(`
        CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status)
      `);

      log.info('[KnowledgeBase] SQLite 数据库已初始化', { path: dbPath });
    } catch (error) {
      log.error('[KnowledgeBase] 初始化数据库失败', { error });
      throw error;
    }
  }

  /**
   * 关闭数据库连接
   */
  private closeDatabase(): void {
    if (this.db) {
      this.db.close();
      this.db = undefined;
    }
  }

  // ============================================================================
  // 索引管理
  // ============================================================================

  /**
   * 加载索引（从 SQLite）
   */
  private async loadIndex(): Promise<void> {
    if (!this.db) return;

    try {
      const rows = this.db.query<{
        id: string;
        path: string;
        content_preview: string | null;
        metadata_json: string;
        status: string;
        error: string | null;
        created_at: number;
        updated_at: number;
        indexed_at: number | null;
      }, []>(`
        SELECT * FROM documents
      `).all();

      for (const row of rows) {
        const metadata = JSON.parse(row.metadata_json) as KnowledgeDocMetadata;
        this.documents.set(row.path, {
          id: row.id,
          path: row.path,
          content: row.content_preview ?? '',
          metadata,
          status: row.status as KnowledgeDocStatus,
          error: row.error ?? undefined,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          indexedAt: row.indexed_at ?? undefined,
        });
      }

      log.info('[KnowledgeBase] 已加载文档索引', { count: this.documents.size });
    } catch (error) {
      log.error('[KnowledgeBase] 加载索引失败', { error });
      this.documents.clear();
    }
  }

  /**
   * 保存单个文档索引（upsert）
   */
  private saveDocumentIndex(doc: KnowledgeDocument): void {
    if (!this.db) return;

    try {
      this.db.run(`
        INSERT OR REPLACE INTO documents (
          id, path, content_preview, metadata_json, status, error,
          created_at, updated_at, indexed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        doc.id,
        doc.path,
        doc.content.slice(0, 500),
        JSON.stringify(doc.metadata),
        doc.status,
        doc.error ?? null,
        doc.createdAt,
        doc.updatedAt,
        doc.indexedAt ?? null,
      ]);
    } catch (error) {
      log.error('[KnowledgeBase] 保存文档索引失败', { path: doc.path, error });
    }
  }

  /**
   * 删除文档索引
   */
  private deleteDocumentIndex(path: string): void {
    if (!this.db) return;

    try {
      this.db.run(`DELETE FROM documents WHERE path = ?`, [path]);
    } catch (error) {
      log.error('[KnowledgeBase] 删除文档索引失败', { path, error });
    }
  }

  // ============================================================================
  // 工具方法
  // ============================================================================

  /**
   * 列出所有文件
   */
  private async listAllFiles(dir: string): Promise<string[]> {
    const files: string[] = [];
    
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          const subFiles = await this.listAllFiles(fullPath);
          files.push(...subFiles);
        } else if (entry.isFile()) {
          files.push(fullPath);
        }
      }
    } catch {
      // 忽略读取错误
    }
    
    return files;
  }

  /**
   * 计算文本哈希
   */
  private computeHash(content: string): string {
    return createHash('sha256').update(content).digest('hex').slice(0, 16);
  }

  /**
   * 生成文档ID
   */
  private generateDocId(): string {
    return `doc_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }

  /**
   * 提取文档标题
   */
  private extractTitle(content: string, filename: string): string {
    // 尝试从 Markdown 标题提取
    const titleMatch = content.match(/^#\s+(.+)$/m);
    if (titleMatch) {
      return titleMatch[1].trim();
    }
    
    // 使用文件名（去掉扩展名）
    return filename.replace(extname(filename), '');
  }

  // ============================================================================
  // 公共 API
  // ============================================================================

  /**
   * 获取统计信息
   */
  getStats(): KnowledgeBaseStats {
    const docs = Array.from(this.documents.values());
    const indexedDocs = docs.filter(d => d.status === 'indexed');
    const pendingDocs = docs.filter(d => d.status === 'pending');
    const errorDocs = docs.filter(d => d.status === 'error');
    const totalChunks = indexedDocs.reduce((sum, d) => sum + (d.chunks?.length ?? 0), 0);
    const totalSize = docs.reduce((sum, d) => sum + d.metadata.fileSize, 0);

    return {
      totalDocuments: docs.length,
      indexedDocuments: indexedDocs.length,
      pendingDocuments: pendingDocs.length,
      errorDocuments: errorDocs.length,
      totalChunks,
      totalSize,
      lastUpdated: Math.max(...docs.map(d => d.updatedAt), 0),
    };
  }

  /**
   * 获取后台构建状态
   */
  getBuildStatus(): BackgroundBuildStatus {
    return { ...this.buildStatus };
  }

  /**
   * 手动触发文档索引构建
   */
  async rebuildIndex(): Promise<void> {
    console.log('[KnowledgeBase] 开始重建索引...');
    
    // 重置所有文档状态
    for (const doc of this.documents.values()) {
      doc.status = 'pending';
      doc.chunks = undefined;
      doc.indexedAt = undefined;
      this.buildStatus.queueLength++;
    }

    await this.processPendingDocuments();
    console.log('[KnowledgeBase] 索引重建完成');
  }

  /**
   * 获取所有文档
   */
  getDocuments(): KnowledgeDocument[] {
    return Array.from(this.documents.values());
  }

  /**
   * 获取指定文档
   */
  getDocument(path: string): KnowledgeDocument | undefined {
    return this.documents.get(path);
  }
}

// 导出单例
let globalKnowledgeBase: KnowledgeBaseManager | null = null;

export function getKnowledgeBase(
  config?: Partial<KnowledgeBaseConfig>,
  memoryStore?: MemoryStore
): KnowledgeBaseManager {
  if (!globalKnowledgeBase) {
    globalKnowledgeBase = new KnowledgeBaseManager(config, memoryStore);
  }
  return globalKnowledgeBase;
}

export function setKnowledgeBase(kb: KnowledgeBaseManager): void {
  globalKnowledgeBase = kb;
}
