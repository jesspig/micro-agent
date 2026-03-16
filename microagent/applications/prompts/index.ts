/**
 * 提示词模块导出
 *
 * 导出所有提示词构建函数和模板
 */

// ============================================================================
// 系统提示词
// ============================================================================

export {
  buildSystemPrompt,
  buildSimpleSystemPrompt,
  buildRuntimeContext,
  removeYamlFrontmatter,
  getCurrentDateString,
  estimateTokenCount,
  type SystemPromptParams,
  type BuiltSystemPrompt,
  type RuntimeContext,
} from "./system-prompt.js";

// ============================================================================
// 记忆提示词
// ============================================================================

export {
  // 提示词模板
  MEMORY_EXTRACTION_SYSTEM_PROMPT,
  MEMORY_UPDATE_SYSTEM_PROMPT,
  MEMORY_SEARCH_SYSTEM_PROMPT,
  // 构建函数
  buildMemoryExtractionPrompt,
  buildMemoryUpdatePrompt,
  buildMemorySearchPrompt,
  formatConversationHistory,
  // 类型
  type MemoryExtractionParams,
  type MemoryUpdateParams,
  type MemorySearchParams,
} from "./memory-prompt.js";

// ============================================================================
// 心跳提示词
// ============================================================================

export {
  // 提示词模板
  HEARTBEAT_SYSTEM_PROMPT,
  // 构建函数
  buildHeartbeatDecisionPrompt,
  buildHeartbeatResultPrompt,
  buildSimpleHeartbeatPrompt,
  parseHeartbeatDecision,
  // 类型
  type HeartbeatDecisionParams,
  type HeartbeatDecisionResult,
} from "./heartbeat-prompt.js";

// ============================================================================
// 错误消息
// ============================================================================

export {
  // 错误消息模板
  ConfigErrors,
  ProviderErrors,
  ToolErrors,
  SkillErrors,
  ChannelErrors,
  SessionErrors,
  FileSystemErrors,
  AgentErrors,
  // 辅助函数
  formatErrorMessage,
  createError,
} from "./error-messages.js";
