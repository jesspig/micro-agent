import type { SkillMeta } from "../types.js";
import type { ISkillExtended, ISkillLoaderExtended } from "./contract.js";
import type { SkillConfig, SkillContent, SkillSummary } from "./types.js";

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
    if (this.content) return this.content.content;
    throw new Error("Skill.loadContent 需要子类实现");
  }

  /**
   * 重新加载 Skill 内容
   */
  async reload(): Promise<string> {
    this.content = null;
    return this.loadContent();
  }

  /**
   * 获取 Skill 摘要
   */
  getSummary(): SkillSummary {
    const summary: SkillSummary = {
      name: this._meta.name,
      description: this._meta.description,
    };
    if (this._meta.tags) {
      summary.tags = this._meta.tags;
    }
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
    return this.skills.get(name);
  }

  /**
   * 构建所有 Skill 的摘要文本
   */
  async buildSkillsSummary(): Promise<string> {
    const skills = await this.listSkills();
    if (skills.length === 0) return "";

    const summaries = skills.map((s) => {
      const summary = s.getSummary();
      let line = `- ${summary.name}: ${summary.description}`;
      if (summary.tags?.length) {
        line += ` [${summary.tags.join(", ")}]`;
      }
      return line;
    });

    return `<skills>\n${summaries.join("\n")}\n</skills>`;
  }

  /**
   * 注册 Skill
   */
  protected registerSkill(skill: ISkillExtended): void {
    this.skills.set(skill.config.name, skill);
  }
}