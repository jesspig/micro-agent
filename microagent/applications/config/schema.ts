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

const MODULE_NAME = "ConfigSchema";
import { configLogger, createTimer, sanitize, logMethodCall, logMethodReturn, logMethodError } from "../shared/logger.js";

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
  /** 是否使用沙箱环境（默认 true） */
  sandbox: z.boolean().default(true),
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
// Sessions Schema
// ============================================================================

/**
 * 压缩策略枚举
 */
export const CompressionStrategySchema = z.enum(["sliding-window", "summarization", "hybrid"]);

/**
 * 摘要 Token 数配置
 * - 纯数字：表示绝对 token 数，如 1000
 * - 数字+百分号：表示占 contextWindowTokens 的比例，如 "10%"
 * - 不设置：默认 "5%"
 */
export const SummaryMaxTokensSchema = z.union([
  z.number().int().positive(),
  z.string().regex(/^\d+(\.\d+)?%$/, "百分比格式应为数字+%，如 10%"),
]);

/**
 * 压缩配置 Schema
 *
 * 定义上下文压缩策略参数
 */
export const CompressionConfigSchema = z.strictObject({
  /** 压缩策略：sliding-window（滑动窗口）| summarization（摘要）| hybrid（混合），默认 hybrid */
  strategy: CompressionStrategySchema.default("hybrid"),

  /** 保留最近消息数（hybrid/summarization 策略），默认 10 */
  keepRecentMessages: z.number().int().min(1).max(50).default(10),

  /** 摘要最大 token 数：纯数字（绝对值）或 "10%"（比例），默认 "5%" */
  summaryMaxTokens: SummaryMaxTokensSchema.optional(),

  /** 是否启用摘要压缩，默认 true */
  enabled: z.boolean().default(true),
});

/**
 * 历史记录整理配置 Schema
 *
 * 定义对话历史记录的自动整理参数
 */
export const HistoryConfigSchema = z.strictObject({
  /** 是否启用历史记录整理，默认 true */
  enabled: z.boolean().default(true),

  /** 触发整理的阈值（0-1，相对于 contextWindow），默认 0.7 */
  threshold: z.number().min(0).max(1).default(0.7),

  /** 整理时保留最近消息数，默认 10 */
  keepRecentMessages: z.number().int().min(1).max(50).default(10),

  /** 整理后上下文目标比例（0-1），默认 0.5 */
  targetRatio: z.number().min(0.1).max(0.8).default(0.5),
});

/**
 * Sessions 配置 Schema
 *
 * 定义会话持久化和上下文管理参数
 */
export const SessionsConfigSchema = z.strictObject({
  /** 上下文窗口大小（tokens），默认 65535 */
  contextWindowTokens: z.number().int().positive().default(65535),

  /** 压缩阈值（0-1），当上下文达到窗口的此比例时触发压缩，默认 0.7 */
  compressionTokenThreshold: z.number().min(0).max(1).default(0.7),

  /** 压缩配置 */
  compression: CompressionConfigSchema.optional(),

  /** 历史记录整理配置 */
  history: HistoryConfigSchema.optional(),

  /** 是否启用持久化，默认 true */
  persist: z.boolean().default(true),
});

/**
 * 压缩策略类型
 */
export type CompressionStrategy = z.infer<typeof CompressionStrategySchema>;

/**
 * 摘要 Token 数类型
 */
export type SummaryMaxTokens = z.infer<typeof SummaryMaxTokensSchema>;

/**
 * 压缩配置类型
 */
export type CompressionConfig = z.infer<typeof CompressionConfigSchema>;

/**
 * 历史记录整理配置类型
 */
export type HistoryConfig = z.infer<typeof HistoryConfigSchema>;

/**
 * Sessions 配置类型
 */
export type SessionsConfig = z.infer<typeof SessionsConfigSchema>;

// ============================================================================
// Logs Schema
// ============================================================================

