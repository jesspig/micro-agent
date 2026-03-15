/**
 * 文件系统 Skill 加载器
 * 
 * 从文件系统加载 Skill，支持渐进式披露：
 * - 元数据始终加载
 * - 内容按需加载
 */

import { join } from "node:path";
import { BaseSkillLoader, Skill } from "../../runtime/skill/index.js";
import type { ISkillExtended } from "../../runtime/skill/contract.js";
import type { SkillConfig, SkillContent } from "../../runtime/skill/types.js";
import type { SkillMeta } from "../../runtime/types.js";
import { SKILLS_DIR } from "../shared/constants.js";

// ============================================================================
// 常量定义
// ============================================================================

/** Skill 定义文件名 */
const SKILL_FILE_NAME = "SKILL.md";

/** Frontmatter 正则表达式 */
const FRONTMATTER_REGEX = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;

// ============================================================================
// 工具函数
// ============================================================================

/**
 * 解析 YAML frontmatter
 * 
 * @param content - 文件内容
 * @returns 解析结果，包含元数据和内容
 */
export function parseFrontmatter(
  content: string,
): { meta: Partial<SkillMeta>; body: string } {
  const match = content.match(FRONTMATTER_REGEX);

  if (!match) {
    // 没有 frontmatter，返回默认值
    return {
      meta: {},
      body: content.trim(),
    };
  }

  // 正则匹配已经确保了捕获组存在
  const frontmatter = match[1] as string;
  const body = (match[2] as string).trim();

  // 解析 YAML 格式的元数据
  const meta = parseYamlFrontmatter(frontmatter);

  return { meta, body };
}

/**
 * 解析 YAML 格式的 frontmatter
 * 
 * 支持简单的键值对格式：
 * - name: value
 * - tags: [item1, item2]
 * 
 * @param yaml - YAML 字符串
 * @returns 解析后的元数据
 */
export function parseYamlFrontmatter(yaml: string): Partial<SkillMeta> {
  const meta: Partial<SkillMeta> = {};
  const lines = yaml.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const colonIndex = trimmed.indexOf(":");
    if (colonIndex === -1) continue;

    const key = trimmed.slice(0, colonIndex).trim();
    const rawValue = trimmed.slice(colonIndex + 1).trim();

    // 解析数组格式 [item1, item2]
    if (rawValue.startsWith("[") && rawValue.endsWith("]")) {
      const arrayContent = rawValue.slice(1, -1);
      const items = arrayContent
        .split(",")
        .map((item) => item.trim())
        .filter((item): item is string => item.length > 0);

      if (key === "tags") {
        meta.tags = items;
      } else if (key === "dependencies") {
        meta.dependencies = items;
      }
      continue;
    }

    // 解析字符串值（移除引号）
    let value: string = rawValue;
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    // 设置元数据
    if (key === "name") {
      meta.name = value;
    } else if (key === "description") {
      meta.description = value;
    } else if (key === "version") {
      meta.version = value;
    }
  }

  return meta;
}

// ============================================================================
// FilesystemSkill 类
// ============================================================================

/**
 * 文件系统 Skill 实现
 * 
 * 从文件系统加载 Skill 内容，支持延迟加载
 */
export class FilesystemSkill extends Skill implements ISkillExtended {
  /** Skill 文件路径 */
  private readonly filePath: string;

  /** 已加载的内容 */
  private loadedContent: SkillContent | null = null;

  /**
   * 创建文件系统 Skill 实例
   * @param config - Skill 配置
   * @param meta - Skill 元数据
   * @param filePath - Skill 文件路径
   */
  constructor(
    config: SkillConfig,
    meta: SkillMeta,
    filePath: string,
  ) {
    super(config, meta);
    this.filePath = filePath;
  }

  /**
   * 加载 Skill 内容
   * 如果已加载则返回缓存内容
   */
  override async loadContent(): Promise<string> {
    // 返回缓存内容
    if (this.loadedContent) {
      return this.loadedContent.content;
    }

    try {
      // 读取文件
      const file = Bun.file(this.filePath);
      const exists = await file.exists();

      if (!exists) {
        return "";
      }

      const rawContent = await file.text();
      const { body } = parseFrontmatter(rawContent);

      // 缓存内容
      this.loadedContent = {
        meta: this.meta,
        content: body,
        loadedAt: Date.now(),
      };

      return body;
    } catch (error) {
      throw error;
    }
  }

