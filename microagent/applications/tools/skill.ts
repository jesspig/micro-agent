/**
 * Skill 工具集
 *
 * 提供技能管理的原子工具，每个工具专注于单一职责。
 * 符合 agentskills.io 规范。
 */

import { join, dirname, basename } from "node:path";
import { existsSync, cpSync } from "node:fs";
import { readFile, mkdir, rm, writeFile } from "node:fs/promises";
import { exec } from "node:child_process";
import { homedir } from "node:os";
import { BaseTool } from "../../runtime/tool/base.js";
import type { ToolParameterSchema, ToolResult } from "../../runtime/tool/types.js";
import { SKILLS_DIR, SKILLS_DIRS, TOOL_EXECUTION_TIMEOUT, WORKSPACE_DIR } from "../shared/constants.js";
import { toolsLogger, createTimer, logMethodCall, logMethodReturn, logMethodError, sanitize } from "../shared/logger.js";

const MODULE_NAME = "skill";
const logger = toolsLogger();

// ============================================================================
// 类型定义
// ============================================================================

/** 技能摘要信息（对外暴露） */
interface SkillSummary {
  name: string;
  description: string | undefined;
  tags: string[] | undefined;
}

/** 技能内部信息（包含路径，不对外暴露） */
interface SkillInternal {
  name: string;
  path: string;
  writable: boolean;
  description: string | undefined;
  tags: string[] | undefined;
}

/** 执行结果 */
interface ExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
}

// ============================================================================
// 常量
// ============================================================================

/** 危险命令黑名单 */
const DANGEROUS_COMMANDS = [
  "rm -rf",
  "sudo",
  "su",
  "chmod 777",
  "chown",
  "mkfs",
  "dd if=",
  ":(){:|:&};:",
  "curl | bash",
  "wget | bash",
];

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 检查命令是否安全
 */
function isCommandSafe(command: string): boolean {
  const normalizedCommand = command.toLowerCase().trim();
  for (const dangerous of DANGEROUS_COMMANDS) {
    if (normalizedCommand.includes(dangerous.toLowerCase())) {
      return false;
    }
  }
  return true;
}

/**
 * 获取有效的技能目录列表
 */
function getValidSkillDirs(): Array<{ path: string; writable: boolean }> {
  return SKILLS_DIRS.map(path => ({
    path,
    writable: path === SKILLS_DIR,
  })).filter(dir => existsSync(dir.path));
}

/**
 * 根据技能名称查找技能
 */
async function findSkillByName(name: string): Promise<SkillInternal | null> {
  const validDirs = getValidSkillDirs();

  for (const dir of validDirs) {
    const skillDir = join(dir.path, name);
    const skillFile = join(skillDir, "SKILL.md");

    if (existsSync(skillFile)) {
      const meta = await parseSkillMetadata(skillFile);
      return {
        name,
        path: skillDir,
        writable: dir.writable,
        description: meta.description,
        tags: meta.tags,
      };
    }
  }

  return null;
}

/**
 * 解析技能元数据
 */
