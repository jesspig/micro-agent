/**
 * defineSkill - 技能定义快捷函数
 */

import type { Skill, SkillSummary } from '../skill/types';

/**
 * 技能定义选项
 */
export interface DefineSkillOptions {
  /** 技能名称 */
  name: string;
  /** 技能描述 */
  description: string;
  /** 依赖包列表 */
  dependencies?: string[];
  /** 许可证 */
  license?: string;
  /** 环境兼容性要求 */
  compatibility?: string;
  /** 是否自动加载完整内容 */
  always?: boolean;
  /** 元数据 */
  metadata?: Record<string, string>;
  /** 预批准工具列表 */
  allowedTools?: string[];
  /** 技能内容（Markdown） */
  content: string;
}

/**
 * 定义技能
 * 
 * 快捷函数，用于创建符合 Skill 接口的对象。
 * 
 * @example
 * ```typescript
 * import { defineSkill } from 'microbot';
 * 
 * export const mySkill = defineSkill({
 *   name: 'my-skill',
 *   description: '我的自定义技能',
 *   content: `
 * # My Skill
 * 
 * 这个技能可以做什么...
 *   `,
 * });
 * ```
 */
export function defineSkill(options: DefineSkillOptions): Skill {
  return {
    name: options.name,
    description: options.description,
    dependencies: options.dependencies,
    license: options.license,
    compatibility: options.compatibility,
    always: options.always ?? false,
    metadata: options.metadata ?? {},
    allowedTools: options.allowedTools,
    content: options.content.trim(),
    skillPath: '',
  };
}
