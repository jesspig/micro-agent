/**
 * SDK 核心技能模块
 * 
 * 提供技能接口定义和加载器。
 * 遵循 Agent Skills 规范 (https://agentskills.io)
 */

/** 技能名称验证正则：小写字母、数字、连字符 */
export const SKILL_NAME_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** 技能摘要（用于启动时注入上下文） */
export interface SkillSummary {
  /** 技能名称 */
  name: string;
  /** 技能描述 */
  description: string;
}

/** 技能完整定义 */
export interface Skill extends SkillSummary {
  /** 依赖包列表 (如: "bun>=1.0", "python>=3.8") */
  dependencies?: string[];
  /** 许可证 */
  license?: string;
  /** 环境兼容性要求 */
  compatibility?: string;
  /** 是否自动加载完整内容 */
  always?: boolean;
  /** 元数据 */
  metadata: Record<string, string>;
  /** 预批准工具列表 */
  allowedTools?: string[];
  /** 技能内容（Markdown） */
  content: string;
  /** 技能目录路径 */
  skillPath: string;
}

/** 解析后的 frontmatter 数据 */
export interface SkillFrontmatter {
  name?: string;
  description?: string;
  dependencies?: string[];
  license?: string;
  compatibility?: string;
  always?: boolean;
  metadata?: Record<string, string>;
  'allowed-tools'?: unknown;
}