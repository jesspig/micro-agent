/**
 * 系统提示词构建模块
 *
 * 提示词分为两类：
 * - 系统级（不可修改）：system.mdx - 从模板目录加载
 * - 用户级（可修改）：SOUL.mdx, USER.mdx, AGENTS.mdx - 从 ~/.micro-agent/ 加载
 */

import { readFileSync, existsSync, mkdirSync, copyFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';

/** 用户级配置目录 */
const USER_CONFIG_DIR = resolve(homedir(), '.micro-agent');

/** 用户级提示词文件（可修改） */
const USER_PROMPT_FILES = [
  { name: 'SOUL.mdx', template: 'soul.mdx', description: '身份定义' },
  { name: 'USER.mdx', template: 'user.mdx', description: '用户信息' },
  { name: 'AGENTS.mdx', template: 'agents.mdx', description: '行为准则' },
] as const;

/**
 * 获取模板目录路径
 */
function getTemplatesPath(): string {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  // applications/cli/src/modules -> applications/templates/prompts
  return resolve(currentDir, '../../../templates/prompts');
}

/**
 * 确保用户级配置文件存在
 *
 * 首次启动时从模板复制 SOUL.mdx、USER.mdx、AGENTS.mdx 到 ~/.micro-agent/
 * system.mdx 不会被复制，始终从模板目录加载
 */
export function ensureUserConfigFiles(): { created: string[]; existed: string[] } {
  const created: string[] = [];
  const existed: string[] = [];

  // 确保用户配置目录存在
  if (!existsSync(USER_CONFIG_DIR)) {
    mkdirSync(USER_CONFIG_DIR, { recursive: true });
  }

  const templatesPath = resolve(getTemplatesPath(), 'agent');

  for (const file of USER_PROMPT_FILES) {
    const targetPath = resolve(USER_CONFIG_DIR, file.name);
    const templatePath = resolve(templatesPath, file.template);

    if (existsSync(targetPath)) {
      existed.push(file.name);
    } else if (existsSync(templatePath)) {
      // 从模板复制
      copyFileSync(templatePath, targetPath);
      created.push(file.name);
    }
  }

  return { created, existed };
}

/**
 * 获取用户级提示词文件状态
 */
export function getSystemPromptFiles(): { name: string; path: string; exists: boolean; description: string }[] {
  return USER_PROMPT_FILES.map((file) => {
    const path = resolve(USER_CONFIG_DIR, file.name);
    return {
      name: file.name,
      path,
      exists: existsSync(path),
      description: file.description,
    };
  });
}

/**
 * 加载单个提示词文件
 */
function loadPromptFile(name: string, searchPaths: string[]): string | null {
  for (const basePath of searchPaths) {
    const filePath = resolve(basePath, name);
    if (existsSync(filePath)) {
      return readFileSync(filePath, 'utf-8');
    }
  }
  return null;
}

/**
 * 加载系统级提示词（不可修改）
 *
 * 从模板目录加载 system.mdx
 */
export function loadSystemPromptTemplate(workspace: string): string {
  const templatesPath = getTemplatesPath();
  const systemPath = resolve(templatesPath, 'system.mdx');

  if (existsSync(systemPath)) {
    let content = readFileSync(systemPath, 'utf-8');
    // 替换工作区占位符
    content = content.replace(/{workspace}/g, workspace);
    return content;
  }

  // 回退：使用默认内容
  return `# 系统路径说明

工作区: ${workspace}
`;
}

/**
 * 加载用户级提示词（可修改）
 *
 * 优先级：用户级 ~/.micro-agent/ > workspace/
 */
export function loadUserPrompts(workspace?: string): string {
  const searchPaths = [USER_CONFIG_DIR];
  if (workspace) {
    searchPaths.push(workspace);
  }

  const parts: string[] = [];

  // 1. 加载 SOUL.mdx（身份）
  const soulContent = loadPromptFile('SOUL.mdx', searchPaths);
  if (soulContent) {
    parts.push(soulContent);
  }

  // 2. 加载 USER.mdx（用户信息）
  const userContent = loadPromptFile('USER.mdx', searchPaths);
  if (userContent) {
    parts.push('\n\n---\n\n' + userContent);
  }

  // 3. 加载 AGENTS.mdx（行为准则）
  const agentsContent = loadPromptFile('AGENTS.mdx', searchPaths);
  if (agentsContent) {
    parts.push('\n\n---\n\n' + agentsContent);
  }

  if (parts.length > 0) {
    return parts.join('');
  }

  return '';
}

/**
 * 加载完整系统提示词
 *
 * 组合顺序：
 * 1. 用户级提示词（SOUL.mdx, USER.mdx, AGENTS.mdx）
 * 2. 系统级提示词（system.mdx）
 * 3. Always 技能内容
 * 4. 技能摘要
 *
 * @param workspace 工作区路径
 * @param skillsLoader 技能加载器（可选）
 */
export function loadSystemPrompt(
  workspace: string,
  skillsLoader: { buildSkillsSummary: () => string; buildAlwaysSkillsContent: () => string; count: number } | null
): string {
  const parts: string[] = [];

  // 1. 用户级提示词（可修改）
  const userPrompts = loadUserPrompts(workspace);
  if (userPrompts) {
    parts.push(userPrompts);
  }

  // 2. 系统级提示词（不可修改）
  const systemPrompt = loadSystemPromptTemplate(workspace);
  if (systemPrompt) {
    parts.push(systemPrompt);
  }

  // 3. Always 技能内容（直接注入上下文）
  if (skillsLoader && skillsLoader.count > 0) {
    const alwaysContent = skillsLoader.buildAlwaysSkillsContent();
    if (alwaysContent) {
      parts.push(alwaysContent);
    }
  }

  // 4. 技能摘要
  if (skillsLoader && skillsLoader.count > 0) {
    const skillsSummary = skillsLoader.buildSkillsSummary();
    if (skillsSummary) {
      parts.push(`# 技能

以下技能可以扩展你的能力。

**使用规则：**
1. 当用户请求与某个技能的 description 关键词匹配时（如"创建XX技能"、"获取天气"等），必须先使用 \`read_file\` 读取该技能的完整内容
2. 读取 location 路径下的 SKILL.md 文件
3. 按照 SKILL.md 中的指导执行操作，而不是直接写代码

${skillsSummary}`);
    }
  }

  return parts.join('\n\n---\n\n');
}

/**
 * 获取用户配置目录路径
 */
export function getUserConfigDir(): string {
  return USER_CONFIG_DIR;
}