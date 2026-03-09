/**
 * 技能初始化模块
 *
 * 为 Agent Service 准备技能配置数据。
 * 此模块仅负责准备配置数据，不负责实际加载。
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, basename, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';

/**
 * 技能配置接口
 */
export interface SkillConfig {
  /** 技能名称 */
  name: string;
  /** 技能描述 */
  description: string;
  /** 技能文件路径（SKILL.md 所在目录） */
  path: string;
  /** 是否启用 */
  enabled: boolean;
  /** 是否自动加载 */
  always?: boolean;
  /** 环境兼容性要求 */
  compatibility?: string;
  /** 依赖列表 */
  dependencies?: string[];
}

/**
 * 技能来源类型
 */
export type SkillSource = 'builtin' | 'workspace' | 'user';

/**
 * 内置技能目录路径
 *
 * 相对于此模块的位置：applications/cli/src/modules/ -> applications/cli/src/builtin/skills/
 */
function getBuiltinSkillsPath(): string {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  // 从 applications/cli/src/modules 到 applications/cli/src/builtin/skills
  return resolve(currentDir, '../builtin/skills');
}

/**
 * 用户技能目录
 */
const USER_SKILLS_DIR = '~/.micro-agent/skills';

/**
 * 默认启用的技能列表
 *
 * 如果配置文件未指定，则使用此列表
 */
const DEFAULT_ENABLED_SKILLS: string[] = [
  'time',
  'sysinfo',
];

/**
 * 从 frontmatter 解析技能元数据
 */
function parseSkillMetadata(fileContent: string, skillDir: string): Partial<SkillConfig> {
  try {
    const { data } = matter(fileContent);
    return {
      name: data.name ?? basename(skillDir),
      description: data.description ?? '',
      always: data.always ?? false,
      compatibility: data.compatibility,
      dependencies: data.dependencies,
    };
  } catch {
    return {};
  }
}

/**
 * 发现指定目录下的所有技能
 *
 * 扫描目录下的所有子目录，查找包含 SKILL.md 文件的技能
 *
 * @param basePath 技能根目录路径
 * @param source 技能来源类型
 * @param enabledList 启用的技能名称列表（可选）
 * @returns 发现的技能配置数组
 */
export function discoverSkills(
  basePath: string,
  source: SkillSource = 'builtin',
  enabledList?: string[]
): SkillConfig[] {
  const skills: SkillConfig[] = [];

  if (!existsSync(basePath)) {
    return skills;
  }

  const entries = readdirSync(basePath, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const skillDir = join(basePath, entry.name);
    const skillMdPath = join(skillDir, 'SKILL.md');

    if (!existsSync(skillMdPath)) continue;

    // 检查文件大小，防止过大文件
    try {
      const stats = statSync(skillMdPath);
      if (stats.size > 256000) { // 256KB 限制
        continue;
      }
    } catch {
      continue;
    }

    try {
      const fileContent = readFileSync(skillMdPath, 'utf-8');
      const metadata = parseSkillMetadata(fileContent, skillDir);
      const skillName = metadata.name ?? entry.name;

      // 确定是否启用：优先使用传入的启用列表，否则默认全部启用
      const enabled = enabledList !== undefined
        ? enabledList.includes(skillName)
        : true;

      skills.push({
        name: skillName,
        description: metadata.description ?? '',
        path: skillDir,
        enabled,
        always: metadata.always,
        compatibility: metadata.compatibility,
        dependencies: metadata.dependencies,
      });
    } catch {
      // 解析失败，跳过此技能
      continue;
    }
  }

  return skills;
}

/**
 * 获取内置技能配置列表
 *
 * 返回所有内置技能的配置信息。
 * 配置将传递给 Agent Service 进行技能加载。
 *
 * @param workspacePath 工作区路径（可选，用于加载项目级技能）
 * @param enabledSkills 启用的技能名称列表（可选，未指定则使用默认列表）
 * @returns 内置技能配置数组
 */
