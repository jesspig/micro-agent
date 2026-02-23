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

/** 完整配置 */
export interface Config {
  /** Agent 配置 */
  agents: {
    workspace: string;
    models?: {
      chat?: string;
      tool?: string;
      embed?: string;
      vision?: string;
      coder?: string;
      intent?: string;
    };
    memory?: {
      enabled?: boolean;
      storagePath?: string;
      autoSummarize?: boolean;
      summarizeThreshold?: number;
      idleTimeout?: number;
      shortTermRetentionDays?: number;
      searchLimit?: number;
    };
    maxTokens?: number;
    temperature?: number;
    topK?: number;
    topP?: number;
    frequencyPenalty?: number;
    maxToolIterations?: number;
  };
  /** Provider 配置 */
  providers: Record<string, ProviderEntry>;
  /** 通道配置 */
  channels: {
    feishu?: {
      enabled?: boolean;
      appId?: string;
      appSecret?: string;
      allowFrom?: string[];
    };
  };
}
