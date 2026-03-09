/**
 * 知识库类型定义
 *
 * 重导出 agent-service 的类型，避免重复定义。
 */

// 从 agent-service 重导出知识库类型
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
} from '@micro-agent/runtime/capability/knowledge/types';

export {
  KNOWLEDGE_FILE_EXTENSIONS,
  getKnowledgeDocType,
  isKnowledgeFileSupported,
} from '@micro-agent/runtime/capability/knowledge/types';

/** 嵌入服务接口（SDK 层特有） */
export interface EmbeddingServiceProvider {
  embed(text: string): Promise<number[]>;
  isAvailable(): boolean;
}
