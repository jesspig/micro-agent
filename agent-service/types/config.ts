/**
 * 配置类型定义
 */

/** 配置层级 */
export type ConfigLevel = 'user' | 'project' | 'directory';

/** 配置源 */
export interface ConfigSource {
  /** 配置层级 */
  level: ConfigLevel;
  /** 配置文件路径 */
  path: string;
  /** 配置内容 */
  content: Record<string, unknown>;
  /** 最后修改时间 */
  modifiedAt?: Date;
}

/** 配置路径 */
export interface ConfigPaths {
  /** 用户级配置路径 */
  readonly user: string;
  /** 项目级配置路径（可能不存在） */
  readonly project: string | undefined;
  /** 目录级配置路径（可能不存在） */
  readonly directory: string | undefined;
}

/** 合并后的配置 */
export interface MergedConfig {
  /** 最终配置内容 */
  readonly content: Record<string, unknown>;
  /** 配置来源追踪 */
  readonly sources: ConfigSource[];
  /** 合并时间 */
  readonly mergedAt: Date;
}

/** Provider 条目配置 */
export interface ProviderEntry {
  /** API 基础 URL */
  baseUrl: string;
  /** API 密钥 */
  apiKey?: string;
  /** 模型ID列表 */
  models?: string[];
}

/** 模型配置 */
export interface ModelsConfig {
  /** 对话模型 */
  chat?: string;
  /** 工具调用模型 */
  tool?: string;
  /** 嵌入模型 */
  embed?: string;
  /** 视觉模型 */
  vision?: string;
  /** 编程模型 */
  coder?: string;
  /** 意图识别模型 */
  intent?: string;
}

/** 多嵌入模型配置 */
export interface MultiEmbedConfig {
  /** 是否启用多嵌入模型支持 */
  enabled: boolean;
  /** 最大保留模型数 */
  maxModels: number;
  /** 是否自动迁移 */
  autoMigrate: boolean;
  /** 迁移批次大小 */
  batchSize: number;
  /** 迁移间隔（毫秒） */
  migrateInterval: number;
}

/** 记忆配置 */
export interface MemoryConfig {
  /** 是否启用记忆系统 */
  enabled: boolean;
  /** 记忆存储路径 */
  storagePath: string;
  /** 是否启用自动摘要 */
  autoSummarize: boolean;
  /** 触发摘要的消息阈值 */
  summarizeThreshold: number;
  /** 空闲超时时间（毫秒） */
  idleTimeout: number;
  /** 短期记忆保留天数 */
  shortTermRetentionDays: number;
  /** 检索结果数量限制 */
  searchLimit: number;
  /** 多嵌入模型配置 */
  multiEmbed?: MultiEmbedConfig;
  /** 记忆整合配置 */
  consolidation?: ConsolidationConfig;
  /** 检索配置 */
  retrieval?: RetrievalConfig;
  /** 分块配置 */
  chunking?: ChunkingConfig;
}

/** 引用溯源配置 */
export interface CitationConfig {
  /** 是否启用引用溯源 */
  enabled: boolean;
  /** 最小置信度阈值 (0-1) */
  minConfidence: number;
  /** 最大引用数 */
  maxCitations: number;
  /** 引用格式 */
  format: 'numbered' | 'bracket' | 'footnote';
  /** 片段最大长度 */
  maxSnippetLength: number;
}

/** 循环检测配置 */
export interface LoopDetectionConfig {
  /** 是否启用循环检测 */
  enabled: boolean;
  /** 警告阈值 */
  warningThreshold: number;
  /** 临界阈值 */
  criticalThreshold: number;
}

/** 执行器配置 */
export interface ExecutorConfig {
  /** 最大迭代次数 */
  maxIterations: number;
  /** 循环检测配置 */
  loopDetection?: LoopDetectionConfig;
}

/** 后台构建配置 */
export interface BackgroundBuildConfig {
  /** 是否启用后台构建 */
  enabled: boolean;
  /** 构建间隔（毫秒） */
  interval: number;
  /** 每次处理的最大文档数 */
  batchSize: number;
  /** 空闲等待时间（毫秒） */
  idleDelay: number;
}

/** 知识库配置 */
export interface KnowledgeBaseConfig {
  /** 是否启用知识库 */
  enabled: boolean;
  /** 知识库基础路径 */
  basePath: string;
  /** 文档分块大小 */
  chunkSize: number;
  /** 分块重叠大小 */
  chunkOverlap: number;
  /** 最大搜索结果数 */
  maxSearchResults: number;
  /** 最小相似度阈值 */
  minSimilarityScore: number;
  /** 后台构建配置 */
  backgroundBuild: BackgroundBuildConfig;
  /** 嵌入模型 ID */
  embedModel?: string;
}

/** 记忆整合配置 */
export interface ConsolidationConfig {
  /** 触发整合的消息数阈值 */
  messageThreshold: number;
  /** 空闲超时时间（毫秒） */
  idleTimeout: number;
  /** 是否启用事件驱动整合 */
  eventDriven: boolean;
  /** 整合后保留原始消息的天数 */
  retentionDays: number;
  /** 最大摘要长度 */
  maxSummaryLength: number;
}

/** 检索配置 */
export interface RetrievalConfig {
  /** 检索模式 */
  mode: 'auto' | 'hybrid' | 'vector' | 'fulltext';
  /** 默认返回数量 */
  defaultLimit: number;
  /** 最大返回数量 */
  maxLimit: number;
  /** 最小相似度阈值 */
  minScore: number;
  /** RRF 常数 K */
  rrfK: number;
  /** 向量检索权重 */
  vectorWeight: number;
  /** 全文检索权重 */
  fulltextWeight: number;
  /** 时间衰减半衰期（天） */
  decayHalfLife: number;
}

/** 分块配置 */
export interface ChunkingConfig {
  /** 分块大小 */
  chunkSize: number;
  /** 分块重叠 */
  chunkOverlap: number;
  /** 分块策略 */
  strategy: 'fixed' | 'recursive' | 'semantic';
  /** 分隔符（用于 fixed 策略） */
  separator?: string;
  /** 递归分块的层级分隔符（用于 recursive 策略） */
  separators?: string[];
}

/** 工作区配置 */
export interface WorkspaceConfig {
  /** 工作区路径 */
  path: string;
  /** 工作区名称 */
  name?: string;
  /** 工作区描述 */
  description?: string;
}

/** Agent 配置（完整配置） */
export interface AgentFullConfig {
  /** 默认工作区路径 */
  workspace: string;
  /** 模型配置 */
  models?: ModelsConfig;
  /** 记忆系统配置 */
  memory?: MemoryConfig;
  /** 执行器配置 */
  executor?: ExecutorConfig;
  /** 引用溯源配置 */
  citation?: CitationConfig;
  /** 生成的最大 token 数量 */
  maxTokens: number;
  /** 控制响应的随机性 */
  temperature: number;
  /** 限制 token 选择范围为前 k 个候选 */
  topK: number;
  /** 核采样参数 */
  topP: number;
  /** 频率惩罚 */
  frequencyPenalty: number;
}

/** 完整配置 */
export interface Config {
  /** Agent 配置 */
  agents: AgentFullConfig;
  /** 工作区列表 */
  workspaces: Array<string | WorkspaceConfig>;
  /** Provider 配置 */
  providers: Record<string, ProviderEntry>;
  /** 知识库配置 */
  knowledgeBase?: KnowledgeBaseConfig;
}