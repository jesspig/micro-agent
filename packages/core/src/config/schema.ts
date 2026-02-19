import { z } from 'zod';

/** 模型配置 Schema */
export const ModelsConfigSchema = z.object({
  /** 对话模型 */
  chat: z.string().optional(),
  /** 意图识别模型（可选，默认使用 chat） */
  check: z.string().optional(),
});

/** Agent 配置 Schema */
export const AgentConfigSchema = z.object({
  workspace: z.string().default('~/.microbot/workspace'),
  /** 模型配置 */
  models: ModelsConfigSchema.optional(),
  /** 生成的最大 token 数量 */
  maxTokens: z.number().default(8192),
  /** 控制响应的随机性，值越低越确定，值越高越随机 */
  temperature: z.number().default(0.7),
  /** 限制 token 选择范围为前 k 个候选 */
  topK: z.number().default(50),
  /** 核采样参数，根据累积概率动态调整选择范围 */
  topP: z.number().default(0.7),
  /** 频率惩罚，控制生成内容的重复性 */
  frequencyPenalty: z.number().default(0.5),
  /** 最大工具调用迭代次数 */
  maxToolIterations: z.number().default(20),
  /** 开启自动路由，根据任务难度自动选择模型 */
  auto: z.boolean().default(true),
  /** 性能优先模式，auto=true 时生效，选择最高性能模型 */
  max: z.boolean().default(false),
});

/** 模型性能级别（速度 -> 性能） */
export type ModelLevel = 'fast' | 'low' | 'medium' | 'high' | 'ultra';

/** 模型性能级别 Schema */
export const ModelLevelSchema = z.enum(['fast', 'low', 'medium', 'high', 'ultra']);

/** 模型能力配置 */
export const ModelConfigSchema = z.object({
  /** 模型 ID */
  id: z.string(),
  /** 支持视觉能力（图片输入） */
  vision: z.boolean().default(false),
  /** 支持思考能力（如 DeepSeek-R1 的 reasoning） */
  think: z.boolean().default(false),
  /** 支持工具调用 */
  tool: z.boolean().default(true),
  /** 性能级别：fast(最快) -> ultra(最强) */
  level: ModelLevelSchema.default('medium'),
  /** 生成的最大 token 数量 */
  maxTokens: z.number().optional(),
  /** 控制响应的随机性 */
  temperature: z.number().optional(),
  /** 限制 token 选择范围为前 k 个候选 */
  topK: z.number().optional(),
  /** 核采样参数 */
  topP: z.number().optional(),
  /** 频率惩罚 */
  frequencyPenalty: z.number().optional(),
  /** 最大工具调用迭代次数 */
  maxToolIterations: z.number().optional(),
});

/** 模型配置类型 */
export type ModelConfig = z.infer<typeof ModelConfigSchema>;

/** 路由规则配置 */
export const RoutingRuleSchema = z.object({
  /** 匹配关键词列表（任一匹配即生效） */
  keywords: z.array(z.string()).default([]),
  /** 最小消息长度（字符数） */
  minLength: z.number().optional(),
  /** 最大消息长度（字符数） */
  maxLength: z.number().optional(),
  /** 目标性能级别 */
  level: ModelLevelSchema,
  /** 规则优先级（越大越优先，默认 0） */
  priority: z.number().default(0),
});

/** 路由规则类型 */
export type RoutingRule = z.infer<typeof RoutingRuleSchema>;

/** 路由配置 */
export const RoutingConfigSchema = z.object({
  /** 启用路由规则 */
  enabled: z.boolean().default(true),
  /** 路由规则列表（按优先级排序执行） */
  rules: z.array(RoutingRuleSchema).default([]),
  /** 默认复杂度基础分数 */
  baseScore: z.number().default(30),
  /** 长度权重（每100字符增加的分数） */
  lengthWeight: z.number().default(5),
  /** 代码块额外分数 */
  codeBlockScore: z.number().default(10),
  /** 工具调用额外分数 */
  toolCallScore: z.number().default(15),
  /** 多轮对话额外分数（每条消息） */
  multiTurnScore: z.number().default(2),
});

/** 路由配置类型 */
export type RoutingConfig = z.infer<typeof RoutingConfigSchema>;