export function getBuiltinSkillConfigs(
  workspacePath?: string,
  enabledSkills?: string[]
): SkillConfig[] {
  const enabledList = enabledSkills ?? DEFAULT_ENABLED_SKILLS;
  const skills: SkillConfig[] = [];
  const seenNames = new Set<string>();

  // 加载优先级：builtin < user < workspace

  // 1. 加载内置技能
  const builtinPath = getBuiltinSkillsPath();
  const builtinSkills = discoverSkills(builtinPath, 'builtin', enabledList);
  for (const skill of builtinSkills) {
    if (!seenNames.has(skill.name)) {
      skills.push(skill);
      seenNames.add(skill.name);
    }
  }

  // 2. 加载用户技能
  const userSkillsPath = expandPath(USER_SKILLS_DIR);
  const userSkills = discoverSkills(userSkillsPath, 'user', enabledList);
  for (const skill of userSkills) {
    if (!seenNames.has(skill.name)) {
      skills.push(skill);
      seenNames.add(skill.name);
    } else {
      // 用户技能覆盖同名内置技能
      const index = skills.findIndex(s => s.name === skill.name);
      if (index >= 0) {
        skills[index] = skill;
      }
    }
  }

  // 3. 加载工作区技能
  if (workspacePath) {
    const projectSkillsPath = join(workspacePath, 'skills');
    const projectSkills = discoverSkills(projectSkillsPath, 'workspace', enabledList);
    for (const skill of projectSkills) {
      if (!seenNames.has(skill.name)) {
        skills.push(skill);
        seenNames.add(skill.name);
      } else {
        // 工作区技能优先级最高，覆盖同名技能
        const index = skills.findIndex(s => s.name === skill.name);
        if (index >= 0) {
          skills[index] = skill;
        }
      }
    }
  }

  return skills;
}

/**
 * 获取启用的技能名称列表
 *
 * 返回所有 enabled=true 的技能名称。
 * 用于启动时显示已加载的技能列表。
 *
 * @param configs 技能配置数组（可选，未指定则自动获取）
 * @returns 启用的技能名称数组
 */
export function getEnabledSkills(configs?: SkillConfig[]): string[] {
  const skillConfigs = configs ?? getBuiltinSkillConfigs();
  return skillConfigs
    .filter(skill => skill.enabled)
    .map(skill => skill.name);
}

/**
 * 获取 always=true 的技能名称列表
 *
 * 返回需要自动加载完整内容的技能名称。
 * 这些技能会在 Agent 启动时直接注入上下文。
 *
 * @param configs 技能配置数组（可选，未指定则自动获取）
 * @returns 自动加载的技能名称数组
 */
export function getAlwaysSkills(configs?: SkillConfig[]): string[] {
  const skillConfigs = configs ?? getBuiltinSkillConfigs();
  return skillConfigs
    .filter(skill => skill.enabled && skill.always)
    .map(skill => skill.name);
}

/**
 * 获取技能数量统计
 *
 * @param configs 技能配置数组（可选，未指定则自动获取）
 * @returns 包含总数、启用数、自动加载数的统计对象
 */
export function getSkillStats(configs?: SkillConfig[]): {
  total: number;
  enabled: number;
  always: number;
} {
  const skillConfigs = configs ?? getBuiltinSkillConfigs();
  return {
    total: skillConfigs.length,
    enabled: skillConfigs.filter(s => s.enabled).length,
    always: skillConfigs.filter(s => s.enabled && s.always).length,
  };
}

/**
 * 展开路径中的 ~ 符号
 */
function expandPath(path: string): string {
  if (path.startsWith('~/')) {
    return resolve(process.env.HOME ?? '', path.slice(2));
  }
  return resolve(path);
}

/**
 * 获取内置技能路径
 *
 * 返回内置技能目录的绝对路径。
 * 用于 SkillsLoader 初始化。
 *
 * @returns 内置技能目录路径
 */
