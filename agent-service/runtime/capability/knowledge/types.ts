/**
 * 知识库类型定义
 */

// 从统一类型定义导入配置类型
export type { KnowledgeBaseConfig, BackgroundBuildConfig } from '../../../types/config';

/** 知识库文档类型 */
export type KnowledgeDocType =
  | 'markdown'
  | 'text'
  | 'pdf'
  | 'code'
  | 'json'
  | 'yaml'
  | 'word'
  | 'excel'
  | 'powerpoint'
  | 'csv'
  | 'xml'
  | 'rtf';

/** 知识库文档状态 */
export type KnowledgeDocStatus =
  | 'pending'
  | 'processing'
  | 'indexed'
  | 'error';

/** 知识库文档元数据 */
export interface KnowledgeDocMetadata {
  originalName: string;
  fileType: KnowledgeDocType;
  fileSize: number;
  fileHash: string;
  modifiedAt: number;
  title?: string;
  summary?: string;
  tags?: string[];
  source?: string;
}

/** 知识库文档 */
export interface KnowledgeDocument {
  id: string;
  path: string;
  content: string;
  chunks?: KnowledgeChunk[];
  metadata: KnowledgeDocMetadata;
  status: KnowledgeDocStatus;
  error?: string;
  createdAt: number;
  updatedAt: number;
  indexedAt?: number;
}

/** 知识库文档块 */
export interface KnowledgeChunk {
  id: string;
  docId: string;
  content: string;
  startPos: number;
  endPos: number;
  vector?: number[];
  metadata?: {
    lineStart?: number;
    lineEnd?: number;
    section?: string;
  };
}

/** 知识库检索结果 */
export interface KnowledgeSearchResult {
  document: KnowledgeDocument;
  chunks: KnowledgeChunk[];
  score: number;
  preview: string;
}

/** 知识库统计信息 */
export interface KnowledgeBaseStats {
  totalDocuments: number;
  indexedDocuments: number;
  pendingDocuments: number;
  errorDocuments: number;
  totalChunks: number;
  totalSize: number;
  lastUpdated: number;
}

/** 支持的文件扩展名映射 */
export const KNOWLEDGE_FILE_EXTENSIONS: Record<string, KnowledgeDocType> = {
  '.md': 'markdown',
  '.markdown': 'markdown',
  '.txt': 'text',
  '.pdf': 'pdf',
  '.json': 'json',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.csv': 'csv',
  '.tsv': 'csv',
  '.doc': 'word',
  '.docx': 'word',
  '.xls': 'excel',
  '.xlsx': 'excel',
  '.ppt': 'powerpoint',
  '.pptx': 'powerpoint',
  '.xml': 'xml',
  '.rtf': 'rtf',
  '.js': 'code',
  '.ts': 'code',
  '.tsx': 'code',
  '.py': 'code',
  '.go': 'code',
  '.rs': 'code',
  '.java': 'code',
  '.html': 'code',
  '.css': 'code',
  '.sql': 'code',
  '.sh': 'code',
};

/** 获取文件类型 */
export function getKnowledgeDocType(filename: string): KnowledgeDocType {
  const ext = filename.toLowerCase().slice(filename.lastIndexOf('.'));
  return KNOWLEDGE_FILE_EXTENSIONS[ext] ?? 'text';
}

/** 检查文件是否受支持 */
export function isKnowledgeFileSupported(filename: string): boolean {
  const ext = filename.toLowerCase().slice(filename.lastIndexOf('.'));
  return ext in KNOWLEDGE_FILE_EXTENSIONS;
}
