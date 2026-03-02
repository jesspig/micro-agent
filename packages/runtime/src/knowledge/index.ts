/**
 * 知识库模块
 * 
 * 提供独立的文档管理和 RAG 检索能力。
 * 用户可以将文档放入 ~/.micro-agent/knowledge/ 目录，
 * 系统会自动构建向量索引并在需要时检索相关内容。
 */

export * from './types';
export { KnowledgeBaseManager, getKnowledgeBase, setKnowledgeBase } from './manager';

// 导出子模块（供内部使用）
export { extractDocumentContent, parseCSVContent } from './extractor';
export { createDocumentScanner, type DocumentScanner } from './scanner';
export { createDocumentIndexer, type DocumentIndexer, type IndexerConfig } from './indexer';
export { createFileWatcher, type FileWatcher, type FileChangeEvent, type FileChangeType } from './watcher';

// 默认导出
export { getKnowledgeBase as default } from './manager';