async function parseSkillMetadata(skillFile: string): Promise<{ description?: string; tags?: string[] }> {
  try {
    const content = await readFile(skillFile, "utf-8");
    const result: { description?: string; tags?: string[] } = {};

    const descMatch = content.match(/^description:\s*(.+)$/m);
    if (descMatch && descMatch[1]) {
      result.description = descMatch[1].trim().replace(/^["']|["']$/g, "");
    }

    const tagsMatch = content.match(/^tags:\s*\[(.+)\]$/m);
    if (tagsMatch && tagsMatch[1]) {
      result.tags = tagsMatch[1].split(",").map(t => t.trim().replace(/^["']|["']$/g, ""));
    }

    return result;
  } catch {
    return {};
  }
}

/**
 * 扫描所有技能
 */
async function scanAllSkills(): Promise<SkillInternal[]> {
  const validDirs = getValidSkillDirs();
  const skills: Map<string, SkillInternal> = new Map();

  for (const dir of validDirs) {
    try {
      const glob = new Bun.Glob("*/SKILL.md");
      const entries = Array.from(glob.scanSync(dir.path));

      for (const relativePath of entries) {
        const skillName = basename(dirname(relativePath));
        const skillDir = join(dir.path, dirname(relativePath));
        const skillFile = join(skillDir, "SKILL.md");

        if (skills.has(skillName)) continue;

        const meta = await parseSkillMetadata(skillFile);
        skills.set(skillName, {
          name: skillName,
          path: skillDir,
          writable: dir.writable,
          description: meta.description,
          tags: meta.tags,
        });
      }
    } catch {
      // 忽略扫描错误
    }
  }

  return Array.from(skills.values());
}

/**
 * 验证技能名称是否符合 agentskills.io 规范
 */
function validateSkillName(name: string): { valid: boolean; error?: string } {
  if (!name || name.length === 0) {
    return { valid: false, error: "技能名称不能为空" };
  }
  if (name.length > 64) {
    return { valid: false, error: `技能名称过长 (${name.length}/64 字符)` };
  }
  if (!/^[a-z0-9-]+$/.test(name)) {
    return { valid: false, error: "技能名称只能包含小写字母、数字和连字符" };
  }
  if (name.startsWith("-") || name.endsWith("-")) {
    return { valid: false, error: "技能名称不能以连字符开头或结尾" };
  }
  if (name.includes("--")) {
    return { valid: false, error: "技能名称不能包含连续连字符" };
  }
  return { valid: true };
}

/**
 * 生成符合 agentskills.io 规范的 SKILL.md 内容
 */
function generateSkillMarkdown(params: {
  name: string;
  description: string;
  license?: string;
  compatibility?: string;
  metadata?: Record<string, string>;
  allowedTools?: string[];
  instructions?: string;
}): string {
  const { name, description, license, compatibility, metadata, allowedTools, instructions } = params;

  const frontmatterLines: string[] = [
    "---",
    `name: ${name}`,
    `description: ${description}`,
  ];

  if (license) {
    frontmatterLines.push(`license: ${license}`);
  }

  if (compatibility) {
    frontmatterLines.push(`compatibility: ${compatibility}`);
  }

  if (metadata && Object.keys(metadata).length > 0) {
    frontmatterLines.push("metadata:");
    for (const [key, value] of Object.entries(metadata)) {
      frontmatterLines.push(`  ${key}: ${value}`);
    }
  }

  if (allowedTools && allowedTools.length > 0) {
    frontmatterLines.push(`allowed-tools: ${allowedTools.join(" ")}`);
  }

  frontmatterLines.push("---");

  const body = instructions ?? `# ${name}

## 功能说明

[请描述此技能的具体功能]

## 使用场景

[请描述何时应该使用此技能]

## 使用方法

[请提供具体的使用步骤]

## 示例

[请提供使用示例]
`;

  return [...frontmatterLines, "", body].join("\n");
}

/**
 * 执行命令
 */
function executeCommand(command: string, options: { cwd: string; timeout: number }): Promise<ExecutionResult> {
  return new Promise((resolve) => {
    const result: ExecutionResult = { stdout: "", stderr: "", exitCode: null, timedOut: false };

    exec(
      command,
      { cwd: options.cwd, timeout: options.timeout, maxBuffer: 10 * 1024 * 1024, windowsHide: true },
      (error: Error | null, stdout: string, stderr: string) => {
        result.stdout = stdout;
        result.stderr = stderr;

        if (error) {
          if ((error as Error & { killed?: boolean }).killed) result.timedOut = true;
          const errorCode = (error as NodeJS.ErrnoException).code;
          result.exitCode = typeof errorCode === "number" ? errorCode : 1;
        } else {
          result.exitCode = 0;
        }

        resolve(result);
      }
    );
  });
}

// ============================================================================
// SkillList 工具
// ============================================================================

/**
 * skill_list: 列出所有可用技能
 */
export class SkillListTool extends BaseTool<Record<string, unknown>> {
  readonly name = "skill_list";
  readonly description = `列出所有可用的技能。

【重要】这是获取技能列表的唯一方式。当用户询问"有哪些技能"、"技能列表"、"能做什么"时，必须调用此工具，不要直接猜测或编造技能列表。

返回技能列表，包含名称、描述和标签。`;

  readonly parameters: ToolParameterSchema = {
    type: "object",
    properties: {},
    required: [],
  };

  async execute(): Promise<ToolResult> {
    const timer = createTimer();
    logMethodCall(logger, { method: "execute", module: MODULE_NAME, params: { tool: "skill_list" } });

    try {
      const skills = await scanAllSkills();

      if (skills.length === 0) {
        return { content: "没有可用的技能", isError: false };
      }

      const summaries: SkillSummary[] = skills.map(s => ({
        name: s.name,
        description: s.description,
        tags: s.tags,
      }));

      logMethodReturn(logger, { method: "execute", module: MODULE_NAME, result: { count: summaries.length }, duration: timer() });
      return {
        content: JSON.stringify(summaries, null, 2),
        isError: false,
        metadata: { count: summaries.length },
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logMethodError(logger, { method: "execute", module: MODULE_NAME, error: { name: err.name, message: err.message }, duration: timer() });
      return { content: `列出技能失败: ${err.message}`, isError: true };
    }
  }
}

// ============================================================================
// SkillSearch 工具
// ============================================================================

/**
 * skill_search: 搜索技能
 */
export class SkillSearchTool extends BaseTool<Record<string, unknown>> {
  readonly name = "skill_search";
  readonly description = `按关键词搜索技能。

在技能名称、描述和标签中搜索匹配项。
使用此工具查找特定功能的技能。`;

  readonly parameters: ToolParameterSchema = {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "搜索关键词",
      },
    },
    required: ["query"],
  };

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const timer = createTimer();
    logMethodCall(logger, { method: "execute", module: MODULE_NAME, params: { tool: "skill_search", query: params.query } });

    try {
      // 立即校验必需参数（失败快速原则）
      const query = this.readStringParam(params, "query", { required: true });
      if (!query) {
        throw new Error('缺少必需参数: query');
      }

      const skills = await scanAllSkills();
      const queryLower = query.toLowerCase();

      const results: SkillSummary[] = skills
        .filter(s =>
          s.name.toLowerCase().includes(queryLower) ||
          (s.description && s.description.toLowerCase().includes(queryLower)) ||
          (s.tags && s.tags.some(t => t.toLowerCase().includes(queryLower)))
        )
        .map(s => ({
          name: s.name,
          description: s.description,
          tags: s.tags,
        }));

      logMethodReturn(logger, { method: "execute", module: MODULE_NAME, result: { count: results.length }, duration: timer() });
      return {
        content: JSON.stringify(results, null, 2),
        isError: false,
        metadata: { query, count: results.length },
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logMethodError(logger, { method: "execute", module: MODULE_NAME, error: { name: err.name, message: err.message }, duration: timer() });
      return { content: `搜索技能失败: ${err.message}`, isError: true };
    }
  }
}

// ============================================================================
// SkillRead 工具
// ============================================================================

/**
 * skill_read: 读取技能内容
 */
export class SkillReadTool extends BaseTool<Record<string, unknown>> {
  readonly name = "skill_read";
  readonly description = `读取技能文件内容。

默认读取 SKILL.md，也可指定技能内的其他文件。
使用此工具查看技能的详细说明。`;

  readonly parameters: ToolParameterSchema = {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "技能名称",
      },
      file: {
        type: "string",
        description: "技能内文件路径（默认: SKILL.md）",
      },
    },
    required: ["name"],
  };

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const timer = createTimer();
    logMethodCall(logger, { method: "execute", module: MODULE_NAME, params: { tool: "skill_read", name: params.name } });

    try {
      // 立即校验必需参数（失败快速原则）
      const name = this.readStringParam(params, "name", { required: true });
      if (!name) {
        throw new Error('缺少必需参数: name');
      }

      const skill = await findSkillByName(name);
      if (!skill) {
        return { content: `技能不存在: ${name}`, isError: true };
      }

      const file = this.readStringParam(params, "file") ?? "SKILL.md";
      const filePath = join(skill.path, file);

      if (!existsSync(filePath)) {
        return { content: `文件不存在: ${file}`, isError: true };
      }

      const content = await readFile(filePath, "utf-8");
      logMethodReturn(logger, { method: "execute", module: MODULE_NAME, result: { size: content.length }, duration: timer() });

      return {
        content,
        isError: false,
        metadata: { name, file, size: content.length },
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logMethodError(logger, { method: "execute", module: MODULE_NAME, error: { name: err.name, message: err.message }, duration: timer() });
      return { content: `读取技能失败: ${err.message}`, isError: true };
    }
  }
}

// ============================================================================
// SkillExecute 工具
// ============================================================================

/**
 * skill_execute: 在技能目录中执行命令
 */
export class SkillExecuteTool extends BaseTool<Record<string, unknown>> {
  readonly name = "skill_execute";
  readonly description = `在技能目录中执行命令。

用于运行技能中的脚本或工具。
命令会在技能目录下执行。`;

  readonly parameters: ToolParameterSchema = {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "技能名称",
      },
      command: {
        type: "string",
        description: "要执行的命令",
      },
      args: {
        type: "array",
        description: "命令参数",
        items: { type: "string" },
      },
      timeout: {
        type: "number",
        description: "超时时间（毫秒）",
      },
    },
    required: ["name", "command"],
  };

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const timer = createTimer();
    logMethodCall(logger, { method: "execute", module: MODULE_NAME, params: { tool: "skill_execute", name: params.name } });

    try {
      // 立即校验必需参数（失败快速原则）
      const name = this.readStringParam(params, "name", { required: true });
      if (!name) {
        throw new Error('缺少必需参数: name');
      }

      const command = this.readStringParam(params, "command", { required: true });
      if (!command) {
        throw new Error('缺少必需参数: command');
      }

      if (!isCommandSafe(command)) {
        throw new Error(`命令被禁止执行: ${command}`);
      }

      const skill = await findSkillByName(name);
      if (!skill) {
        return { content: `技能不存在: ${name}`, isError: true };
      }

      const args = this.readArrayParam<string>(params, "args");
      const timeout = this.readNumberParam(params, "timeout") ?? TOOL_EXECUTION_TIMEOUT;
      const fullCommand = args && args.length > 0 ? `${command} ${args.join(" ")}` : command;

      const execResult = await executeCommand(fullCommand, { cwd: skill.path, timeout });

      // 格式化结果
      const parts: string[] = [`技能: ${name}`, `命令: ${command}`, ""];

      if (execResult.stdout) {
        parts.push("=== 标准输出 ===", execResult.stdout.trim());
      }

      if (execResult.stderr) {
        parts.push("", "=== 标准错误 ===", execResult.stderr.trim());
      }

      parts.push("");
      if (execResult.timedOut) {
        parts.push("状态: 执行超时");
      } else if (execResult.exitCode === 0) {
        parts.push("状态: 成功");
      } else {
        parts.push(`状态: 失败 (退出码: ${execResult.exitCode})`);
      }

      logMethodReturn(logger, { method: "execute", module: MODULE_NAME, result: { exitCode: execResult.exitCode }, duration: timer() });
      return {
        content: parts.join("\n"),
        isError: execResult.exitCode !== 0 || execResult.timedOut,
        metadata: { command, skillName: name, exitCode: execResult.exitCode, timedOut: execResult.timedOut },
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logMethodError(logger, { method: "execute", module: MODULE_NAME, error: { name: err.name, message: err.message }, duration: timer() });
      return { content: `执行命令失败: ${err.message}`, isError: true };
    }
  }
}

