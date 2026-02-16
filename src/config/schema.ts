import { z } from 'zod';

/** Agent 配置 Schema */
export const AgentConfigSchema = z.object({
  workspace: z.string().default('~/.microbot/workspace'),
  model: z.string().default('qwen3'),
  maxTokens: z.number().default(8192),
  temperature: z.number().default(0.7),
  maxToolIterations: z.number().default(20),
});

/** Ollama Provider 配置 */
const OllamaProviderSchema = z.object({
  baseUrl: z.string().default('http://localhost:11434/v1'),
  models: z.array(z.string()).optional(),
});

/** LM Studio Provider 配置 */
const LmStudioProviderSchema = z.object({
  baseUrl: z.string().default('http://localhost:1234/v1'),
  models: z.array(z.string()).optional(),
});

/** vLLM Provider 配置 */
const VllmProviderSchema = z.object({
  baseUrl: z.string(),
  models: z.array(z.string()).optional(),
});

/** OpenAI Compatible Provider 配置 */
const OpenAICompatibleProviderSchema = z.object({
  baseUrl: z.string(),
  apiKey: z.string(),
  models: z.array(z.string()).optional(),
});

/** Provider 配置 Schema */
export const ProviderConfigSchema = z.object({
  ollama: OllamaProviderSchema.optional(),
  lmStudio: LmStudioProviderSchema.optional(),
  vllm: VllmProviderSchema.optional(),
  openaiCompatible: OpenAICompatibleProviderSchema.optional(),
});

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

/** 邮箱通道配置 */
const EmailChannelSchema = z.object({
  enabled: z.boolean().default(false),
  consentGranted: z.boolean().default(false),
  imapHost: z.string().optional(),
  imapPort: z.number().default(993),
  smtpHost: z.string().optional(),
  smtpPort: z.number().default(587),
  user: z.string().optional(),
  password: z.string().optional(),
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
  email: EmailChannelSchema.optional(),
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
