/**
 * 配置 Schema 定义
 *
 * 使用 Zod 定义配置验证规则，支持：
 * - Agents 配置验证
 * - Provider 配置验证
 * - Tool 配置验证
 * - Channel 配置验证
 * - Settings 主配置验证
 */

import { z } from "zod";

// ============================================================================
// Agent Config Schema
// ============================================================================

/**
 * Agent 默认配置 Schema
 *
 * 定义 Agent 的默认行为参数
 */
export const AgentDefaultsConfigSchema = z.strictObject({
  /** Agent 工作目录，所有文件操作都在此目录下进行 */
  workspace: z.string().min(1, "工作目录不能为空"),

  /** 默认使用的模型，格式为 <provider>/<model> */
  model: z.string().optional(),

  /** 模型单次回复的最大 token 数 */
  maxTokens: z.number().int().positive().default(8192),

  /** 模型温度参数，控制输出随机性 (0-1) */
  temperature: z.number().min(0).max(1).default(0.7),

  /** 工具调用最大迭代次数，防止无限循环 */
  maxToolIterations: z.number().int().positive().default(40),

  /** 心跳间隔时间（分钟），用于定时任务检查 */
  heartbeatInterval: z.number().int().positive().default(30),
});

/**
 * Agent 配置 Schema
 */
export const AgentsConfigSchema = z.strictObject({
  defaults: AgentDefaultsConfigSchema,
});

/**
 * Agent 配置类型
 */
export type AgentsConfig = z.infer<typeof AgentsConfigSchema>;

/**
 * Agent 默认配置类型
 */
export type AgentDefaultsConfig = z.infer<typeof AgentDefaultsConfigSchema>;

// ============================================================================
// Provider Schema
// ============================================================================

/**
 * Provider 类型枚举
 */
export const ProviderTypeSchema = z.enum(["openai", "openai-response", "anthropic", "ollama"]);

/**
 * 单个 Provider 配置 Schema
 *
 * 定义单个 LLM Provider 的配置参数
 * 注意：disabled 的 provider 不校验必填字段
 */
export const SingleProviderConfigSchema = z.object({
  /** Provider 类型 */
  type: ProviderTypeSchema,

  /** 是否启用此 Provider */
  enabled: z.boolean().default(false),

  /** Provider 显示名称（可选） */
  displayName: z.string().optional(),

  /** API 基础 URL */
  baseUrl: z.string().optional(),

  /** API 密钥，支持环境变量引用 ${VAR_NAME} */
  apiKey: z.string().optional(),

  /** 支持的模型列表 */
  models: z.array(z.string()).optional(),
}).superRefine((data, ctx) => {
  // 只对 enabled: true 的 provider 进行必填校验
  if (data.enabled) {
    if (!data.baseUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "baseUrl 是必填项",
        path: ["baseUrl"],
      });
    } else {
      // 验证 baseUrl 格式
      try {
        new URL(data.baseUrl);
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "baseUrl 必须是有效的 URL",
          path: ["baseUrl"],
        });
      }
    }
    if (!data.models || data.models.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "models 不能为空",
        path: ["models"],
      });
    }
  }
});

/**
 * Providers 配置 Schema
 *
 * 支持任意 OpenAI 兼容的 Provider
 * 使用 record 类型，key 为 Provider 名称
 */
export const ProvidersConfigSchema = z.record(z.string(), SingleProviderConfigSchema);

/**
 * Providers 配置类型
 */
export type ProvidersConfig = z.infer<typeof ProvidersConfigSchema>;

/**
 * 单个 Provider 配置类型
 */
export type SingleProviderConfig = z.infer<typeof SingleProviderConfigSchema>;

// ============================================================================
// Tool Schema
// ============================================================================

/**
 * Shell 工具配置 Schema
 */
export const ShellToolConfigSchema = z.strictObject({
  /** 允许执行的命令白名单（留空表示全部禁止） */
  allowedCommands: z.array(z.string()).default([]),

  /** 禁止执行的命令黑名单（优先级高于白名单） */
  blockedCommands: z.array(z.string()).default([]),
});

/**
 * 工具特定配置 Schema
 */
export const ToolsSpecificConfigSchema = z.strictObject({
  shell: ShellToolConfigSchema.optional(),
});

/**
 * Tools 配置 Schema
 *
 * 定义工具的启用状态和特定配置
 */
export const ToolsConfigSchema = z.strictObject({
  /** 启用的工具列表（留空表示全部启用） */
  enabled: z.array(z.string()).default([]),

  /** 禁用的工具列表 */
  disabled: z.array(z.string()).default([]),

  /** 工具特定配置 */
  config: ToolsSpecificConfigSchema.optional(),
});

/**
 * Tools 配置类型
 */
export type ToolsConfig = z.infer<typeof ToolsConfigSchema>;

/**
 * Shell 工具配置类型
 */
export type ShellToolConfig = z.infer<typeof ShellToolConfigSchema>;

/**
 * 工具特定配置类型
 */
export type ToolsSpecificConfig = z.infer<typeof ToolsSpecificConfigSchema>;

// ============================================================================
// Channel Schema
// ============================================================================

/**
 * 飞书机器人配置 Schema
 */
export const FeishuChannelConfigSchema = z.strictObject({
  enabled: z.boolean().default(false),
  appId: z.string().default(""),
  appSecret: z.string().default(""),
  /** 允许发送消息的用户列表（["*"] 表示全部允许） */
  allowFrom: z.array(z.string()).optional(),
});

