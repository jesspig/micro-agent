/**
 * Runtime 核心类型定义
 */

// 从 providers 重新导出 LLM 消息类型
export type {
  LLMMessage,
  MessageRole,
  MessageContent,
  ContentPart,
  TextContentPart,
  ImageContentPart,
  ResourceContentPart,
  ProviderContentPart,
  ImageUrlContentPart,
  ToolCall,
  UsageStats,
  LLMResponse,
  LLMToolDefinition,
  GenerationConfig,
} from '@micro-agent/providers';

// ============================================================================
// 记忆系统类型
// ============================================================================

/** 记忆条目类型
 * 
 * 分类说明：
 * - conversation: 对话记录（原始消息）
 * - summary: 会话摘要
 * - preference: 用户偏好（喜欢/讨厌/想要）
 * - fact: 事实陈述（用户属性/状态）
 * - decision: 决策记录（达成的共识/决定）
 * - entity: 实体信息（联系人/地点/项目等）
 * - document: 文档内容（知识库文档分块）
 * - other: 其他无法分类的信息
 */
export type MemoryEntryType = 
  | 'conversation' 
  | 'summary' 
  | 'preference' 
  | 'fact' 
  | 'decision' 
  | 'entity' 
  | 'document'
  | 'other';

/** 记忆元数据 */
export interface MemoryMetadata {
  /** 来源通道 */
  channel?: string;
  /** 提及的实体 */
  entities?: string[];
  /** 标签 */
  tags?: string[];
  /** 重要性评分 (0-1) */
  importance?: number;
  /** 过期时间 */
  expiresAt?: Date;
  /** 分类信息 */
  classification?: {
    confidence: number;
    matchedPatterns: string[];
  };
  
  // === 文档记忆专用字段 ===
  /** 文档 ID（知识库来源） */
  documentId?: string;
  /** 文档路径（知识库来源） */
  documentPath?: string;
  /** 文件类型（知识库来源） */
  fileType?: string;
  /** 文档标题 */
  documentTitle?: string;
  /** 分块索引（文档记忆专用） */
  chunkIndex?: number;
  /** 分块起始位置（文档记忆专用） */
  chunkStart?: number;
  /** 分块结束位置（文档记忆专用） */
  chunkEnd?: number;
  /** 相似度分数 */
  score?: number;
  
  // === 溯源引用字段 (RAG 级别溯源) ===
  /** 页码（PDF/文档来源） */
  pageNumber?: number;
  /** 章节名称 */
  section?: string;
  /** 置信度 (0-1) */
  confidence?: number;
  /** 字符范围 [start, end] */
  charRange?: [number, number];
}

/** 记忆条目 */
export interface MemoryEntry {
  /** 唯一标识 */
  id: string;
  /** 会话标识 */
  sessionId: string;
  /** 条目类型 */
  type: MemoryEntryType;
  /** 内容文本 */
  content: string;
  /** 向量嵌入 */
  vector?: number[];
  /** 元数据 */
  metadata: MemoryMetadata;
  /** 创建时间 */
  createdAt: Date;
  /** 更新时间 */
  updatedAt: Date;
}

/** 摘要结构 */
export interface Summary {
  /** 唯一标识 */
  id: string;
  /** 主题 */
  topic: string;
  /** 关键点 */
  keyPoints: string[];
  /** 决策事项 */
  decisions: string[];
  /** 待办事项 */
  todos: Array<{ done: boolean; content: string }>;
  /** 提及实体 */
  entities: string[];
  /** 时间范围 */
  timeRange: { start: Date; end: Date };
  /** 原始消息数量 */
  originalMessageCount: number;
}

/** 记忆统计信息 */
export interface MemoryStats {
  /** 总条目数 */
  totalEntries: number;
  /** 总会话数 */
  totalSessions: number;
  /** 总存储大小（字节） */
  totalSize: number;
  /** 最早条目时间 */
  oldestEntry: Date | null;
  /** 最新条目时间 */
  newestEntry: Date | null;
}

// ============================================================================
// 引用溯源类型 (RAG 级别溯源)
// ============================================================================