  /**
   * 重新加载 Skill 内容
   */
  override async reload(): Promise<string> {
    this.loadedContent = null;
    return this.loadContent();
  }

  /**
   * 获取已加载的内容
   */
  getContent(): SkillContent | null {
    return this.loadedContent;
  }
}

// ============================================================================
// FilesystemSkillLoader 类
// ============================================================================

/**
 * 文件系统 Skill 加载器
 * 
 * 从文件系统目录加载 Skill，支持渐进式披露：
 * - 启动时扫描目录，加载所有 Skill 元数据
 * - 内容在首次访问时加载
 */
export class FilesystemSkillLoader extends BaseSkillLoader {
  /** Skill 目录路径 */
  private readonly skillsDir: string;

  /** 是否已初始化 */
  private initialized = false;

  /**
   * 创建文件系统 Skill 加载器
   * @param skillsDir - Skill 目录路径（默认为 ~/.micro-agent/workspace/.agent/skills）
   */
  constructor(skillsDir: string = SKILLS_DIR) {
    super();
    this.skillsDir = skillsDir;
  }

  /**
   * 初始化加载器
   * 扫描目录并加载所有 Skill 元数据
   */
  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;

    try {
      await this.scanSkillsDirectory();
      this.initialized = true;
    } catch (error) {
      throw error;
    }
  }

  /**
   * 扫描 Skill 目录
   */
  private async scanSkillsDirectory(): Promise<void> {
    // 检查目录是否存在
    let dirExists = false;
    try {
      const stat = await Bun.file(this.skillsDir).stat();
      dirExists = stat?.isDirectory() ?? false;
    } catch {
      dirExists = false;
    }

    if (!dirExists) {
      return;
    }

    // 扫描子目录
    const glob = new Bun.Glob("*/" + SKILL_FILE_NAME);
    const entries = Array.from(glob.scanSync(this.skillsDir));

    for (const relativePath of entries) {
      try {
        // 将相对路径转换为绝对路径
        const absolutePath = join(this.skillsDir, relativePath);
        await this.loadSkillMetadata(absolutePath);
      } catch (error) {
        // 忽略错误
      }
    }
  }

  /**
   * 加载 Skill 元数据
   * 仅解析 frontmatter，不加载完整内容
   */
  private async loadSkillMetadata(skillFile: string): Promise<void> {
    const file = Bun.file(skillFile);
    const exists = await file.exists();

    if (!exists) {
      return;
    }

    // 读取文件内容
    const content = await file.text();
    const { meta, body } = parseFrontmatter(content);

    // 验证必需字段
    let skillName = meta.name;
    if (!skillName) {
      // 从目录名推断 Skill 名称
      const parts = skillFile.split(/[/\\]/);
      const dirIndex = parts.length - 2;
      skillName = parts[dirIndex] ?? "unknown";
    }

    let description = meta.description;
    if (!description) {
      // 从内容首行提取描述
      const lines = body.split("\n");
      const firstLine = lines[0] ?? "";
      description = firstLine.replace(/^#\s*/, "").trim() || "无描述";
    }

    // 构建完整的 SkillMeta
    const fullMeta: SkillMeta = {
      name: skillName,
      description: description,
      version: meta.version ?? "1.0.0",
      ...(meta.tags ? { tags: meta.tags } : {}),
      ...(meta.dependencies ? { dependencies: meta.dependencies } : {}),
    };

    // 构建 Skill 配置
    const config: SkillConfig = {
      name: skillName,
      path: skillFile,
      enabled: true,
      priority: 0,
    };

    // 创建 Skill 实例
    const skill = new FilesystemSkill(config, fullMeta, skillFile);

    // 注册到加载器
    this.registerSkill(skill);
  }

  /**
   * 列出所有可用 Skill
   */
  async listSkills(): Promise<ISkillExtended[]> {
    await this.ensureInitialized();
    return Array.from(this.skills.values());
  }

  /**
   * 加载指定 Skill 的内容
   * @param name - Skill 名称
   * @returns Skill 内容，若不存在则返回 null
   */
  async loadSkillContent(name: string): Promise<string | null> {
    await this.ensureInitialized();

    const skill = this.getSkill(name);
    if (!skill) {
      return null;
    }

    try {
      return await skill.loadContent();
    } catch (error) {
      return null;
    }
  }

  /**
   * 重新扫描并加载所有 Skill
   */
  async reload(): Promise<void> {
    this.skills.clear();
    this.initialized = false;
    await this.ensureInitialized();
  }
}