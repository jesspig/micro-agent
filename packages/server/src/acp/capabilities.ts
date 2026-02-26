/**
 * ACP Capabilities
 *
 * 定义 ACP 服务器能力。
 */

/** ACP 服务器能力 */
export interface ACPCapabilities {
  /** 协议版本 */
  protocolVersion: string;
  /** 支持的功能 */
  features: {
    /** 权限请求 */
    permissions: boolean;
    /** 工具调用 */
    tools: boolean;
    /** 资源访问 */
    resources: boolean;
    /** 提示词模板 */
    prompts: boolean;
    /** 流式响应 */
    streaming: boolean;
    /** 会话管理 */
    sessions: {
      /** 创建会话 */
      create: boolean;
      /** 恢复会话 */
      resume: boolean;
      /** Fork 会话 */
      fork: boolean;
      /** 列出会话 */
      list: boolean;
    };
    /** 模式切换 */
    modes: boolean;
    /** 模型选择 */
    modelSelection: boolean;
  };
  /** 支持的认证方法 */
  authMethods: Array<{
    type: 'none' | 'token' | 'oauth';
    description?: string;
  }>;
}

/** 默认能力 */
export const DEFAULT_ACP_CAPABILITIES: ACPCapabilities = {
  protocolVersion: '0.1.0',
  features: {
    permissions: true,
    tools: true,
    resources: true,
    prompts: true,
    streaming: true,
    sessions: {
      create: true,
      resume: true,
      fork: true,
      list: true,
    },
    modes: true,
    modelSelection: true,
  },
  authMethods: [
    { type: 'none', description: '无需认证' },
    { type: 'token', description: 'Bearer Token 认证' },
  ],
};