// ============================================================================
// SkillCreate 工具
// ============================================================================

/**
 * skill_create: 创建新技能
 */
export class SkillCreateTool extends BaseTool<Record<string, unknown>> {
  readonly name = "skill_create";
  readonly description = `创建新技能（符合 agentskills.io 规范）。

【重要】当用户要求创建技能时，必须调用此工具创建文件，而不是直接输出技能内容。

必需参数：
- name: 技能名称（小写字母/数字/连字符，最长64字符）
- description: 技能描述（应包含触发关键词）

可选参数：
- instructions: 详细说明（SKILL.md 主体内容）
- license: 许可证
- compatibility: 兼容性要求
- create_dirs: 创建子目录（scripts, references, assets）
- content: 自定义完整内容（提供则忽略其他参数）

示例：
{ "name": "code-reviewer", "description": "代码审查技能。当用户请求代码审查时使用." }`;

  readonly parameters: ToolParameterSchema = {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "技能名称（小写字母、数字、连字符，最长64字符）",
      },
      description: {
        type: "string",
        description: "技能描述（应包含使用场景关键词）",
      },
      instructions: {
        type: "string",
        description: "技能详细说明（将作为 SKILL.md 主体）",
      },
      license: {
        type: "string",
        description: "许可证名称",
      },
      compatibility: {
        type: "string",
        description: "兼容性要求（最长500字符）",
      },
      create_dirs: {
        type: "array",
        description: "创建可选目录（scripts, references, assets）",
        items: { type: "string" },
      },
      content: {
        type: "string",
        description: "自定义 SKILL.md 完整内容（提供则忽略其他参数）",
      },
    },
    required: ["name"],
  };

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const timer = createTimer();
    logMethodCall(logger, { method: "execute", module: MODULE_NAME, params: sanitize(params) as Record<string, unknown> });

    try {
      // 立即校验必需参数（失败快速原则）
      const name = this.readStringParam(params, "name", { required: true });
      if (!name) {
        throw new Error('缺少必需参数: name');
      }

      const description = this.readStringParam(params, "description");
      const license = this.readStringParam(params, "license");
      const compatibility = this.readStringParam(params, "compatibility");
      const instructions = this.readStringParam(params, "instructions");
      const createDirs = this.readArrayParam<string>(params, "create_dirs");
      const customContent = this.readStringParam(params, "content");

      const nameValidation = validateSkillName(name);
      if (!nameValidation.valid) {
        return { content: `无效的技能名称: ${nameValidation.error}`, isError: true };
      }

      // 检查技能是否已存在
      const existing = await findSkillByName(name);
      if (existing) {
        return { content: `技能已存在: ${name}`, isError: true };
      }

      // 创建目录
      const skillDir = join(SKILLS_DIR, name);
      const skillFile = join(skillDir, "SKILL.md");

      if (!existsSync(skillDir)) {
        await mkdir(skillDir, { recursive: true });
      }

      // 创建可选子目录
      const validDirs = ["scripts", "references", "assets"];
      const dirsToCreate = createDirs?.filter(d => validDirs.includes(d)) ?? [];

      for (const dir of dirsToCreate) {
        const dirPath = join(skillDir, dir);
        if (!existsSync(dirPath)) {
          await mkdir(dirPath, { recursive: true });
        }
      }

      // 生成 SKILL.md 内容
      let skillContent: string;

      if (customContent) {
        skillContent = customContent;
      } else {
        const skillParams: {
          name: string;
          description: string;
          license?: string;
          compatibility?: string;
          instructions?: string;
        } = {
          name,
          description: description ?? `执行 ${name} 相关任务。当用户提到 "${name}" 或相关关键词时使用此技能。`,
        };

        if (license) skillParams.license = license;
        if (compatibility) skillParams.compatibility = compatibility;
        if (instructions) skillParams.instructions = instructions;

        skillContent = generateSkillMarkdown(skillParams);
      }

      // 写入文件
      await writeFile(skillFile, skillContent, "utf-8");

      // 构建结果
      const resultParts: string[] = [
        `技能创建成功: ${name}`,
        "",
        "创建的文件:",
        "  - SKILL.md",
      ];

      if (dirsToCreate.length > 0) {
        resultParts.push("", "创建的目录:");
        for (const dir of dirsToCreate) {
          resultParts.push(`  - ${dir}/`);
        }
      }

      resultParts.push(
        "",
        "技能路径: ~/.micro-agent/skills/" + name,
      );

      logMethodReturn(logger, { method: "execute", module: MODULE_NAME, result: { name }, duration: timer() });
      return {
        content: resultParts.join("\n"),
        isError: false,
        metadata: { name, file: "SKILL.md", dirs: dirsToCreate },
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logMethodError(logger, { method: "execute", module: MODULE_NAME, error: { name: err.name, message: err.message }, duration: timer() });
      return { content: `创建技能失败: ${err.message}`, isError: true };
    }
  }
}

