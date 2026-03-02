/**
 * 知识库文档扫描器
 * 
 * 负责扫描文档目录、检测文件变更、管理文档生命周期
 */

import { readdir, stat } from 'fs/promises';
import { join, basename, extname, relative } from 'path';
import { createHash } from 'crypto';
import type { WatchEventType } from 'fs';
import type { KnowledgeDocument, KnowledgeDocType } from './types';
import { getKnowledgeDocType, isKnowledgeFileSupported } from './types';
import { getLogger } from '@logtape/logtape';
import { extractDocumentContent } from './extractor';

const log = getLogger(['knowledge', 'scanner']);

/**
 * 文档扫描器接口
 */
export interface DocumentScanner {
  /** 扫描文档目录 */
  scanDocuments(): Promise<void>;
  
  /** 添加新文档 */
  addDocument(filePath: string, relativePath: string): Promise<KnowledgeDocument>;
  
  /** 更新已有文档 */
  updateDocument(filePath: string, relativePath: string): Promise<void>;
  
  /** 移除文档 */
  removeDocument(relativePath: string): Promise<void>;
  
  /** 获取文档映射 */
  getDocuments(): Map<string, KnowledgeDocument>;
  
  /** 设置文档映射 */
  setDocuments(documents: Map<string, KnowledgeDocument>): void;
  
  /** 获取配置 */
  getConfig(): { basePath: string };
  
  /** 生成文档ID */
  generateDocId(): string;
  
  /** 计算哈希 */
  computeHash(content: string): string;
  
  /** 提取标题 */
  extractTitle(content: string, filename: string): string;
}

/**
 * 创建文档扫描器
 * 
 * @param documents 文档映射
 * @param basePath 知识库根目录
 * @param onDocumentChange 文档变更回调
 */
export function createDocumentScanner(
  documents: Map<string, KnowledgeDocument>,
  basePath: string,
  onDocumentChange?: (type: 'add' | 'update' | 'remove', doc: KnowledgeDocument) => void
): DocumentScanner {
  return {
    /**
     * 扫描文档目录，检测新增、修改和删除的文件
     */
    async scanDocuments(): Promise<void> {
      const docsDir = basePath;

      try {
        // 获取当前所有文件
        const files = await listAllFiles(docsDir);
        const currentPaths = new Set<string>();

        for (const filePath of files) {
          if (!isKnowledgeFileSupported(filePath)) continue;

          const relativePath = relative(docsDir, filePath);
          currentPaths.add(relativePath);

          // 检查文件是否需要更新
          const fileStat = await stat(filePath);
          const existingDoc = documents.get(relativePath);

          if (!existingDoc) {
            // 新增文件
            const doc = await this.addDocument(filePath, relativePath);
            onDocumentChange?.('add', doc);
          } else if (fileStat.mtimeMs > existingDoc.metadata.modifiedAt) {
            // 文件已修改，重新索引
            await this.updateDocument(filePath, relativePath);
            const updatedDoc = documents.get(relativePath);
            if (updatedDoc) onDocumentChange?.('update', updatedDoc);
          }
        }

        // 检查被删除的文件
        for (const [path, doc] of documents) {
          if (!currentPaths.has(path)) {
            await this.removeDocument(path);
            onDocumentChange?.('remove', doc);
          }
        }

        log.info('文档扫描完成', { documentCount: documents.size });
      } catch (error) {
        log.error('文档扫描失败', { error: String(error) });
      }
    },

    /**
     * 添加新文档
     */
    async addDocument(filePath: string, relativePath: string): Promise<KnowledgeDocument> {
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

      documents.set(relativePath, doc);

      log.info('新增文档', { path: relativePath });
      return doc;
    },

    /**
     * 更新已有文档
     */
    async updateDocument(filePath: string, relativePath: string): Promise<void> {
      const fileType = getKnowledgeDocType(filePath);
      const content = await extractDocumentContent(filePath, fileType);
      const fileStat = await stat(filePath);
      const fileHash = this.computeHash(content);

      const existingDoc = documents.get(relativePath);
      if (!existingDoc) return;

      // 检查内容是否真的变化
      if (existingDoc.metadata.fileHash === fileHash) {
        // 仅更新时间戳
        existingDoc.metadata.modifiedAt = fileStat.mtimeMs;
        existingDoc.updatedAt = Date.now();
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

      log.info('更新文档', { path: relativePath });
    },

    /**
     * 移除文档
     */
    async removeDocument(relativePath: string): Promise<void> {
      const doc = documents.get(relativePath);
      if (!doc) return;

      documents.delete(relativePath);

      log.info('📄 [KnowledgeBase] 删除文档', { path: relativePath });
    },

    getDocuments(): Map<string, KnowledgeDocument> {
      return documents;
    },

    setDocuments(newDocuments: Map<string, KnowledgeDocument>): void {
      documents.clear();
      for (const [key, value] of newDocuments) {
        documents.set(key, value);
      }
    },

    getConfig(): { basePath: string } {
      return { basePath };
    },

    /**
     * 生成文档ID
     */
    generateDocId(): string {
      return `doc_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    },

    /**
     * 计算文本哈希
     */
    computeHash(content: string): string {
      return createHash('sha256').update(content).digest('hex').slice(0, 16);
    },

    /**
     * 提取文档标题
     */
    extractTitle(content: string, filename: string): string {
      // 尝试从 Markdown 标题提取
      const titleMatch = content.match(/^#\s+(.+)$/m);
      if (titleMatch) {
        return titleMatch[1].trim();
      }

      // 使用文件名（去掉扩展名）
      return filename.replace(extname(filename), '');
    },
  };
}

/**
 * 列出所有文件
 */
async function listAllFiles(dir: string): Promise<string[]> {
  const files: string[] = [];

  try {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        const subFiles = await listAllFiles(fullPath);
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
