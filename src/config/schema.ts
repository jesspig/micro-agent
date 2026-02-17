import { z } from 'zod';

/** Agent 配置 Schema */
export const AgentConfigSchema = z.object({
  workspace: z.string().default('~/.microbot/workspace'),
  model: z.string().default('ollama/qwen3'),
  maxTokens: z.number().default(8192),
  temperature: z.number().default(0.7),
  maxToolIterations: z.number().default(20),
});

/** Provider 配置 Schema（支持自定义提供商名称） */
const ProviderEntrySchema = z.object({
  baseUrl: z.string(),
  apiKey: z.string().optional(),
  models: z.array(z.string()).optional(),
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

/** QQ 通道配置 */
const QqChannelSchema = z.object({
  enabled: z.boolean().default(false),
  appId: z.string().optional(),
  secret: z.string().optional(),
});

/** 钉钉通道配置 */
const DingtalkChannelSchema = z.object({
  enabled: z.boolean().default(false),
  clientId: z.string().optional(),
  clientSecret: z.string().optional(),
});

/** 企业微信通道配置 */
const WecomChannelSchema = z.object({
  enabled: z.boolean().default(false),
  corpId: z.string().optional(),
  agentId: z.string().optional(),
  secret: z.string().optional(),
});

/** 通道配置 Schema */
export const ChannelConfigSchema = z.object({
  feishu: FeishuChannelSchema.optional(),
  qq: QqChannelSchema.optional(),
  dingtalk: DingtalkChannelSchema.optional(),
  wecom: WecomChannelSchema.optional(),
});

/** 完整配置 Schema */
export const ConfigSchema = z.object({
  agents: z.object({
    defaults: AgentConfigSchema,
  }),
  providers: ProviderConfigSchema,
  channels: ChannelConfigSchema,
});

/** 配置类型 */
export type Config = z.infer<typeof ConfigSchema>;
export type AgentConfig = z.infer<typeof AgentConfigSchema>;
export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;