/**
 * 技能加载器
 * 
 * 从多个目录加载 SKILL.md 文件，遵循 Agent Skills 规范。
 */
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join, basename, resolve } from 'path';
import { homedir } from 'os';
import matter from 'gray-matter';
import { getLogger } from '@logtape/logtape';
import type { Skill, SkillSummary, SkillFrontmatter } from './types';
import { SKILL_NAME_REGEX } from './types';

const log = getLogger(['skill', 'loader']);

/** 用户技能目录 */
const USER_SKILLS_DIR = '~/.microbot/skills';

/**
 * 技能加载器
 * 
 * 从多个目录加载 SKILL.md 文件，遵循 Agent Skills 规范。
 * 加载优先级：项目 > 用户 > 内置（后加载覆盖前者）
 * 支持渐进式披露：启动时加载摘要，按需加载完整内容。
 */
export class SkillsLoader {
  private skills = new Map<string, Skill>();

  constructor(
    private workspacePath: string,
    private builtinPath: string
  ) {}

  /** 加载所有技能 */
  load(): void {
    this.skills.clear();

    // 1. 加载内置技能（最低优先级）
    if (existsSync(this.builtinPath)) {
      this.loadFromDir(this.builtinPath);
    }

    // 2. 加载用户技能 ~/.microbot/skills（中等优先级）
    const userSkillsPath = expandPath(USER_SKILLS_DIR);
    if (existsSync(userSkillsPath)) {
      this.loadFromDir(userSkillsPath);
    }

    // 3. 加载项目技能（最高优先级）
    const projectSkillsPath = join(this.workspacePath, 'skills');
    if (existsSync(projectSkillsPath)) {
      this.loadFromDir(projectSkillsPath);
    }
  }

  /** 从目录加载技能 */
  private loadFromDir(dir: string): void {
    const entries = readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const skillDir = join(dir, entry.name);
      const skillMdPath = join(skillDir, 'SKILL.md');
      if (!existsSync(skillMdPath)) continue;

      try {
        const skill = this.parseSkill(skillMdPath, skillDir);
        if (!this.validateSkillName(skill.name, entry.name)) {
          log.warn('技能名称不匹配目录名: {name} vs {dir}', { name: skill.name, dir: entry.name });
          skill.name = entry.name;
        }
        this.skills.set(skill.name, skill);
      } catch (error) {
        log.error('加载技能失败: {name}', { name: entry.name, error });
      }
    }
  }

  /** 解析技能文件 */
  private parseSkill(path: string, skillDir: string): Skill {
    const fileContent = readFileSync(path, 'utf-8');
    const { data, content } = matter(fileContent);
    const fm = data as SkillFrontmatter;

    return {
      name: fm.name ?? basename(skillDir),
      description: fm.description ?? '',
      dependencies: fm.dependencies,
      license: fm.license,
      compatibility: fm.compatibility,
      always: fm.always ?? false,
      metadata: fm.metadata ?? {},
      allowedTools: this.parseAllowedTools(fm['allowed-tools']),
      content: content.trim(),
      skillPath: skillDir,
    };
  }

  /** 解析 allowed-tools 字段 */
  private parseAllowedTools(value: unknown): string[] | undefined {
    if (!value) return undefined;
    if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string');
    if (typeof value === 'string') return value.split(/\s+/).filter(Boolean);
    return undefined;
  }

  /** 验证技能名称 */
  private validateSkillName(name: string, dirName: string): boolean {
    if (!SKILL_NAME_REGEX.test(name)) return false;
    return name === dirName;
  }

  /** 获取技能 */
  get(name: string): Skill | undefined {
    return this.skills.get(name);
  }

  /** 获取所有技能 */
  getAll(): Skill[] {
    return Array.from(this.skills.values());
  }

  /** 获取技能摘要列表 */
  getSummaries(): SkillSummary[] {
    return this.getAll().map(s => ({ name: s.name, description: s.description }));
  }

  /** 获取 always=true 的技能 */
  getAlwaysSkills(): Skill[] {
    return this.getAll().filter(s => s.always === true);
  }

  /** 生成技能摘要 Markdown */
  getSummariesMarkdown(): string {
    const summaries = this.getSummaries();
    if (summaries.length === 0) return '';

    const lines = summaries.map(s => `- **${s.name}**: ${s.description}`);
    return `## 可用技能\n\n${lines.join('\n')}\n\n使用 \`read_file\` 工具加载技能详细内容。`;
  }

  /** 获取技能数量 */
  get count(): number {
    return this.skills.size;
  }
}

/** 展开路径（支持 ~ 前缀） */
function expandPath(path: string): string {
  if (path.startsWith('~/')) {
    return resolve(homedir(), path.slice(2));
  }
  return resolve(path);
}

/** 获取用户技能目录路径 */
export function getUserSkillsPath(): string {
  return expandPath(USER_SKILLS_DIR);
}