export function getSkillsBuiltinPath(): string {
  return getBuiltinSkillsPath();
}

/**
 * 技能加载器
 *
 * 加载和构建技能摘要及内容
 */
export class SkillsLoader {
  private skills: SkillConfig[] = [];
  private workspace: string;
  private builtinPath: string;

  constructor(workspace: string, builtinPath: string) {
    this.workspace = workspace;
    this.builtinPath = builtinPath;
  }

  /**
   * 加载技能
   */
  load(): void {
    this.skills = getBuiltinSkillConfigs(this.workspace);
  }

  /**
   * 获取技能数量
   */
  get count(): number {
    return this.skills.length;
  }

  /**
   * 获取所有技能配置
   */
  getAll(): SkillConfig[] {
    return this.skills;
  }

  /**
   * 构建技能摘要
   *
   * 生成所有启用技能的简要描述表格
   */
  buildSkillsSummary(): string {
    const enabledSkills = this.skills.filter(s => s.enabled);
    if (enabledSkills.length === 0) {
      return '';
    }

    const lines: string[] = ['| 名称 | 描述 |', '|------|------|'];
    for (const skill of enabledSkills) {
      lines.push(`| ${skill.name} | ${skill.description || '-'} |`);
    }

    // 添加位置信息
    lines.push('');
    lines.push('**技能位置：**');
    for (const skill of enabledSkills) {
      lines.push(`- \`${skill.name}\`: ${skill.path}`);
    }

    return lines.join('\n');
  }

  /**
   * 构建 Always 技能内容
   *
   * 返回 always=true 的技能完整内容
   * 会将 <skill-dir> 占位符替换为实际的技能路径
   */
  buildAlwaysSkillsContent(): string {
    const alwaysSkills = this.skills.filter(s => s.enabled && s.always);
    if (alwaysSkills.length === 0) {
      return '';
    }

    const parts: string[] = [];

    for (const skill of alwaysSkills) {
      const skillMdPath = join(skill.path, 'SKILL.md');
      if (existsSync(skillMdPath)) {
        try {
          let content = readFileSync(skillMdPath, 'utf-8');
          // 替换 <skill-dir> 占位符为实际路径
          // 统一使用正斜杠，避免 Windows 反斜杠转义问题
          const normalizedPath = skill.path.replace(/\\/g, '/');
          content = content.replace(/<skill-dir>/g, normalizedPath);
          parts.push(`# 技能：${skill.name}\n\n${content}`);
        } catch {
          // 读取失败，跳过
        }
      }
    }

    return parts.join('\n\n---\n\n');
  }

  /**
   * 获取 Always 技能名称列表
   *
   * 返回 always=true 的技能名称，用于区分已注入和需读取的技能
   */
  getAlwaysSkillNames(): string[] {
    return this.skills
      .filter(s => s.enabled && s.always)
      .map(s => s.name);
  }

  /**
   * 获取非 Always 技能列表
   *
   * 返回需要按需读取的技能配置
   */
  getOnDemandSkills(): SkillConfig[] {
    return this.skills.filter(s => s.enabled && !s.always);
  }
}

// ============================================================================
// BuiltinSkillProvider 实现
// ============================================================================

import type { BuiltinSkillProvider } from '@micro-agent/sdk/runtime';

/**
 * CLI 技能提供者实现
 *
 * 实现 BuiltinSkillProvider 接口，提供内置技能路径。
 * 通过依赖注入机制，允许 Agent Service 获取技能目录路径。
 */
class CLISkillProvider implements BuiltinSkillProvider {
  /**
   * 获取内置技能路径
   * @returns 内置技能目录路径
   */
  getSkillsPath(): string {
    return getBuiltinSkillsPath();
  }
}

/** 单例技能提供者实例 */
const cliSkillProvider = new CLISkillProvider();

/**
 * 获取 CLI 技能提供者
 * @returns 技能提供者实例
 */
export function getCLISkillProvider(): BuiltinSkillProvider {
  return cliSkillProvider;
}

