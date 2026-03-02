/**
 * 知识库索引构建器
 * 
 * 负责文档分块和向量索引构建n */

import type { KnowledgeDocument, KnowledgeChunk } from './types';
import { getLogger } from '@logtape/logtape';
import type { MemoryStore } from '../memory/store';

const log = getLogger(['knowledge', 'indexer']);

/**
 * 索引配置
 */
export interface IndexerConfig {
  /** 分块大小 */
  chunkSize: number;
  /** 分块重叠 */
  chunkOverlap: number;
}

/**
 * 索引构建器接口
 */
export interface DocumentIndexer {
  /** 构建文档索引 */
  buildDocumentIndex(doc: KnowledgeDocument): Promise<void>;
  
  /** 分块文档 */
  chunkDocument(doc: KnowledgeDocument): KnowledgeChunk[];
  
  /** 获取配置 */
  getConfig(): IndexerConfig;
}

/**
 * 创建文档索引构建器
 */
export function createDocumentIndexer(
  config: IndexerConfig,
  memoryStore?: MemoryStore,
  onIndexComplete?: (doc: KnowledgeDocument, chunkCount: number) => void,
  onIndexError?: (doc: KnowledgeDocument, error: unknown) => void
): DocumentIndexer {
  return {
    /**
     * 构建文档向量索引
     * 
     * 将文档分块存入 MemoryStore，向量检索通过 MemoryStore.dualLayerSearch() 实现
     */
    async buildDocumentIndex(doc: KnowledgeDocument): Promise<void> {
      if (!memoryStore) {
        doc.status = 'error';
        doc.error = 'MemoryStore 未注入';
        onIndexError?.(doc, new Error('MemoryStore 未注入'));
        log.error('📄 [KnowledgeBase] MemoryStore 未注入，无法构建索引');
        return;
      }

      doc.status = 'processing';

      try {
        // 分块
        const chunks = this.chunkDocument(doc);

        // 存储到 MemoryStore（向量由 MemoryStore 内部生成）
        await memoryStore.storeDocumentChunks(doc.id, chunks, doc.metadata);

        doc.chunks = chunks;
        doc.status = 'indexed';
        doc.indexedAt = Date.now();

        onIndexComplete?.(doc, chunks.length);

        log.info('📄 [KnowledgeBase] 文档索引完成', {
          path: doc.path,
          chunkCount: chunks.length,
          docId: doc.id,
        });
      } catch (error) {
        doc.status = 'error';
        doc.error = String(error);
        onIndexError?.(doc, error);
        log.error('📄 [KnowledgeBase] 文档索引失败', {
          path: doc.path,
          error: String(error),
        });
      }
    },

    /**
     * 将文档分块
     */
    chunkDocument(doc: KnowledgeDocument): KnowledgeChunk[] {
      const chunks: KnowledgeChunk[] = [];
      const { chunkSize, chunkOverlap } = config;
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
          chunks.push(createChunk(doc.id, currentChunk, chunkStartPos, currentPos));

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
        chunks.push(createChunk(doc.id, currentChunk, chunkStartPos, content.length));
      }

      return chunks;
    },

    getConfig(): IndexerConfig {
      return { ...config };
    },
  };
}

/**
 * 创建块
 */
function createChunk(
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