// ============================================================================
// SkillDelete 工具
// ============================================================================

/**
 * skill_delete: 删除技能
 */
export class SkillDeleteTool extends BaseTool<Record<string, unknown>> {
  readonly name = "skill_delete";
  readonly description = `删除技能。

只能删除用户创建的技能（主目录中的技能）。
系统内置技能无法删除。`;

  readonly parameters: ToolParameterSchema = {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "要删除的技能名称",
      },
    },
    required: ["name"],
  };

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const timer = createTimer();
    logMethodCall(logger, { method: "execute", module: MODULE_NAME, params: { tool: "skill_delete", name: params.name } });

    try {
      // 立即校验必需参数（失败快速原则）
      const name = this.readStringParam(params, "name", { required: true });
      if (!name) {
        throw new Error('缺少必需参数: name');
      }

      const skill = await findSkillByName(name);
      if (!skill) {
        return { content: `技能不存在: ${name}`, isError: true };
      }

      if (!skill.writable) {
        return { content: `技能 ${name} 是只读的，无法删除`, isError: true };
      }

      await rm(skill.path, { recursive: true });
      logMethodReturn(logger, { method: "execute", module: MODULE_NAME, result: { name }, duration: timer() });

      return { content: `技能删除成功: ${name}`, isError: false };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logMethodError(logger, { method: "execute", module: MODULE_NAME, error: { name: err.name, message: err.message }, duration: timer() });
      return { content: `删除技能失败: ${err.message}`, isError: true };
    }
  }
}

