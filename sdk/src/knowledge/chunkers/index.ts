/**
 * 分块器模块入口
 *
 * 重导出 agent-service 的分块器实现。
 */

export {
  RecursiveChunker,
  createRecursiveChunker,
  defaultChunker,
  RecursiveChunkerConfigSchema,
  type RecursiveChunkerConfig,
  type ChunkResult,
} from '@micro-agent/runtime/capability/knowledge/chunkers';