/**
 * 钉钉机器人配置 Schema
 */
export const DingtalkChannelConfigSchema = z.strictObject({
  enabled: z.boolean().default(false),
  clientId: z.string().default(""),
  clientSecret: z.string().default(""),
  /** 允许发送消息的用户列表（["*"] 表示全部允许） */
  allowFrom: z.array(z.string()).optional(),
});

/**
 * QQ 频道机器人配置 Schema
 * 使用 QQ 开放平台 API v2，AccessToken 鉴权
 */
export const QQChannelConfigSchema = z.strictObject({
  enabled: z.boolean().default(false),
  /** 机器人 AppID */
  appId: z.string().default(""),
  /** 机器人 ClientSecret（用于获取 AccessToken） */
  clientSecret: z.string().default(""),
  /** @deprecated 已弃用，请使用 clientSecret */
  token: z.string().optional(),
  /** 沙箱模式 */
  sandbox: z.boolean().default(false),
  /** 允许发送消息的频道列表（["*"] 表示全部允许） */
  allowChannels: z.array(z.string()).optional(),
  /** 允许发送消息的用户列表（["*"] 表示全部允许） */
  allowFrom: z.array(z.string()).optional(),
});

/**
 * 企业微信机器人配置 Schema
 */
export const WechatWorkChannelConfigSchema = z.strictObject({
  enabled: z.boolean().default(false),
  /** 智能机器人 ID */
  botId: z.string().default(""),
  /** 机器人密钥 */
  secret: z.string().default(""),
  /** 群机器人 Webhook Key */
  webhookKey: z.string().default(""),
  /** 企业 ID */
  corpId: z.string().default(""),
  /** 应用 ID */
  agentId: z.string().default(""),
  /** 允许发送消息的用户列表（["*"] 表示全部允许） */
  allowFrom: z.array(z.string()).optional(),
});

/**
 * Channels 配置 Schema
 *
 * 定义所有消息通道的配置
 */
export const ChannelsConfigSchema = z.strictObject({
  /** 飞书机器人配置 */
  feishu: FeishuChannelConfigSchema.optional(),

  /** 钉钉机器人配置 */
  dingtalk: DingtalkChannelConfigSchema.optional(),

  /** QQ 机器人配置 */
  qq: QQChannelConfigSchema.optional(),

  /** 企业微信机器人配置 */
  wechatWork: WechatWorkChannelConfigSchema.optional(),
});

/**
 * Channels 配置类型
 */
export type ChannelsConfig = z.infer<typeof ChannelsConfigSchema>;

/**
 * 飞书机器人配置类型
 */
export type FeishuChannelConfig = z.infer<typeof FeishuChannelConfigSchema>;

/**
 * 钉钉机器人配置类型
 */
export type DingtalkChannelConfig = z.infer<typeof DingtalkChannelConfigSchema>;

/**
 * QQ 机器人配置类型
 */
export type QQChannelConfig = z.infer<typeof QQChannelConfigSchema>;

/**
 * 企业微信机器人配置类型
 */
export type WechatWorkChannelConfig = z.infer<
  typeof WechatWorkChannelConfigSchema
>;

// ============================================================================
// Settings Schema
// ============================================================================

/**
 * Settings 配置 Schema
 *
 * 主配置文件 settings.yaml 的结构定义
 */
export const SettingsSchema = z.strictObject({
  /** Agent 配置 */
  agents: AgentsConfigSchema,

  /** 工具配置 */
  tools: ToolsConfigSchema.optional(),

  /** 消息通道配置 */
  channels: ChannelsConfigSchema.optional(),

  /** 模型提供商配置 */
  providers: ProvidersConfigSchema.optional(),
});

/**
 * Settings 配置类型
 */
export type Settings = z.infer<typeof SettingsSchema>;

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 验证 Agent 配置
 *
 * @param data 待验证的数据
 * @returns 验证结果
 */
export function validateAgentsConfig(data: unknown): AgentsConfig {
  return AgentsConfigSchema.parse(data);
}

/**
 * 验证 Provider 配置
 *
 * @param data 待验证的数据
 * @returns 验证结果
 */
export function validateProvidersConfig(data: unknown): ProvidersConfig {
  return ProvidersConfigSchema.parse(data);
}

/**
 * 验证 Tool 配置
 *
 * @param data 待验证的数据
 * @returns 验证结果
 */
export function validateToolsConfig(data: unknown): ToolsConfig {
  return ToolsConfigSchema.parse(data);
}

/**
 * 验证 Channel 配置
 *
 * @param data 待验证的数据
 * @returns 验证结果
 */
export function validateChannelsConfig(data: unknown): ChannelsConfig {
  return ChannelsConfigSchema.parse(data);
}

/**
 * 验证 Settings 配置
 *
 * @param data 待验证的数据
 * @returns 验证结果
 */
export function validateSettings(data: unknown): Settings {
  return SettingsSchema.parse(data);
}

/**
 * 安全验证 Settings（不抛出异常）
 *
 * @param data 待验证的数据
 * @returns 验证结果对象
 */
export function safeValidateSettings(
  data: unknown,
): z.SafeParseReturnType<unknown, Settings> {
  return SettingsSchema.safeParse(data);
}