/**
 * 日志级别 Schema
 */
export const LogLevelSchema = z.enum(["debug", "info", "warning", "error"]);

/**
 * 日志颗粒度 Schema
 * 
 * 格式：数值 + 单位（D=天, H=小时, M=分钟）
 * 单位决定文件名精度，数值决定时间间隔
 * 范围：最小 30 分钟（30M），最大 7 天（7D）
 * 示例：
 *   7D     - 每 7 天一个文件，文件名 YYYY-MM-DD.jsonl
 *   168H   - 每 168 小时（7天）一个文件，文件名 YYYY-MM-DD-HH.jsonl
 *   10080M - 每 10080 分钟（7天）一个文件，文件名 YYYY-MM-DD-HH-MM.jsonl
 */
export const LogGranularitySchema = z.string()
  .regex(/^(\d+)([DHM])$/, "日志颗粒度格式错误，正确格式如：1D, 6H, 30M")
  .transform((val) => {
    const match = val.match(/^(\d+)([DHM])$/);
    if (!match) return val;
    
    const num = parseInt(match[1]!, 10);
    const unit = match[2] as "D" | "H" | "M";
    
    // 转换为分钟
    let minutes: number;
    switch (unit) {
      case "D":
        minutes = num * 24 * 60;
        break;
      case "H":
        minutes = num * 60;
        break;
      case "M":
        minutes = num;
        break;
      default:
        minutes = 60;
    }
    
    // 范围校验并 clamp：最小 30 分钟，最大 7 天
    const MIN_MINUTES = 30;
    const MAX_MINUTES = 7 * 24 * 60;
    const clampedMinutes = Math.max(MIN_MINUTES, Math.min(MAX_MINUTES, minutes));
    
    // 保持原单位返回 clamped 值
    switch (unit) {
      case "D":
        return `${Math.round(clampedMinutes / (24 * 60))}D`;
      case "H":
        return `${Math.round(clampedMinutes / 60)}H`;
      case "M":
        return `${clampedMinutes}M`;
      default:
        return val;
    }
  });

/**
 * 日志配置 Schema
 */
export const LogsConfigSchema = z.strictObject({
  /** 是否开启敏感信息脱敏，默认 true */
  sanitize: z.boolean().default(true),

  /** 单个日志文件最大大小（MB），默认 10，范围 1-200 */
  maxFileSize: z.number()
    .int()
    .min(1)
    .max(200)
    .default(10)
    .transform((val) => Math.max(1, Math.min(200, val))),

  /** 控制台日志级别，默认 info，文件日志始终记录所有级别 */
  level: LogLevelSchema.default("info"),

  /** 日志文件颗粒度，默认 1H，格式如 1D/6H/30M，单位决定文件名精度，范围 30M~7D */
  granularity: LogGranularitySchema.default("1H"),
});

/**
 * 日志配置类型
 */
export type LogsConfig = z.infer<typeof LogsConfigSchema>;

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

  /** 会话配置 */
  sessions: SessionsConfigSchema.optional(),

  /** 日志配置 */
  logs: LogsConfigSchema.optional(),
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
  const timer = createTimer();
  const logger = configLogger();
  
  logMethodCall(logger, { method: "validateAgentsConfig", module: MODULE_NAME, params: {} });
  
  try {
    const result = AgentsConfigSchema.parse(data);
    logMethodReturn(logger, { method: "validateAgentsConfig", module: MODULE_NAME, result: sanitize(result), duration: timer() });
    return result;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logMethodError(logger, { 
      method: "validateAgentsConfig", 
      module: MODULE_NAME, 
      error: { name: err.name, message: err.message, ...(err.stack ? { stack: err.stack } : {}) },
      duration: timer() 
    });
    throw error;
  }
}

/**
 * 验证 Provider 配置
 *
 * @param data 待验证的数据
 * @returns 验证结果
 */
