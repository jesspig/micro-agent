/**
 * 配置 Schema 定义
 */

import { z } from 'zod';

/** 模型配置 Schema */
export const ModelsConfigSchema = z.object({
  /** 对话模型 */
  chat: z.string().optional(),
  /** 工具调用模型（可选，默认使用 chat） */
  tool: z.string().optional(),
  /** 嵌入模型（可选，用于向量检索） */
  embed: z.string().optional(),
  /** 视觉模型，用于图片识别任务 */
  vision: z.string().optional(),
  /** 编程模型，用于代码编写任务 */
  coder: z.string().optional(),
  /** 意图识别模型（可选，默认使用 chat，不会被路由） */
  intent: z.string().optional(),
});

/** 记忆配置 Schema */
export const MemoryConfigSchema = z.object({
  /** 是否启用记忆系统 */
  enabled: z.boolean().default(true),
  /** 记忆存储路径 */
  storagePath: z.string().default('~/.micro-agent/memory'),
  /** 是否启用自动摘要 */
  autoSummarize: z.boolean().default(true),
  /** 触发摘要的消息阈值 */
  summarizeThreshold: z.number().default(20),
  /** 空闲超时时间（毫秒） */
  idleTimeout: z.number().default(300000),
  /** 短期记忆保留天数 */
  shortTermRetentionDays: z.number().default(7),
  /** 检索结果数量限制 */
  searchLimit: z.number().min(1).max(50).default(10),
  /** 多嵌入模型配置 */
  multiEmbed: z.object({
    /** 是否启用多嵌入模型支持 */
    enabled: z.boolean().default(true),
    /** 最大保留模型数 (1-10) */
    maxModels: z.number().min(1).max(10).default(3),
    /** 是否自动迁移 */
    autoMigrate: z.boolean().default(true),
    /** 迁移批次大小 */
    batchSize: z.number().min(1).max(100).default(50),
    /** 迁移间隔（毫秒，0 表示自适应） */
    migrateInterval: z.number().min(0).default(0),
  }).optional(),
});

/** 引用溯源配置 Schema */
export const CitationConfigSchema = z.object({
  /** 是否启用引用溯源 */
  enabled: z.boolean().default(true),
  /** 最小置信度阈值 (0-1) */
  minConfidence: z.number().min(0).max(1).default(0.5),
  /** 最大引用数 */
  maxCitations: z.number().min(1).max(10).default(5),
  /** 引用格式 */
  format: z.enum(['numbered', 'bracket', 'footnote']).default('numbered'),
  /** 片段最大长度 */
  maxSnippetLength: z.number().min(50).max(500).default(200),
});

/** 循环检测配置 Schema */
export const LoopDetectionConfigSchema = z.object({
  /** 是否启用循环检测 */
  enabled: z.boolean().default(true),
  /** 警告阈值 */
  warningThreshold: z.number().default(3),
  /** 临界阈值 */
  criticalThreshold: z.number().default(5),
});

/** 后台构建配置 Schema */
export const BackgroundBuildConfigSchema = z.object({
  /** 是否启用后台构建 */
  enabled: z.boolean().default(true),
  /** 构建间隔（毫秒） */
  interval: z.number().min(1000).default(60000),
  /** 每次处理的最大文档数 */
  batchSize: z.number().min(1).max(100).default(3),
  /** 空闲等待时间（毫秒） */
  idleDelay: z.number().min(0).default(5000),
});

/** 知识库配置 Schema */
export const KnowledgeBaseConfigSchema = z.object({
  /** 是否启用知识库 */
  enabled: z.boolean().default(true),
  /** 知识库基础路径 */
  basePath: z.string().default('~/.micro-agent/knowledge'),
  /** 文档分块大小 */
  chunkSize: z.number().min(100).max(8000).default(1000),
  /** 分块重叠大小 */
  chunkOverlap: z.number().min(0).max(1000).default(200),
  /** 最大搜索结果数 */
  maxSearchResults: z.number().min(1).max(50).default(5),
  /** 最小相似度阈值 */
  minSimilarityScore: z.number().min(0).max(1).default(0.5),
  /** 后台构建配置 */
  backgroundBuild: BackgroundBuildConfigSchema.default({
    enabled: true,
    interval: 60000,
    batchSize: 3,
    idleDelay: 5000,
  }),
  /** 嵌入模型 ID */
  embedModel: z.string().optional(),
});

/** 执行器配置 Schema */
export const ExecutorConfigSchema = z.object({
  /** 最大迭代次数 */
  maxIterations: z.number().default(20),
  /** 循环检测配置 */
  loopDetection: LoopDetectionConfigSchema.optional(),
});

/** 工作区配置 Schema */
export const WorkspaceConfigSchema = z.object({
  /** 工作区路径 */
  path: z.string(),
  /** 工作区名称（可选，用于显示） */
  name: z.string().optional(),
  /** 工作区描述（可选） */
  description: z.string().optional(),
});

