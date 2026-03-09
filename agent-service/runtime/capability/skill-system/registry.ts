/**
 * 技能注册表
 *
 * 管理已注册技能的生命周期
 */

import { getLogger } from '@logtape/logtape';

const log = getLogger(['skill', 'registry']);

/** 技能定义 */
export interface SkillDefinition {
  /** 技能名称（唯一标识） */
  readonly name: string;
  /** 技能描述 */
  readonly description: string;
  /** 适用场景 */
  readonly scenarios: string[];
  /** 关联工具列表 */
  readonly tools?: string[];
  /** 提示模板 */
  readonly promptTemplate?: string;
  /** 使用示例 */
  readonly examples?: SkillExample[];
}

/** 技能示例 */
export interface SkillExample {
  /** 输入 */
  input: string;
  /** 推理过程 */
  reasoning: string;
  /** 输出 */
  output: string;
}

/** 技能匹配结果 */
export interface SkillMatch {
  skill: SkillDefinition;
  score: number;
  reason: string;
}

/** 技能注册表配置 */
export interface SkillRegistryConfig {
  /** 工作目录 */
  workspace?: string;
}

/** 已注册技能 */
interface RegisteredSkill {
  skill: SkillDefinition;
  registeredAt: Date;
  source?: string;
}

/**
 * 技能注册表
 *
 * 负责技能的注册、匹配和执行
 */
export class SkillRegistry {
  private skills = new Map<string, RegisteredSkill>();
  private _config: SkillRegistryConfig;

  constructor(config: SkillRegistryConfig = {}) {
    this._config = config;
  }

  /**
   * 注册技能
   */
  register(skill: SkillDefinition, source?: string): void {
    if (this.skills.has(skill.name)) {
      log.warn('技能已注册，将覆盖: {name}', { name: skill.name });
    }

    this.skills.set(skill.name, {
      skill,
      registeredAt: new Date(),
      source,
    });

    log.info('技能已注册: {name}', { name: skill.name });
  }

  /**
   * 批量注册技能
   */
  registerBatch(skills: SkillDefinition[], source?: string): void {
    for (const skill of skills) {
      this.register(skill, source);
    }
  }

  /**
   * 注销技能
   */
  unregister(name: string): void {
    if (this.skills.delete(name)) {
      log.info('技能已注销: {name}', { name });
    }
  }

  /**
   * 获取技能
   */
  get(name: string): SkillDefinition | undefined {
    return this.skills.get(name)?.skill;
  }

  /**
   * 检查技能是否存在
   */
  has(name: string): boolean {
    return this.skills.has(name);
  }

  /**
   * 获取所有技能
   */
  getAll(): SkillDefinition[] {
    return Array.from(this.skills.values()).map(r => r.skill);
  }

  /**
   * 根据场景匹配技能
   */
  matchByScenario(scenario: string): SkillMatch[] {
    const matches: SkillMatch[] = [];

    for (const registered of this.skills.values()) {
      const skill = registered.skill;
      
      // 检查场景是否匹配
      const matchingScenario = skill.scenarios.find(s => 
        scenario.toLowerCase().includes(s.toLowerCase()) ||
        s.toLowerCase().includes(scenario.toLowerCase())
      );

      if (matchingScenario) {
        matches.push({
          skill,
          score: 0.8,
          reason: `场景匹配: ${matchingScenario}`,
        });
      }
    }

    // 按分数排序
    matches.sort((a, b) => b.score - a.score);
    return matches;
  }

  /**
   * 获取技能关联的工具
   */
  getToolsForSkill(skillName: string): string[] {
    const skill = this.get(skillName);
    return skill?.tools ?? [];
  }

  /**
   * 获取技能数量
   */
  get size(): number {
    return this.skills.size;
  }

  /**
   * 清空注册表
   */
  clear(): void {
    this.skills.clear();
    log.info('技能注册表已清空');
  }
}

/**
 * 创建技能注册表
 */
export function createSkillRegistry(config?: SkillRegistryConfig): SkillRegistry {
  return new SkillRegistry(config);
}
