/**
 * 技能加载器
 * 
 * 实现三级渐进式披露架构：
 * - Level 1: 元数据 (name, description, location) ~100 tokens，启动时加载
 * - Level 2: SKILL.md 正文 ~500-2000 tokens，按需加载
 * - Level 3: scripts, assets，按需加载
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join, basename, resolve } from 'path';
import { homedir } from 'os';
import matter from 'gray-matter';
import { getLogger } from '@logtape/logtape';
import type { Skill, SkillSummary, SkillFrontmatter, SkillMetadata, SkillsLimits } from './types';
import { SKILL_NAME_REGEX, DEFAULT_SKILLS_LIMITS } from './types';

const log = getLogger(['skill', 'loader']);

/** 用户技能目录 */
const USER_SKILLS_DIR = '~/.micro-agent/skills';

/**
 * 技能加载器
 */
export class SkillsLoader {
  private skills = new Map<string, Skill>();
  private limits: Required<SkillsLimits>;

  constructor(
    private workspacePath: string,
    private builtinPath: string,
    limits?: SkillsLimits
  ) {
    this.limits = { ...DEFAULT_SKILLS_LIMITS, ...limits };
  }

  /** 加载所有技能 */
  load(): void {
    this.skills.clear();

    // 优先级：builtin < user < workspace
    if (existsSync(this.builtinPath)) {
      this.loadFromDir(this.builtinPath, 'builtin');
    }

    const userSkillsPath = expandPath(USER_SKILLS_DIR);
    if (existsSync(userSkillsPath)) {
      this.loadFromDir(userSkillsPath, 'user');
    }

    const projectSkillsPath = join(this.workspacePath, 'skills');
    if (existsSync(projectSkillsPath)) {
      this.loadFromDir(projectSkillsPath, 'workspace');
    }
  }

  /** 从目录加载技能 */
  private loadFromDir(dir: string, source: string): void {
    const entries = readdirSync(dir, { withFileTypes: true });
    let loaded = 0;

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (loaded >= this.limits.maxSkillsLoadedPerSource) break;

      const skillDir = join(dir, entry.name);
      const skillMdPath = join(skillDir, 'SKILL.md');
      if (!existsSync(skillMdPath)) continue;

      // 检查文件大小
      try {
        const stats = statSync(skillMdPath);
        if (stats.size > this.limits.maxSkillFileBytes) {
          log.warn('技能文件过大，跳过: {name}', { name: entry.name, size: stats.size });
          continue;
        }
      } catch {
        continue;
      }

      try {
        const skill = this.parseSkill(skillMdPath, skillDir);
        if (!this.validateSkillName(skill.name, entry.name)) {
          log.warn('技能名称不匹配目录名: {name} vs {dir}', { name: skill.name, dir: entry.name });
          skill.name = entry.name;
        }
        // workspace 技能优先级最高，覆盖同名技能
        this.skills.set(skill.name, skill);
        loaded++;
      } catch (error) {
        log.error('加载技能失败: {name}', { name: entry.name, error });
      }
    }