/** 工作区配置类型 */
export type WorkspaceConfig = z.infer<typeof WorkspaceConfigSchema>;

/** Agent 配置 Schema */
export const AgentConfigSchema = z.object({
  /** 默认工作区路径 */
  workspace: z.string().default('~/.micro-agent/workspace'),
  /** 模型配置 */
  models: ModelsConfigSchema.optional(),
  /** 记忆系统配置 */
  memory: MemoryConfigSchema.optional(),
  /** 执行器配置 */
  executor: ExecutorConfigSchema.optional(),
  /** 引用溯源配置 */
  citation: CitationConfigSchema.optional(),
  /** 生成的最大 token 数量 (1-8192) */
  maxTokens: z.number().min(1).max(8192).default(512),
  /** 控制响应的随机性 (0-1.5)，值越低越确定，值越高越随机 */
  temperature: z.number().min(0).max(1.5).default(0.7),
  /** 限制 token 选择范围为前 k 个候选 */
  topK: z.number().default(50),
  /** 核采样参数，根据累积概率动态调整选择范围 */
  topP: z.number().default(0.7),
  /** 频率惩罚，控制生成内容的重复性 */
  frequencyPenalty: z.number().default(0.5),
});

/** 模型配置 Schema（仅包含 ID 和生成参数） */
export const ModelConfigSchema = z.object({
  /** 模型 ID */
  id: z.string(),
  /** 生成的最大 token 数量 (1-8192) */
  maxTokens: z.number().min(1).max(8192).optional(),
  /** 控制响应的随机性 (0-1.5) */
  temperature: z.number().min(0).max(1.5).optional(),
  /** 限制 token 选择范围为前 k 个候选 */
  topK: z.number().optional(),
  /** 核采样参数 */
  topP: z.number().optional(),
  /** 频率惩罚 */
  frequencyPenalty: z.number().optional(),
});

/** 模型配置类型 */
export type ModelConfig = z.infer<typeof ModelConfigSchema>;

/** Provider 模型列表项（只支持模型ID字符串） */
const ModelItemSchema = z.string();

/** Provider 配置 Schema（支持自定义提供商名称） */
const ProviderEntrySchema = z.object({
  baseUrl: z.string(),
  apiKey: z.string().optional(),
  /** 模型ID列表 */
  models: z.array(ModelItemSchema).optional(),
});

export const ProviderConfigSchema = z.record(z.string(), ProviderEntrySchema);

/** Provider 条目类型 */
export type ProviderEntry = z.infer<typeof ProviderEntrySchema>;

/** 飞书通道配置 */
const FeishuChannelSchema = z.object({
  enabled: z.boolean().default(false),
  appId: z.string().optional(),
  appSecret: z.string().optional(),
  allowFrom: z.array(z.string()).default([]),
});

/** 通道配置 Schema */
export const ChannelConfigSchema = z.object({
  feishu: FeishuChannelSchema.optional(),
});

/** 完整配置 Schema */
export const ConfigSchema = z.object({
  agents: AgentConfigSchema,
  /** 工作区列表（隔离环境，只能读写工作区内的文件） */
  workspaces: z.array(z.union([z.string(), WorkspaceConfigSchema])).default([]),
  providers: ProviderConfigSchema.default({}),
  channels: ChannelConfigSchema.nullish().transform(v => v ?? {}),
  /** 知识库配置 */
  knowledgeBase: KnowledgeBaseConfigSchema.optional(),
}).passthrough(); // 允许额外字段（如 $schema, _docs 等）

/** 配置类型 */
export type Config = z.infer<typeof ConfigSchema>;
export type AgentConfig = z.infer<typeof AgentConfigSchema>;
export type ModelsConfig = z.infer<typeof ModelsConfigSchema>;
export type MemoryConfig = z.infer<typeof MemoryConfigSchema>;
export type ExecutorConfig = z.infer<typeof ExecutorConfigSchema>;
export type LoopDetectionConfig = z.infer<typeof LoopDetectionConfigSchema>;
export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;
export type BackgroundBuildConfig = z.infer<typeof BackgroundBuildConfigSchema>;
export type KnowledgeBaseConfig = z.infer<typeof KnowledgeBaseConfigSchema>;
export type CitationConfig = z.infer<typeof CitationConfigSchema>;

/**
 * 解析模型ID列表为配置对象
 */
export function parseModelConfigs(models: string[]): ModelConfig[] {
  return models.map(id => ({ id }));
}

/**
 * 解析工作区列表为统一格式
 */
export function parseWorkspaces(workspaces: (string | WorkspaceConfig)[]): WorkspaceConfig[] {
  return workspaces.map(w => {
    if (typeof w === 'string') {
      return { path: w };
    }
    return {
      path: w.path,
      name: w.name,
      description: w.description,
    };
  });
}