export function validateProvidersConfig(data: unknown): ProvidersConfig {
  const timer = createTimer();
  const logger = configLogger();
  
  logMethodCall(logger, { method: "validateProvidersConfig", module: MODULE_NAME, params: {} });
  
  try {
    const result = ProvidersConfigSchema.parse(data);
    logMethodReturn(logger, { method: "validateProvidersConfig", module: MODULE_NAME, result: sanitize(result), duration: timer() });
    return result;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logMethodError(logger, { 
      method: "validateProvidersConfig", 
      module: MODULE_NAME, 
      error: { name: err.name, message: err.message, ...(err.stack ? { stack: err.stack } : {}) },
      duration: timer() 
    });
    throw error;
  }
}

/**
 * 验证 Tool 配置
 *
 * @param data 待验证的数据
 * @returns 验证结果
 */
export function validateToolsConfig(data: unknown): ToolsConfig {
  const timer = createTimer();
  const logger = configLogger();
  
  logMethodCall(logger, { method: "validateToolsConfig", module: MODULE_NAME, params: {} });
  
  try {
    const result = ToolsConfigSchema.parse(data);
    logMethodReturn(logger, { method: "validateToolsConfig", module: MODULE_NAME, result: sanitize(result), duration: timer() });
    return result;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logMethodError(logger, { 
      method: "validateToolsConfig", 
      module: MODULE_NAME, 
      error: { name: err.name, message: err.message, ...(err.stack ? { stack: err.stack } : {}) },
      duration: timer() 
    });
    throw error;
  }
}

/**
 * 验证 Channel 配置
 *
 * @param data 待验证的数据
 * @returns 验证结果
 */
export function validateChannelsConfig(data: unknown): ChannelsConfig {
  const timer = createTimer();
  const logger = configLogger();
  
  logMethodCall(logger, { method: "validateChannelsConfig", module: MODULE_NAME, params: {} });
  
  try {
    const result = ChannelsConfigSchema.parse(data);
    logMethodReturn(logger, { method: "validateChannelsConfig", module: MODULE_NAME, result: sanitize(result), duration: timer() });
    return result;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logMethodError(logger, { 
      method: "validateChannelsConfig", 
      module: MODULE_NAME, 
      error: { name: err.name, message: err.message, ...(err.stack ? { stack: err.stack } : {}) },
      duration: timer() 
    });
    throw error;
  }
}

/**
 * 验证 Settings 配置
 *
 * @param data 待验证的数据
 * @returns 验证结果
 */
export function validateSettings(data: unknown): Settings {
  const timer = createTimer();
  const logger = configLogger();
  
  logMethodCall(logger, { method: "validateSettings", module: MODULE_NAME, params: {} });
  
  try {
    const result = SettingsSchema.parse(data);
    logMethodReturn(logger, { method: "validateSettings", module: MODULE_NAME, result: sanitize(result), duration: timer() });
    return result;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logMethodError(logger, { 
      method: "validateSettings", 
      module: MODULE_NAME, 
      error: { name: err.name, message: err.message, ...(err.stack ? { stack: err.stack } : {}) },
      duration: timer() 
    });
    throw error;
  }
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
  const timer = createTimer();
  const logger = configLogger();
  
  logMethodCall(logger, { method: "safeValidateSettings", module: MODULE_NAME, params: {} });
  
  const result = SettingsSchema.safeParse(data);
  
  if (result.success) {
    logger.debug("配置验证成功", { duration: timer() });
    logMethodReturn(logger, { method: "safeValidateSettings", module: MODULE_NAME, result: sanitize(result.data), duration: timer() });
  } else {
    const issues = result.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ");
    logger.warn("配置验证失败", { issues, duration: timer() });
    logMethodReturn(logger, { method: "safeValidateSettings", module: MODULE_NAME, result: { success: false, issueCount: result.error.issues.length }, duration: timer() });
  }
  
  return result;
}