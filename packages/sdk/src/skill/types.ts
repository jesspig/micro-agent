/**
 * 技能类型定义
 */

/** 技能名称验证正则：小写字母、数字、连字符 */
export const SKILL_NAME_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** 技能摘要（用于启动时注入上下文，Level 1 渐进式加载） */
export interface SkillSummary {
  /** 技能名称 */
  name: string;
  /** 技能描述 */
  description: string;
}

/** 技能依赖要求 */
export interface SkillRequires {
  /** 需要的二进制命令 */
  bins?: string[];
  /** 需要的环境变量 */
  env?: string[];
}

/** 技能元数据（符合 Agent Skills 行业标准） */
export interface SkillMetadata {
  /** emoji 图标 */
  emoji?: string;
  /** 依赖要求 */
  requires?: SkillRequires;
  /** 安装说明 */
  install?: SkillInstallSpec[];
  /** 其他扩展字段 */
  [key: string]: unknown;
}

/** 技能安装规范 */
export interface SkillInstallSpec {
  /** 安装方式 ID */
  id: string;
  /** 安装类型：brew, apt, npm 等 */
  kind: string;
  /** 包名或公式名 */
  formula?: string;
  package?: string;
  /** 安装后提供的二进制命令 */
  bins?: string[];
  /** 显示标签 */
  label?: string;
}

/** 技能完整定义 */
export interface Skill extends SkillSummary {
  /** 依赖包列表 */
  dependencies?: string[];
  /** 许可证 */
  license?: string;
  /** 环境兼容性要求 */
  compatibility?: string;
  /** 是否自动加载完整内容（Level 2） */
  always?: boolean;
  /** 结构化元数据 */
  metadata: SkillMetadata;
  /** 预批准工具列表 */
  allowedTools?: string[];
  /** 技能内容（Markdown，Level 2 按需加载） */
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
  /** 元数据可以是字符串 JSON 或对象 */
  metadata?: string | Record<string, unknown>;
  'allowed-tools'?: unknown;
}

/** 技能加载限制配置 */
export interface SkillsLimits {
  /** 每个 skill 目录最大候选数 */
  maxCandidatesPerRoot?: number;
  /** 每个来源最大加载数 */
  maxSkillsLoadedPerSource?: number;
  /** prompt 中最大技能数 */
  maxSkillsInPrompt?: number;
  /** prompt 中技能摘要最大字符数 */
  maxSkillsPromptChars?: number;
  /** 单个 SKILL.md 文件最大字节数 */
  maxSkillFileBytes?: number;
}

/** 默认限制 */
export const DEFAULT_SKILLS_LIMITS: Required<SkillsLimits> = {
  maxCandidatesPerRoot: 300,
  maxSkillsLoadedPerSource: 200,
  maxSkillsInPrompt: 150,
  maxSkillsPromptChars: 30000,
  maxSkillFileBytes: 256000,
};
