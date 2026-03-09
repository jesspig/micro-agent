/**
 * 知识库文档扫描器
 */

import { readdir, stat } from 'fs/promises';
import { join, basename, extname, relative } from 'path';
import { createHash } from 'crypto';
import type { KnowledgeDocument } from './types';
import { getKnowledgeDocType, isKnowledgeFileSupported } from './types';
import { extractDocumentContent } from './extractor';
import { getLogger } from '@logtape/logtape';

const log = getLogger(['knowledge', 'scanner']);

/**
 * 文档扫描器接口
 */
export interface DocumentScanner {
  scanDocuments(): Promise<void>;
  addDocument(filePath: string, relativePath: string): Promise<KnowledgeDocument>;
  updateDocument(filePath: string, relativePath: string): Promise<void>;
  removeDocument(relativePath: string): Promise<void>;
}

/**
 * 创建文档扫描器
 */
export function createDocumentScanner(
  documents: Map<string, KnowledgeDocument>,
  basePath: string,
  onDocumentChange?: (type: 'add' | 'update' | 'remove', doc: KnowledgeDocument) => void
): DocumentScanner {
  return {
    async scanDocuments(): Promise<void> {
      try {
        const files = await listAllFiles(basePath);
        const currentPaths = new Set<string>();

        for (const filePath of files) {
          if (!isKnowledgeFileSupported(filePath)) continue;

          const relativePath = relative(basePath, filePath);
          currentPaths.add(relativePath);

          const fileStat = await stat(filePath);
          const existingDoc = documents.get(relativePath);

          if (!existingDoc) {
            const doc = await this.addDocument(filePath, relativePath);
            onDocumentChange?.('add', doc);
          } else if (fileStat.mtimeMs > existingDoc.metadata.modifiedAt) {
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

    async addDocument(filePath: string, relativePath: string): Promise<KnowledgeDocument> {
      const fileType = getKnowledgeDocType(filePath);
      const content = await extractDocumentContent(filePath, fileType);
      const fileStat = await stat(filePath);
      const fileHash = computeHash(content);

      const doc: KnowledgeDocument = {
        id: generateDocId(),
        path: relativePath,
        content,
        metadata: {
          originalName: basename(filePath),
          fileType,
          fileSize: fileStat.size,
          fileHash,
          modifiedAt: fileStat.mtimeMs,
          title: extractTitle(content, basename(filePath)),
        },
        status: 'pending',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      documents.set(relativePath, doc);
      log.info('新增文档', { path: relativePath });
      return doc;
    },

    async updateDocument(filePath: string, relativePath: string): Promise<void> {
      const fileType = getKnowledgeDocType(filePath);
      const content = await extractDocumentContent(filePath, fileType);
      const fileStat = await stat(filePath);
      const fileHash = computeHash(content);

      const existingDoc = documents.get(relativePath);
      if (!existingDoc) return;

      existingDoc.content = content;
      existingDoc.metadata.fileHash = fileHash;
      existingDoc.metadata.fileSize = fileStat.size;
      existingDoc.metadata.modifiedAt = fileStat.mtimeMs;
      existingDoc.metadata.title = extractTitle(content, basename(filePath));
      existingDoc.status = 'pending';
      existingDoc.chunks = undefined;
      existingDoc.updatedAt = Date.now();
      existingDoc.indexedAt = undefined;

      log.info('更新文档', { path: relativePath });
    },

    async removeDocument(relativePath: string): Promise<void> {
      documents.delete(relativePath);
      log.info('删除文档', { path: relativePath });
    },
  };
}

function generateDocId(): string {
  return `doc_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function computeHash(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 16);
}

function extractTitle(content: string, filename: string): string {
  if (extname(filename).toLowerCase() === '.pdf') {
    return filename.replace(extname(filename), '');
  }
  const titleMatch = content.match(/^#\s+(.+)$/m);
  if (titleMatch) return titleMatch[1].trim();
  return filename.replace(extname(filename), '');
}

async function listAllFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...await listAllFiles(fullPath));
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }
  } catch {}
  return files;
}
