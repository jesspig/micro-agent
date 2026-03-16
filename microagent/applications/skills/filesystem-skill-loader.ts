/**
 * 文件系统 Skill 加载器
 * 
 * 从文件系统加载 Skill，支持渐进式披露：
 * - 元数据始终加载
 * - 内容按需加载
 */

import { join } from "node:path";

const MODULE_NAME = "FilesystemSkillLoader";
import { BaseSkillLoader, Skill } from "../../runtime/skill/index.js";
import type { ISkillExtended } from "../../runtime/skill/contract.js";
import type { SkillConfig, SkillContent } from "../../runtime/skill/types.js";
import type { SkillMeta } from "../../runtime/types.js";
import { SKILLS_DIR } from "../shared/constants.js";
import { skillsLogger, createTimer, sanitize, logMethodCall, logMethodReturn, logMethodError } from "../shared/logger.js";

const logger = skillsLogger();

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
  const timer = createTimer();
  logMethodCall(logger, { method: "parseFrontmatter", module: MODULE_NAME, params: { contentLength: content.length } });

  try {
    const match = content.match(FRONTMATTER_REGEX);

    if (!match) {
      // 没有 frontmatter，返回默认值
      const result = {
        meta: {},
        body: content.trim(),
      };
      logMethodReturn(logger, { method: "parseFrontmatter", module: MODULE_NAME, result: sanitize(result), duration: timer() });
      return result;
    }

    // 正则匹配已经确保了捕获组存在
    const frontmatter = match[1] as string;
    const body = (match[2] as string).trim();

    // 解析 YAML 格式的元数据
    const meta = parseYamlFrontmatter(frontmatter);

    const result = { meta, body };
    logMethodReturn(logger, { method: "parseFrontmatter", module: MODULE_NAME, result: sanitize(result), duration: timer() });
    return result;
  } catch (err) {
    const error = err as Error;
    logMethodError(logger, { method: "parseFrontmatter", module: MODULE_NAME, error: { name: error.name, message: error.message, ...(error.stack ? { stack: error.stack } : {}) }, params: { contentLength: content.length }, duration: timer() });
    throw error;
  }
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
  const timer = createTimer();
  logMethodCall(logger, { method: "parseYamlFrontmatter", module: MODULE_NAME, params: { yamlLength: yaml.length } });

  try {
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

    logMethodReturn(logger, { method: "parseYamlFrontmatter", module: MODULE_NAME, result: sanitize(meta), duration: timer() });
    return meta;
  } catch (err) {
    const error = err as Error;
    logMethodError(logger, { method: "parseYamlFrontmatter", module: MODULE_NAME, error: { name: error.name, message: error.message, ...(error.stack ? { stack: error.stack } : {}) }, params: { yamlLength: yaml.length }, duration: timer() });
    throw error;
  }
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
    const timer = createTimer();
    logMethodCall(logger, { method: "FilesystemSkill.loadContent", module: MODULE_NAME, params: { filePath: this.filePath, hasCache: !!this.loadedContent } });

    try {
      // 返回缓存内容
      if (this.loadedContent) {
        logMethodReturn(logger, { method: "FilesystemSkill.loadContent", module: MODULE_NAME, result: { cached: true, contentLength: this.loadedContent.content.length }, duration: timer() });
        return this.loadedContent.content;
      }

      // 读取文件
      const file = Bun.file(this.filePath);
      const exists = await file.exists();

      if (!exists) {
        logMethodReturn(logger, { method: "FilesystemSkill.loadContent", module: MODULE_NAME, result: { exists: false }, duration: timer() });
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

      logMethodReturn(logger, { method: "FilesystemSkill.loadContent", module: MODULE_NAME, result: { cached: false, contentLength: body.length }, duration: timer() });
      return body;
    } catch (err) {
      const error = err as Error;
      logMethodError(logger, { method: "FilesystemSkill.loadContent", module: MODULE_NAME, error: { name: error.name, message: error.message, ...(error.stack ? { stack: error.stack } : {}) }, params: { filePath: this.filePath }, duration: timer() });
      throw error;
    }
  }

  /**
   * 重新加载 Skill 内容
   */
  override async reload(): Promise<string> {
    const timer = createTimer();
    logMethodCall(logger, { method: "FilesystemSkill.reload", module: MODULE_NAME, params: { filePath: this.filePath } });

    try {
      this.loadedContent = null;
      const result = await this.loadContent();
      logMethodReturn(logger, { method: "FilesystemSkill.reload", module: MODULE_NAME, result: { contentLength: result.length }, duration: timer() });
      return result;
    } catch (err) {
      const error = err as Error;
      logMethodError(logger, { method: "FilesystemSkill.reload", module: MODULE_NAME, error: { name: error.name, message: error.message, ...(error.stack ? { stack: error.stack } : {}) }, params: { filePath: this.filePath }, duration: timer() });
      throw error;
    }
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
    const timer = createTimer();
    logMethodCall(logger, { method: "FilesystemSkillLoader.ensureInitialized", module: MODULE_NAME, params: { skillsDir: this.skillsDir, initialized: this.initialized } });

    try {
      if (this.initialized) {
        logMethodReturn(logger, { method: "FilesystemSkillLoader.ensureInitialized", module: MODULE_NAME, result: { alreadyInitialized: true }, duration: timer() });
        return;
      }

      await this.scanSkillsDirectory();
      this.initialized = true;

      logMethodReturn(logger, { method: "FilesystemSkillLoader.ensureInitialized", module: MODULE_NAME, result: { skillCount: this.skills.size }, duration: timer() });
    } catch (err) {
      const error = err as Error;
      logMethodError(logger, { method: "FilesystemSkillLoader.ensureInitialized", module: MODULE_NAME, error: { name: error.name, message: error.message, ...(error.stack ? { stack: error.stack } : {}) }, params: { skillsDir: this.skillsDir }, duration: timer() });
      throw error;
    }
  }

  /**
   * 扫描 Skill 目录
   */
  private async scanSkillsDirectory(): Promise<void> {
    const timer = createTimer();
    logMethodCall(logger, { method: "FilesystemSkillLoader.scanSkillsDirectory", module: MODULE_NAME, params: { skillsDir: this.skillsDir } });

    try {
      // 检查目录是否存在
      let dirExists = false;
      try {
        const stat = await Bun.file(this.skillsDir).stat();
        dirExists = stat?.isDirectory() ?? false;
      } catch {
        dirExists = false;
      }

      if (!dirExists) {
        logMethodReturn(logger, { method: "FilesystemSkillLoader.scanSkillsDirectory", module: MODULE_NAME, result: { dirExists: false }, duration: timer() });
        return;
      }

      // 扫描子目录
      const glob = new Bun.Glob("*/" + SKILL_FILE_NAME);
      const entries = Array.from(glob.scanSync(this.skillsDir));
      let loadedCount = 0;
      let errorCount = 0;

      for (const relativePath of entries) {
        try {
          // 将相对路径转换为绝对路径
          const absolutePath = join(this.skillsDir, relativePath);
          await this.loadSkillMetadata(absolutePath);
          loadedCount++;
        } catch (error) {
          // 忽略错误
          errorCount++;
        }
      }

      logMethodReturn(logger, { method: "FilesystemSkillLoader.scanSkillsDirectory", module: MODULE_NAME, result: { dirExists: true, totalEntries: entries.length, loadedCount, errorCount }, duration: timer() });
    } catch (err) {
      const error = err as Error;
      logMethodError(logger, { method: "FilesystemSkillLoader.scanSkillsDirectory", module: MODULE_NAME, error: { name: error.name, message: error.message, ...(error.stack ? { stack: error.stack } : {}) }, params: { skillsDir: this.skillsDir }, duration: timer() });
      throw error;
    }
  }

  /**
   * 加载 Skill 元数据
   * 仅解析 frontmatter，不加载完整内容
   */
  private async loadSkillMetadata(skillFile: string): Promise<void> {
    const timer = createTimer();
    logMethodCall(logger, { method: "FilesystemSkillLoader.loadSkillMetadata", module: MODULE_NAME, params: { skillFile } });

    try {
      const file = Bun.file(skillFile);
      const exists = await file.exists();

      if (!exists) {
        logMethodReturn(logger, { method: "FilesystemSkillLoader.loadSkillMetadata", module: MODULE_NAME, result: { exists: false }, duration: timer() });
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

      logMethodReturn(logger, { method: "FilesystemSkillLoader.loadSkillMetadata", module: MODULE_NAME, result: { skillName, description: sanitize(description) }, duration: timer() });
    } catch (err) {
      const error = err as Error;
      logMethodError(logger, { method: "FilesystemSkillLoader.loadSkillMetadata", module: MODULE_NAME, error: { name: error.name, message: error.message, ...(error.stack ? { stack: error.stack } : {}) }, params: { skillFile }, duration: timer() });
      throw error;
    }
  }

  /**
   * 列出所有可用 Skill
   */
  async listSkills(): Promise<ISkillExtended[]> {
    const timer = createTimer();
    logMethodCall(logger, { method: "FilesystemSkillLoader.listSkills", module: MODULE_NAME, params: {} });

    try {
      await this.ensureInitialized();
      const result = Array.from(this.skills.values());
      logMethodReturn(logger, { method: "FilesystemSkillLoader.listSkills", module: MODULE_NAME, result: { count: result.length }, duration: timer() });
      return result;
    } catch (err) {
      const error = err as Error;
      logMethodError(logger, { method: "FilesystemSkillLoader.listSkills", module: MODULE_NAME, error: { name: error.name, message: error.message, ...(error.stack ? { stack: error.stack } : {}) }, params: {}, duration: timer() });
      throw error;
    }
  }

  /**
   * 加载指定 Skill 的内容
   * @param name - Skill 名称
   * @returns Skill 内容，若不存在则返回 null
   */
  async loadSkillContent(name: string): Promise<string | null> {
    const timer = createTimer();
    logMethodCall(logger, { method: "FilesystemSkillLoader.loadSkillContent", module: MODULE_NAME, params: { name } });

    try {
      await this.ensureInitialized();

      const skill = this.getSkill(name);
      if (!skill) {
        logMethodReturn(logger, { method: "FilesystemSkillLoader.loadSkillContent", module: MODULE_NAME, result: { found: false }, duration: timer() });
        return null;
      }

      const content = await skill.loadContent();
      logMethodReturn(logger, { method: "FilesystemSkillLoader.loadSkillContent", module: MODULE_NAME, result: { found: true, contentLength: content?.length ?? 0 }, duration: timer() });
      return content;
    } catch (err) {
      const error = err as Error;
      logMethodError(logger, { method: "FilesystemSkillLoader.loadSkillContent", module: MODULE_NAME, error: { name: error.name, message: error.message, ...(error.stack ? { stack: error.stack } : {}) }, params: { name }, duration: timer() });
      return null;
    }
  }

  /**
   * 重新扫描并加载所有 Skill
   */
  async reload(): Promise<void> {
    const timer = createTimer();
    logMethodCall(logger, { method: "FilesystemSkillLoader.reload", module: MODULE_NAME, params: {} });

    try {
      this.skills.clear();
      this.initialized = false;
      await this.ensureInitialized();
      logMethodReturn(logger, { method: "FilesystemSkillLoader.reload", module: MODULE_NAME, result: { skillCount: this.skills.size }, duration: timer() });
    } catch (err) {
      const error = err as Error;
      logMethodError(logger, { method: "FilesystemSkillLoader.reload", module: MODULE_NAME, error: { name: error.name, message: error.message, ...(error.stack ? { stack: error.stack } : {}) }, params: {}, duration: timer() });
      throw error;
    }
  }
}
