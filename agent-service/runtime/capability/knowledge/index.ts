/**
 * 知识库模块入口
 *
 * 提供 Agent 运行时基础能力，高级封装已迁移至 SDK。
 */

// Types
export type {
  KnowledgeDocType,
  KnowledgeDocStatus,
  KnowledgeDocMetadata,
  KnowledgeDocument,
  KnowledgeChunk,
  KnowledgeSearchResult,
  KnowledgeBaseConfig,
  BackgroundBuildConfig,
  KnowledgeBaseStats,
} from './types';

export {
  KNOWLEDGE_FILE_EXTENSIONS,
  getKnowledgeDocType,
  isKnowledgeFileSupported,
} from './types';

// Scanner - 文档扫描（基础能力）
export {
  createDocumentScanner,
  type DocumentScanner,
} from './scanner';

// Indexer - 基础索引构建（基础能力）
export {
  createDocumentIndexer,
  type IndexerConfig,
} from './indexer';

// Extractor - 内容提取（基础能力）
export {
  extractDocumentContent,
  parseCSVContent,
} from './extractor';

// Retriever - 基础检索器（基础能力）
export {
  KnowledgeRetriever,
  createRetriever,
  type RetrieverConfig,
} from './retriever';

// Chunkers - 分块器（基础能力）
export {
  RecursiveChunker,
  createRecursiveChunker,
  defaultChunker,
  RecursiveChunkerConfigSchema,
  type RecursiveChunkerConfig,
  type ChunkResult,
} from './chunkers';

// Chunk Indexer - 分块索引器（基础能力）
export {
  ChunkIndexer,
  createChunkIndexer,
  ChunkIndexerConfigSchema,
  type ChunkIndexerConfig,
  type ChunkVectorRecord,
  type IndexResult,
  type IndexStats,
} from './indexer/chunk-indexer';

// ========== 模块迁移记录 (完成于 2026-03-09) ==========
// 状态: 已完成
// KnowledgeBaseManager → sdk/src/knowledge/manager.ts
// KnowledgeSearcher → sdk/src/knowledge/searcher/knowledge-searcher.ts
// SourceAnnotator → sdk/src/knowledge/searcher/source-annotator.ts