// ============================================================================
// SkillAdd 工具
// ============================================================================

/**
 * skill_add: 从工作区添加技能
 */
export class SkillAddTool extends BaseTool<Record<string, unknown>> {
  readonly name = "skill_add";
  readonly description = `从工作区目录添加技能。

将工作区中的技能目录复制到技能库中。
源目录必须包含 SKILL.md 文件。`;

  readonly parameters: ToolParameterSchema = {
    type: "object",
    properties: {
      source_path: {
        type: "string",
        description: "工作区中的技能目录路径",
      },
      name: {
        type: "string",
        description: "技能名称（可选，默认使用目录名）",
      },
    },
    required: ["source_path"],
  };

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const timer = createTimer();
    logMethodCall(logger, { method: "execute", module: MODULE_NAME, params: { tool: "skill_add", source_path: params.source_path } });

    try {
      // 立即校验必需参数（失败快速原则）
      const sourcePath = this.readStringParam(params, "source_path", { required: true });
      if (!sourcePath) {
        throw new Error('缺少必需参数: source_path');
      }

      const name = this.readStringParam(params, "name");

      // 解析源路径
      let fullSourcePath: string;

      if (sourcePath.startsWith("~")) {
        fullSourcePath = join(homedir(), sourcePath.slice(1).replace(/^[\/\\]/, ""));
      } else if (sourcePath.startsWith("/") || /^[A-Za-z]:/.test(sourcePath)) {
        fullSourcePath = sourcePath;
      } else {
        fullSourcePath = join(WORKSPACE_DIR, sourcePath);
      }

      if (!existsSync(fullSourcePath)) {
        return { content: `源路径不存在: ${sourcePath}`, isError: true };
      }

      // 确定技能名称
      const skillName = name ? basename(name.replace(/[\/\\]/g, "")) : basename(fullSourcePath);

      if (!skillName || skillName === "." || skillName === "..") {
        return { content: `无效的技能名称`, isError: true };
      }

      // 检查是否已存在
      const existing = await findSkillByName(skillName);
      if (existing) {
        return { content: `技能已存在: ${skillName}，请先删除后再添加`, isError: true };
      }

      // 目标路径
      const targetPath = join(SKILLS_DIR, skillName);

      // 确保目录存在
      if (!existsSync(SKILLS_DIR)) {
        await mkdir(SKILLS_DIR, { recursive: true });
      }

      // 复制
      try {
        cpSync(fullSourcePath, targetPath, { recursive: true });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: `复制失败: ${msg}`, isError: true };
      }

