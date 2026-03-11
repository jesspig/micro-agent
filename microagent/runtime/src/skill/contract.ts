import type { ISkill, ISkillLoader } from "../contracts.js";
import type { SkillConfig, SkillSummary } from "./types.js";

/**
 * 扩展的 Skill 接口
 * 继承基础 ISkill，增加配置管理和状态控制
 */
export interface ISkillExtended extends ISkill {
  /** Skill 配置 */
  readonly config: SkillConfig;
  /** 是否已加载 */
  readonly loaded: boolean;
  /**
   * 重新加载 Skill 内容
   * @returns 重新加载后的内容
   */
  reload(): Promise<string>;
  /**
   * 获取 Skill 摘要
   * @returns Skill 摘要信息
   */
  getSummary(): SkillSummary;
}

/**
 * 扩展的 Skill 加载器接口
 * 继承基础 ISkillLoader，增加技能管理能力
 */
export interface ISkillLoaderExtended extends ISkillLoader {
  /**
   * 获取指定名称的 Skill
   * @param name - Skill 名称
   * @returns Skill 实例，若不存在则返回 undefined
   */
  getSkill(name: string): ISkillExtended | undefined;
  /**
   * 构建所有 Skill 的摘要文本
   * 用于生成提示词
   * @returns 格式化的 Skill 摘要
   */
  buildSkillsSummary(): Promise<string>;
}
