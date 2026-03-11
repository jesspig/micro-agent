import type { ISkillExtended } from "./contract.js";
import { RegistryError } from "../errors.js";

/**
 * Skill 注册表
 * 管理所有已注册的 Skill 实例
 */
export class SkillRegistry {
  private skills = new Map<string, ISkillExtended>();
  private loaders: Array<() => Promise<ISkillExtended[]>> = [];

  /**
   * 注册 Skill
   * @param skill - Skill 实例
   * @throws RegistryError 如果 Skill 已存在
   */
  register(skill: ISkillExtended): void {
    const name = skill.config.name;
    if (this.skills.has(name)) {
      throw new RegistryError(`Skill "${name}" 已存在`, "Skill", name);
    }
    this.skills.set(name, skill);
  }

  /**
   * 注册加载器函数
   * @param loader - 加载器函数，返回 Skill 列表
   */
  registerLoader(loader: () => Promise<ISkillExtended[]>): void {
    this.loaders.push(loader);
  }

  /**
   * 获取指定名称的 Skill
   * @param name - Skill 名称
   * @returns Skill 实例，若不存在则返回 undefined
   */
  get(name: string): ISkillExtended | undefined {
    return this.skills.get(name);
  }

  /**
   * 列出所有 Skill
   * @returns Skill 列表
   */
  list(): ISkillExtended[] {
    return Array.from(this.skills.values());
  }

  /**
   * 检查 Skill 是否存在
   * @param name - Skill 名称
   * @returns 是否存在
   */
  has(name: string): boolean {
    return this.skills.has(name);
  }

  /**
   * 执行所有注册的加载器
   * 将加载器返回的 Skill 注册到注册表
   */
  async loadAll(): Promise<void> {
    for (const loader of this.loaders) {
      const skills = await loader();
      for (const skill of skills) {
        this.register(skill);
      }
    }
  }
}
