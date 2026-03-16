import type { ISkillExtended } from "./contract.js";
import { RegistryError } from "../errors.js";
import { skillLogger, createTimer, logMethodCall, logMethodReturn, logMethodError } from "../../applications/shared/logger.js";

const logger = skillLogger();

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
    const timer = createTimer();
    const name = skill.config.name;
    logMethodCall(logger, { method: "register", module: "SkillRegistry", params: { skillName: name } });
    
    try {
      if (this.skills.has(name)) {
        throw new RegistryError(`Skill "${name}" 已存在`, "Skill", name);
      }
      this.skills.set(name, skill);
      
      logger.info("Skill 注册成功", { skillName: name, action: "register" });
      logMethodReturn(logger, { method: "register", module: "SkillRegistry", result: { success: true }, duration: timer() });
    } catch (err) {
      logMethodError(logger, { method: "register", module: "SkillRegistry", error: { name: (err as Error).name, message: (err as Error).message, ...((err as Error).stack ? { stack: (err as Error).stack } : {}) }, params: { skillName: name }, duration: timer() });
      throw err;
    }
  }

  /**
   * 注册加载器函数
   * @param loader - 加载器函数，返回 Skill 列表
   */
  registerLoader(loader: () => Promise<ISkillExtended[]>): void {
    const timer = createTimer();
    logMethodCall(logger, { method: "registerLoader", module: "SkillRegistry", params: {} });
    
    this.loaders.push(loader);
    
    logger.debug("Skill 加载器已注册", { loaderCount: this.loaders.length });
    logMethodReturn(logger, { method: "registerLoader", module: "SkillRegistry", result: { success: true }, duration: timer() });
  }

  /**
   * 获取指定名称的 Skill
   * @param name - Skill 名称
   * @returns Skill 实例，若不存在则返回 undefined
   */
  get(name: string): ISkillExtended | undefined {
    const timer = createTimer();
    logMethodCall(logger, { method: "get", module: "SkillRegistry", params: { name } });
    
    const result = this.skills.get(name);
    
    logMethodReturn(logger, { method: "get", module: "SkillRegistry", result: { found: result !== undefined, skillName: name }, duration: timer() });
    return result;
  }

  /**
   * 列出所有 Skill
   * @returns Skill 列表
   */
  list(): ISkillExtended[] {
    const timer = createTimer();
    logMethodCall(logger, { method: "list", module: "SkillRegistry", params: {} });
    
    const result = Array.from(this.skills.values());
    
    logMethodReturn(logger, { method: "list", module: "SkillRegistry", result: { count: result.length }, duration: timer() });
    return result;
  }

  /**
   * 检查 Skill 是否存在
   * @param name - Skill 名称
   * @returns 是否存在
   */
  has(name: string): boolean {
    const timer = createTimer();
    logMethodCall(logger, { method: "has", module: "SkillRegistry", params: { name } });
    
    const result = this.skills.has(name);
    
    logMethodReturn(logger, { method: "has", module: "SkillRegistry", result: { exists: result }, duration: timer() });
    return result;
  }

  /**
   * 执行所有注册的加载器
   * 将加载器返回的 Skill 注册到注册表
   */
  async loadAll(): Promise<void> {
    const timer = createTimer();
    logMethodCall(logger, { method: "loadAll", module: "SkillRegistry", params: { loaderCount: this.loaders.length } });
    
    try {
      let totalLoaded = 0;
      
      for (const loader of this.loaders) {
        const skills = await loader();
        for (const skill of skills) {
          this.register(skill);
          totalLoaded++;
        }
      }
      
      logger.info("所有 Skill 加载完成", { action: "loadAll", totalLoaded, loaderCount: this.loaders.length });
      logMethodReturn(logger, { method: "loadAll", module: "SkillRegistry", result: { totalLoaded }, duration: timer() });
    } catch (err) {
      logMethodError(logger, { method: "loadAll", module: "SkillRegistry", error: { name: (err as Error).name, message: (err as Error).message, ...((err as Error).stack ? { stack: (err as Error).stack } : {}) }, params: { loaderCount: this.loaders.length }, duration: timer() });
      throw err;
    }
  }
}