/** 默认路由规则 */
export const DEFAULT_ROUTING_RULES: RoutingRule[] = [
  // ultra 级别
  { keywords: ['架构', 'architecture', '重构', 'refactor', '设计模式', 'design pattern'], level: 'ultra', priority: 10 },
  { keywords: ['优化', 'optimize', '性能分析', 'performance'], minLength: 500, level: 'ultra', priority: 9 },
  
  // high 级别
  { keywords: ['实现', 'implement', '创建', 'create', '开发', 'develop'], level: 'high', priority: 8 },
  { keywords: ['分析', 'analyze', '解析', 'parse'], minLength: 300, level: 'high', priority: 7 },
  { keywords: ['调试', 'debug', '修复', 'fix', 'bug'], level: 'high', priority: 7 },
  
  // medium 级别（默认）
  { keywords: ['解释', 'explain', '说明', 'describe'], level: 'medium', priority: 5 },
  { keywords: ['修改', 'modify', '更新', 'update'], level: 'medium', priority: 5 },
  { keywords: ['比较', 'compare', '对比', 'contrast'], level: 'medium', priority: 5 },
  
  // low 级别
  { keywords: ['翻译', 'translate', '格式化', 'format'], level: 'low', priority: 3 },
  { keywords: ['总结', 'summarize', '摘要', 'summary'], maxLength: 1000, level: 'low', priority: 3 },
  
  // fast 级别
  { keywords: ['你好', 'hello', 'hi', '嗨', '哈喽'], level: 'fast', priority: 2 },
  { keywords: ['谢谢', 'thanks', 'thank you', '感谢'], level: 'fast', priority: 2 },
  { keywords: ['再见', 'bye', 'goodbye', '拜拜'], level: 'fast', priority: 2 },
];

/** 默认路由配置 */
export const DEFAULT_ROUTING_CONFIG: RoutingConfig = {
  enabled: true,
  rules: DEFAULT_ROUTING_RULES,
  baseScore: 30,
  lengthWeight: 5,
  codeBlockScore: 10,
  toolCallScore: 15,
  multiTurnScore: 2,
};

/** 模型列表项（支持简写字符串或完整配置对象） */
const ModelItemSchema = z.union([
  z.string(),
  ModelConfigSchema,
]);

/** Provider 配置 Schema（支持自定义提供商名称） */
const ProviderEntrySchema = z.object({
  baseUrl: z.string(),
  apiKey: z.string().optional(),
  /** 模型列表：支持简写字符串或完整配置对象 */
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
  providers: ProviderConfigSchema,
  channels: ChannelConfigSchema,
  routing: RoutingConfigSchema.optional(),
});

/** 配置类型 */
export type Config = z.infer<typeof ConfigSchema>;
export type AgentConfig = z.infer<typeof AgentConfigSchema>;
export type ModelsConfig = z.infer<typeof ModelsConfigSchema>;
export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;

/**
 * 解析模型列表为统一格式
 * 将字符串简写转换为 ModelConfig 对象，并应用默认值
 */
export function parseModelConfigs(models: (string | ModelConfig)[]): ModelConfig[] {
  return models.map(m => {
    if (typeof m === 'string') {
      // 简写形式，使用默认值
      return { id: m, vision: false, think: false, tool: true, level: 'medium' };
    }
    // 完整配置，补充缺失的默认值
    return {
      id: m.id,
      vision: m.vision ?? false,
      think: m.think ?? false,
      tool: m.tool ?? true,
      level: m.level ?? 'medium',
      maxTokens: m.maxTokens,
      temperature: m.temperature,
      topK: m.topK,
      topP: m.topP,
      frequencyPenalty: m.frequencyPenalty,
      maxToolIterations: m.maxToolIterations,
    };
  });
}

/**
 * 获取模型能力配置
 * @param models - 模型配置列表
 * @param modelId - 模型 ID
 * @returns 模型能力配置，未找到返回默认值
 */
export function getModelCapabilities(
  models: (string | ModelConfig)[],
  modelId: string
): ModelConfig {
  const configs = parseModelConfigs(models);
  const found = configs.find(m => m.id === modelId);
  return found ?? { id: modelId, vision: false, think: false, tool: true };
}