    if (loaded > 0) {
      log.debug('从 {source} 加载 {count} 个技能', { source, count: loaded });
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
      metadata: this.parseMetadata(fm.metadata),
      allowedTools: this.parseAllowedTools(fm['allowed-tools']),
      content: content.trim(),
      skillPath: skillDir,
    };
  }

  /** 解析元数据（支持字符串 JSON 或对象格式） */
  private parseMetadata(value: string | Record<string, unknown> | undefined): SkillMetadata {
    if (!value) return {};
    if (typeof value === 'object') {
      return value as SkillMetadata;
    }
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return {};
      }
    }
    return {};
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

  /** 获取技能数量 */
  get count(): number {
    return this.skills.size;
  }

  /**
   * 检查技能依赖是否满足
   */
  checkRequirements(skill: Skill): { available: boolean; missing: string[] } {
    const requires = skill.metadata?.requires;
    if (!requires) return { available: true, missing: [] };

    const missing: string[] = [];

    // 检查二进制命令
    for (const bin of requires.bins ?? []) {
      if (!this.hasBinary(bin)) {
        missing.push(`CLI: ${bin}`);
      }
    }

    // 检查环境变量
    for (const env of requires.env ?? []) {
      if (!process.env[env]) {
        missing.push(`ENV: ${env}`);
      }
    }

    return { available: missing.length === 0, missing };
  }

  /** 检查二进制命令是否存在 */
  private hasBinary(name: string): boolean {
    try {
      // Windows 使用 where，Unix 使用 which
      const cmd = process.platform === 'win32' ? `where ${name}` : `which ${name}`;
      require('child_process').execSync(cmd, { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 构建 Level 1 摘要（渐进式加载）
   * 
   * 仅包含 name, description, location，引导 LLM 通过 read_file 加载详情。
   */
  buildSkillsSummary(): string {
    const summaries = this.getSummaries();
    if (summaries.length === 0) return '';

    // 应用限制
    const limited = summaries.slice(0, this.limits.maxSkillsInPrompt);
    let result = this.formatSkillsXml(limited);
    
    // 检查字符限制
    if (result.length > this.limits.maxSkillsPromptChars) {
      // 二分查找适配
      let lo = 0, hi = limited.length;
      while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        const test = this.formatSkillsXml(limited.slice(0, mid));
        if (test.length <= this.limits.maxSkillsPromptChars) {
          lo = mid;
        } else {
          hi = mid - 1;
        }
      }
      result = this.formatSkillsXml(limited.slice(0, lo));
      
      if (lo < summaries.length) {
        result += `\n<!-- 已截断：显示 ${lo}/${summaries.length} 个技能 -->`;
      }
    }

    return result;
  }

  /** 格式化为 XML（符合 Agent Skills 规范） */
  private formatSkillsXml(summaries: SkillSummary[]): string {
    const lines = ['<skills>'];
    
    for (const s of summaries) {
      const skill = this.skills.get(s.name);
      if (!skill) continue;

      const { available, missing } = this.checkRequirements(skill);
      const availableAttr = available ? 'true' : 'false';
      
      lines.push(`  <skill available="${availableAttr}">`);
      lines.push(`    <name>${this.escapeXml(s.name)}</name>`);
      lines.push(`    <description>${this.escapeXml(s.description)}</description>`);
      lines.push(`    <location>${skill.skillPath}/SKILL.md</location>`);
      
      if (!available && missing.length > 0) {
        lines.push(`    <requires>${this.escapeXml(missing.join(', '))}</requires>`);
      }
      
      lines.push(`  </skill>`);
    }
    lines.push('</skills>');
    return lines.join('\n');
  }

  /**
   * 构建 always 技能的完整内容（Level 2 直接注入）
   */
  buildAlwaysSkillsContent(): string {
    const alwaysSkills = this.getAlwaysSkills();
    if (alwaysSkills.length === 0) return '';

    const parts: string[] = [];
    for (const skill of alwaysSkills) {
      const { available } = this.checkRequirements(skill);
      if (!available) continue;

      const content = skill.content.replace(/<skill-dir>/g, skill.skillPath);
      parts.push(`### ${skill.name}\n${skill.description}\n\n**目录:** ${skill.skillPath}\n\n${content}`);
    }

    if (parts.length === 0) return '';

    return `# 自动加载技能

以下技能已自动加载到上下文中。

**使用方式：** 通过 \`exec\` 工具执行脚本，例如：
\`\`\`
bun <skill-dir>/scripts/index.ts --type cpu
\`\`\`

---

${parts.join('\n\n---\n\n')}`;
  }

  /** XML 转义 */
  private escapeXml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /** 生成技能摘要 Markdown（兼容旧接口） */
  getSummariesMarkdown(): string {
    const summaries = this.getSummaries();
    if (summaries.length === 0) return '';

    const lines = summaries.map(s => `- **${s.name}**: ${s.description}`);
    return `## 可用技能\n\n${lines.join('\n')}\n\n使用 \`read_file\` 工具加载技能详细内容。`;
  }
}

/** 展开路径 */
function expandPath(path: string): string {
  if (path.startsWith('~/')) {
    return resolve(homedir(), path.slice(2));
  }
  return resolve(path);
}
