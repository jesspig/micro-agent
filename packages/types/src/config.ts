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

/** 模型性能级别 */
export type ModelLevel = 'fast' | 'low' | 'medium' | 'high' | 'ultra';

/** 模型配置输入（允许部分字段） */
export interface ModelConfigInput {
  /** 模型 ID */
  id: string;
  /** 支持视觉能力 */
  vision?: boolean;
  /** 支持思考能力 */
  think?: boolean;
  /** 支持工具调用 */
  tool?: boolean;
  /** 性能级别 */
  level?: ModelLevel;
  /** 生成的最大 token 数量 */
  maxTokens?: number;
  /** 控制响应的随机性 */
  temperature?: number;
  /** 限制 token 选择范围 */
  topK?: number;
  /** 核采样参数 */
  topP?: number;
  /** 频率惩罚 */
  frequencyPenalty?: number;
  /** 最大工具调用迭代次数 */
  maxToolIterations?: number;
}

/** Provider 条目配置 */
export interface ProviderEntry {
  /** API 基础 URL */
  baseUrl: string;
  /** API 密钥 */
  apiKey?: string;
  /** 模型配置列表（字符串或完整配置对象） */
  models?: Array<string | ModelConfigInput>;
}

/** 路由规则 */
export interface RoutingRule {
  /** 匹配关键词列表 */
  keywords?: string[];
  /** 最小消息长度 */
  minLength?: number;
  /** 最大消息长度 */
  maxLength?: number;
  /** 目标性能级别 */
  level: ModelLevel;
  /** 规则优先级 */
  priority?: number;
}

/** 路由配置 */
export interface RoutingConfig {
  /** 启用路由规则 */
  enabled?: boolean;
  /** 路由规则列表 */
  rules?: RoutingRule[];
  /** 默认复杂度基础分数 */
  baseScore?: number;
  /** 长度权重 */
  lengthWeight?: number;
  /** 代码块额外分数 */
  codeBlockScore?: number;
  /** 工具调用额外分数 */
  toolCallScore?: number;
  /** 多轮对话额外分数 */
  multiTurnScore?: number;
}

/** 完整配置 */
export interface Config {
  /** Agent 配置 */
  agents: {
    workspace: string;
    models?: {
      chat?: string;
      check?: string;
    };
    maxTokens?: number;
    temperature?: number;
    topK?: number;
    topP?: number;
    frequencyPenalty?: number;
    maxToolIterations?: number;
    auto?: boolean;
    max?: boolean;
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
  /** 路由配置 */
  routing?: RoutingConfig;
}
