import type { SkillMeta } from "../types.js";

/**
 * Skill 配置
 * 定义 Skill 的运行时配置
 */
export interface SkillConfig {
  /** Skill 名称 */
  name: string;
  /** Skill 文件路径 */
  path: string;
  /** 是否启用 */
  enabled: boolean;
  /** 优先级（数值越大优先级越高） */
  priority: number;
}

/**
 * Skill 内容
 * 表示已加载的 Skill 内容
 */
export interface SkillContent {
  /** Skill 元数据 */
  meta: SkillMeta;
  /** Skill 文本内容 */
  content: string;
  /** 加载时间戳 */
  loadedAt: number;
}

/**
 * Skill 摘要
 * 用于构建提示词的精简信息
 */
export interface SkillSummary {
  /** Skill 名称 */
  name: string;
  /** Skill 描述 */
  description: string;
  /** 标签列表 */
  tags?: string[];
}
