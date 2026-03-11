/**
 * Agent Service 类型定义
 *
 * 定义服务层的核心类型和接口
 */

import type { Config } from '../runtime/infrastructure/config';
import type { LLMProvider } from '../runtime/provider/llm';
import type { ToolRegistry } from '../runtime/capability/tool-system';
import type { SkillRegistry } from '../runtime/capability/skill-system';
import type { LangGraphOrchestrator } from '../runtime/kernel';
import type { KnowledgeRetriever, KnowledgeBaseConfig, KnowledgeDocument } from '../runtime/capability/knowledge';
import type { SessionStore } from '../runtime/infrastructure/database/session/store';
import type { EmbeddingService, SimpleMemoryManager } from '../runtime/capability/memory';
import {
  USER_KNOWLEDGE_DIR,
  DEFAULT_EXECUTOR_CONFIG,
} from '../runtime/infrastructure/config';

/** Agent Service 配置 */
export interface AgentServiceConfig {
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
  workspace?: string;
  knowledgeBase?: string;
  maxIterations?: number;
}

/** 默认配置 */
export const DEFAULT_CONFIG: AgentServiceConfig = {
  logLevel: 'info',
  workspace: process.cwd(),
  knowledgeBase: USER_KNOWLEDGE_DIR,
  maxIterations: DEFAULT_EXECUTOR_CONFIG.maxIterations,
};

/** 技能配置 */
export interface SkillConfig {
  name: string;
  description?: string;
  enabled?: boolean;
  path?: string;
  always?: boolean;
  allowedTools?: string[];
}

/**
 * 简化版知识库管理器
 *
 * Agent Service 内部使用的轻量级知识库管理器
 */
export class SimpleKnowledgeBaseManager {
  private documents: Map<string, KnowledgeDocument> = new Map();
  private _config: KnowledgeBaseConfig;
  private isInitialized = false;

  constructor(config: KnowledgeBaseConfig) {
    this._config = config;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    this.isInitialized = true;
  }

  getDocumentMap(): Map<string, KnowledgeDocument> {
    return this.documents;
  }

  getDocuments(): KnowledgeDocument[] {
    return Array.from(this.documents.values());
  }

  getDocument(path: string): KnowledgeDocument | undefined {
    return this.documents.get(path);
  }

  setDocument(path: string, doc: KnowledgeDocument): void {
    this.documents.set(path, doc);
  }

  deleteDocument(path: string): void {
    this.documents.delete(path);
  }

  getStats() {
    const docs = Array.from(this.documents.values());
    const indexedDocs = docs.filter(d => d.status === 'indexed');
    const pendingDocs = docs.filter(d => d.status === 'pending');

    return {
      totalDocuments: docs.length,
      indexedDocuments: indexedDocs.length,
      pendingDocuments: pendingDocs.length,
      errorDocuments: docs.filter(d => d.status === 'error').length,
      totalChunks: indexedDocs.reduce((sum, d) => sum + (d.chunks?.length ?? 0), 0),
      totalSize: docs.reduce((sum, d) => sum + d.metadata.fileSize, 0),
      lastUpdated: Math.max(...docs.map(d => d.updatedAt), 0),
    };
  }

  isReady(): boolean {
    return this.isInitialized;
  }
}

/** 服务组件容器 */
export interface ServiceComponents {
  appConfig: Config | null;
  llmProvider: LLMProvider | null;
  toolRegistry: ToolRegistry | null;
  skillRegistry: SkillRegistry | null;
  orchestrator: LangGraphOrchestrator | null;
  memoryManager: SimpleMemoryManager | null;
  knowledgeBaseManager: SimpleKnowledgeBaseManager | null;
  knowledgeRetriever: KnowledgeRetriever | null;
  embeddingService: EmbeddingService | null;
  knowledgeConfig: KnowledgeBaseConfig | null;
  sessionStore: SessionStore | null;
  defaultModel: string;
  systemPrompt: string;
}

/** 会话数据 */
export interface SessionData {
  messages: Array<{ role: string; content: string }>;
}

/** 工具调用结果 */
export interface ToolCallResult {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

/** 流式回调接口 */
export interface StreamCallbacks {
  onChunk: (chunk: string) => Promise<void>;
  onComplete: () => Promise<void>;
  onError: (error: Error) => Promise<void>;
}