      logMethodReturn(logger, { method: "execute", module: MODULE_NAME, result: { name: skillName }, duration: timer() });
      return {
        content: `技能添加成功: ${skillName}`,
        isError: false,
        metadata: { name: skillName },
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logMethodError(logger, { method: "execute", module: MODULE_NAME, error: { name: err.name, message: err.message }, duration: timer() });
      return { content: `添加技能失败: ${err.message}`, isError: true };
    }
  }
}

// ============================================================================
// 导出
// ============================================================================

/**
 * 兼容旧版 skill 工具（已废弃，保留向后兼容）
 * @deprecated 请使用独立的 skill_* 工具
 */
export class SkillTool extends BaseTool<Record<string, unknown>> {
  readonly name = "skill";
  readonly description = `【已废弃】请使用独立的 skill_* 工具：
- skill_list: 列出所有技能
- skill_search: 搜索技能
- skill_read: 读取技能内容
- skill_create: 创建新技能
- skill_delete: 删除技能
- skill_execute: 执行技能命令
- skill_add: 添加技能`;

  readonly parameters: ToolParameterSchema = {
    type: "object",
    properties: {
      action: {
        type: "string",
        description: "操作类型（已废弃）",
      },
    },
    required: [],
  };

  async execute(): Promise<ToolResult> {
    return {
      content: "skill 工具已废弃。请使用独立的 skill_* 工具：skill_list, skill_search, skill_read, skill_create, skill_delete, skill_execute, skill_add",
      isError: true,
    };
  }
}

/** 所有技能工具 */
export const skillTools = [
  new SkillListTool(),
  new SkillSearchTool(),
  new SkillReadTool(),
  new SkillExecuteTool(),
  new SkillCreateTool(),
  new SkillDeleteTool(),
  new SkillAddTool(),
];