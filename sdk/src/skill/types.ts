/**
 * 技能类型定义
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

/** 技能依赖要求 */
export interface SkillRequires {
  /** 需要的二进制命令 */
  bins?: string[];
  /** 需要的环境变量 */
  env?: string[];
}

/** 技能元数据 */
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
  /** 是否自动加载完整内容 */
  always?: boolean;
  /** 结构化元数据 */
  metadata?: SkillMetadata | Record<string, string>;
  /** 预批准工具列表 */
  allowedTools?: string[];
  /** 技能内容（Markdown） */
  content: string;
  /** 技能目录路径 */
  skillPath: string;
}