/** 引用来源 */
export interface Citation {
  /** 引用 ID */
  id: string;
  /** 来源文档 ID */
  documentId: string;
  /** 来源文档路径 */
  documentPath: string;
  /** 文档标题 */
  documentTitle?: string;
  /** 引用内容片段 */
  snippet: string;
  /** 页码 */
  pageNumber?: number;
  /** 章节 */
  section?: string;
  /** 置信度 (0-1) */
  confidence: number;
  /** 字符范围 */
  charRange?: [number, number];
}

/** 带引用的响应 */
export interface CitedResponse {
  /** 响应内容 */
  content: string;
  /** 引用列表 */
  citations: Citation[];
}

/** 引用生成器配置 */
export interface CitationGeneratorConfig {
  /** 最小置信度阈值 */
  minConfidence: number;
  /** 最大引用数 */
  maxCitations: number;
  /** 片段最大长度 */
  maxSnippetLength: number;
  /** 引用格式 */
  format: 'numbered' | 'bracket' | 'footnote';
}

// ============================================================================
// 循环检测类型
// ============================================================================

/** 循环检测结果 */
export interface LoopDetectionResult {
  /** 是否检测到循环 */
  detected: boolean;
  /** 检测原因 */
  reason: string;
  /** 严重程度 */
  severity: 'warning' | 'critical';
}

/** 循环检测配置 */
export interface LoopDetectorConfig {
  /** 是否启用 */
  enabled: boolean;
  /** 警告阈值 */
  warningThreshold: number;
  /** 临界阈值 */
  criticalThreshold: number;
  /** 全局熔断阈值 */
  globalCircuitBreaker: number;
}

// ============================================================================
// 消息管理类型
// ============================================================================

/** 消息管理配置 */
export interface MessageManagerConfig {
  /** 最大消息数量 */
  maxMessages: number;
  /** 裁剪策略 */
  truncationStrategy: 'sliding' | 'summarize' | 'priority';
  /** 是否保留系统消息 */
  preserveSystemMessages: boolean;
  /** 保留最近消息数量 */
  preserveRecentCount: number;
}

// ============================================================================
// 检索类型
// ============================================================================

/** 记忆过滤器 */
export interface MemoryFilter {
  /** 会话标识 */
  sessionId?: string;
  /** 条目类型（支持单个或多个） */
  type?: MemoryEntryType | MemoryEntryType[];
  /** 标签 */
  tags?: string[];
  /** 日期范围 */
  dateRange?: { start: Date; end: Date };
}

/** 检索选项 */
export interface SearchOptions {
  /** 结果数量限制 */
  limit?: number;
  /** 过滤条件 */
  filter?: MemoryFilter;
  /** 检索模式 */
  mode?: 'auto' | 'vector' | 'fulltext' | 'hybrid';
  /** 指定使用的嵌入模型 ID（格式：<provider>/<model>） */
  model?: string;
}

// ============================================================================
// Agent 执行器类型
// ============================================================================

/** Agent 执行器配置 */
export interface AgentLoopConfig {
  /** 最大迭代次数 */
  maxIterations: number;
  /** 循环检测配置 */
  loopDetection: LoopDetectorConfig;
  /** 消息管理配置 */
  messageManager: MessageManagerConfig;
}

/** Agent 执行结果 */
export interface AgentLoopResult {
  /** 响应内容 */
  content: string;
  /** 实际迭代次数 */
  iterations: number;
  /** 是否被循环检测终止 */
  loopDetected: boolean;
  /** 循环检测原因 */
  loopReason?: string;
}

// ============================================================================
// 事件类型
// ============================================================================

/** Agent 事件 */
export type AgentEvent =
  | { type: 'loop:warning'; result: LoopDetectionResult }
  | { type: 'loop:critical'; result: LoopDetectionResult }
  | { type: 'memory:stored'; entry: MemoryEntry }
  | { type: 'memory:summarized'; summary: Summary }
  | { type: 'agent:iteration'; iteration: number }
  | { type: 'agent:complete'; content: string; iterations: number };