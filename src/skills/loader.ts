import { existsSync, readdirSync, readFileSync } from 'fs';
import { join, basename } from 'path';
import matter from 'gray-matter';

/** 技能名称验证正则：小写字母、数字、连字符 */
const SKILL_NAME_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** 技能摘要（用于启动时注入上下文） */
export interface SkillSummary {
  /** 技能名称 */
  name: string;
  /** 技能描述 */
  description: string;
}

/** 技能完整定义 */
export interface Skill extends SkillSummary {
  /** 许可证 */
  license?: string;
  /** 环境兼容性要求 */
  compatibility?: string;
  /** 元数据 */
  metadata: Record<string, string>;
  /** 预批准工具列表 */
  allowedTools?: string[];
  /** 技能内容（Markdown） */
  content: string;
  /** 技能目录路径 */
  skillPath: string;
}

/** 解析后的 frontmatter 数据 */
interface SkillFrontmatter {
  name?: string;
  description?: string;
  license?: string;
  compatibility?: string;
  metadata?: Record<string, string>;
  'allowed-tools'?: string;
}

/**
 * 技能加载器
 * 
 * 从 skills 目录加载 SKILL.md 文件，遵循 Agent Skills 规范。
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

    // 加载内置技能
    if (existsSync(this.builtinPath)) {
      this.loadFromDir(this.builtinPath);
    }

    // 加载用户技能（优先级更高，会覆盖同名内置技能）
    const userSkillsPath = join(this.workspacePath, 'skills');
    if (existsSync(userSkillsPath)) {
      this.loadFromDir(userSkillsPath);
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
        // 验证 name 与目录名匹配
        if (!this.validateSkillName(skill.name, entry.name)) {
          console.warn(`技能名称不匹配目录名: ${skill.name} vs ${entry.name}`);
          skill.name = entry.name; // 以目录名为准
        }
        this.skills.set(skill.name, skill);
      } catch (error) {
        console.error(`加载技能失败: ${entry.name}`, error);
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
      license: fm.license,
      compatibility: fm.compatibility,
      metadata: fm.metadata ?? {},
      allowedTools: fm['allowed-tools']?.split(/\s+/).filter(Boolean),
      content: content.trim(),
      skillPath: skillDir,
    };
  }

  /** 验证技能名称 */
  private validateSkillName(name: string, dirName: string): boolean {
    // 名称格式验证
    if (!SKILL_NAME_REGEX.test(name)) return false;
    // 名称必须匹配目录名
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

  /** 获取技能摘要列表（用于启动时注入上下文，~100 tokens） */
  getSummaries(): SkillSummary[] {
    return this.getAll().map(s => ({
      name: s.name,
      description: s.description,
    }));
  }

  /** 生成技能摘要 Markdown（用于注入系统提示） */
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