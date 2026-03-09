/**
 * 记忆存储模块入口
 */

// MemoryVectorStore 是底层实现
export { MemoryVectorStore } from './memory-store';

// 从 types 重新导出
export type { EmbeddingService, MemoryStoreConfig } from '../types';
