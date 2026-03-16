import type { SkillMeta } from "../types.js";
import type { ISkillExtended, ISkillLoaderExtended } from "./contract.js";
import type { SkillConfig, SkillContent, SkillSummary } from "./types.js";
import { skillLogger, createTimer, sanitize, logMethodCall, logMethodReturn, logMethodError } from "../../applications/shared/logger.js";

const logger = skillLogger();

/**
 * Skill 实现类
 * 提供 Skill 的基础实现
 */
export class Skill implements ISkillExtended {
  private content: SkillContent | null = null;
  private readonly _meta: SkillMeta;

  /**
   * 创建 Skill 实例
   * @param config - Skill 配置
   * @param meta - Skill 元数据
   */
  constructor(
    readonly config: SkillConfig,
    meta: SkillMeta,
  ) {
    this._meta = meta;
    logger.debug("Skill 实例创建", { skillName: meta.name, action: "create" });
  }

  /** 获取元数据 */
  get meta(): SkillMeta {
    return this._meta;
  }

  /** 是否已加载 */
  get loaded(): boolean {
    return this.content !== null;
  }

  /**
   * 加载 Skill 内容
   * 子类需要重写此方法实现实际加载逻辑
   */
  async loadContent(): Promise<string> {
    const timer = createTimer();
    const skillName = this._meta.name;
    logMethodCall(logger, { method: "loadContent", module: "Skill", params: { skillName } });
    
    try {
      if (this.content) {
        logger.debug("Skill 内容已缓存", { skillName, action: "loadContent", cached: true });
        logMethodReturn(logger, { method: "loadContent", module: "Skill", result: { cached: true }, duration: timer() });
        return this.content.content;
      }
      throw new Error("Skill.loadContent 需要子类实现");
    } catch (err) {
      logMethodError(logger, { method: "loadContent", module: "Skill", error: { name: (err as Error).name, message: (err as Error).message, ...((err as Error).stack ? { stack: (err as Error).stack } : {}) }, params: { skillName }, duration: timer() });
      throw err;
    }
  }

  /**
   * 重新加载 Skill 内容
   */
  async reload(): Promise<string> {
    const timer = createTimer();
    const skillName = this._meta.name;
    logMethodCall(logger, { method: "reload", module: "Skill", params: { skillName } });
    
    try {
      this.content = null;
      const result = await this.loadContent();
      
      logger.info("Skill 内容重新加载", { skillName, action: "reload" });
      logMethodReturn(logger, { method: "reload", module: "Skill", result: { success: true }, duration: timer() });
      return result;
    } catch (err) {
      logMethodError(logger, { method: "reload", module: "Skill", error: { name: (err as Error).name, message: (err as Error).message, ...((err as Error).stack ? { stack: (err as Error).stack } : {}) }, params: { skillName }, duration: timer() });
      throw err;
    }
  }

  /**
   * 获取 Skill 摘要
   */
  getSummary(): SkillSummary {
    const timer = createTimer();
    logMethodCall(logger, { method: "getSummary", module: "Skill", params: { skillName: this._meta.name } });
    
    const summary: SkillSummary = {
      name: this._meta.name,
      description: this._meta.description,
    };
    if (this._meta.tags) {
      summary.tags = this._meta.tags;
    }
    
    logMethodReturn(logger, { method: "getSummary", module: "Skill", result: sanitize(summary), duration: timer() });
    return summary;
  }
}

/**
 * Skill 加载器抽象基类
 * 提供 Skill 加载的基础框架
 */
export abstract class BaseSkillLoader implements ISkillLoaderExtended {
  protected skills = new Map<string, ISkillExtended>();

  /**
   * 列出所有可用 Skill
   * 子类需要实现具体的发现逻辑
   */
  abstract listSkills(): Promise<ISkillExtended[]>;

  /**
   * 加载指定 Skill 的内容
   * 子类需要实现具体的加载逻辑
   */
  abstract loadSkillContent(name: string): Promise<string | null>;

  /**
   * 获取指定名称的 Skill
   */
  getSkill(name: string): ISkillExtended | undefined {
    const timer = createTimer();
    logMethodCall(logger, { method: "getSkill", module: "BaseSkillLoader", params: { name } });
    
    const result = this.skills.get(name);
    
    logMethodReturn(logger, { method: "getSkill", module: "BaseSkillLoader", result: { found: result !== undefined }, duration: timer() });
    return result;
  }

  /**
   * 构建所有 Skill 的摘要文本
   */
  async buildSkillsSummary(): Promise<string> {
    const timer = createTimer();
    logMethodCall(logger, { method: "buildSkillsSummary", module: "BaseSkillLoader", params: {} });
    
    try {
      const skills = await this.listSkills();
      if (skills.length === 0) {
        logger.debug("没有可用的 Skill");
        logMethodReturn(logger, { method: "buildSkillsSummary", module: "BaseSkillLoader", result: { empty: true }, duration: timer() });
        return "";
      }

      const summaries = skills.map((s) => {
        const summary = s.getSummary();
        let line = `- ${summary.name}: ${summary.description}`;
        if (summary.tags?.length) {
          line += ` [${summary.tags.join(", ")}]`;
        }
        return line;
      });

      const result = `<skills>\n${summaries.join("\n")}\n</skills>`;
      
      logger.debug("Skill 摘要构建完成", { skillCount: skills.length });
      logMethodReturn(logger, { method: "buildSkillsSummary", module: "BaseSkillLoader", result: { skillCount: skills.length }, duration: timer() });
      return result;
    } catch (err) {
      logMethodError(logger, { method: "buildSkillsSummary", module: "BaseSkillLoader", error: { name: (err as Error).name, message: (err as Error).message, ...((err as Error).stack ? { stack: (err as Error).stack } : {}) }, params: {}, duration: timer() });
      throw err;
    }
  }

  /**
   * 注册 Skill
   */
  protected registerSkill(skill: ISkillExtended): void {
    const timer = createTimer();
    const skillName = skill.config.name;
    logMethodCall(logger, { method: "registerSkill", module: "BaseSkillLoader", params: { skillName } });
    
    this.skills.set(skillName, skill);
    
    logger.debug("Skill 已注册到加载器", { skillName, action: "registerSkill", totalSkills: this.skills.size });
    logMethodReturn(logger, { method: "registerSkill", module: "BaseSkillLoader", result: { success: true }, duration: timer() });
  }
}