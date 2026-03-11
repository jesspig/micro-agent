/**
 * Skill 模块
 * 
 * 提供 Skill 的类型定义、加载器和注册表实现
 */

// 类型导出
export type { SkillConfig, SkillContent, SkillSummary } from "./types.js";
export type { ISkillExtended, ISkillLoaderExtended } from "./contract.js";

// 实现导出
export { Skill, BaseSkillLoader } from "./loader.js";
export { SkillRegistry } from "./registry.js";
