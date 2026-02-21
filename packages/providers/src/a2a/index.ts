/**
 * A2A 模块入口
 */

export {
  // 类型
  type AgentCapabilities,
  type AgentSkill,
  type AgentAuthentication,
  type AgentEndpoint,
  type AgentCard,
  type ParsedAgentCard,
  // 函数
  parseAgentCard,
  createAgentCard,
} from './agent-card'

export {
  // 类型
  type A2ARole,
  type A2AMessage,
  type A2APart,
  type A2ATaskStatus,
  type A2ATask,
  type A2AArtifact,
  type A2AClientConfig,
  // 类
  A2AClient,
  // 函数
  createA2AClient,
} from './a2a-client'
