/**
 * 技能加载器
 *
 * 处理技能文件的加载和解析
 */

import { getLogger } from '../runtime/infrastructure/logging';
import { existsSync, readFileSync } from 'fs';
import { join, basename } from 'path';
import matter from 'gray-matter';
import type { SkillDefinition } from '../runtime/capability/skill-system';

const log = getLogger(['agent-service', 'skill-loader']);

/**
 * 从路径加载技能
 */
export function loadSkillFromPath(
  skillPath: string,
  _name?: string,
  description?: string
): SkillDefinition | null {
  const skillMdPath = join(skillPath, 'SKILL.md');

  if (!existsSync(skillMdPath)) {
    log.warn('技能文件不存在', { path: skillMdPath });
    return null;
  }

  try {
    const fileContent = readFileSync(skillMdPath, 'utf-8');
    const { data, content } = matter(fileContent);

    return {
      name: data.name ?? basename(skillPath),
      description: data.description ?? description ?? '',
      scenarios: extractScenarios(data, content),
      tools: data['allowed-tools'] ?? [],
      promptTemplate: content.trim(),
    };
  } catch (error) {
    log.error('解析技能文件失败', { path: skillMdPath, error: (error as Error).message });
    return null;
  }
}

/**
 * 从技能内容提取场景关键词
 */
export function extractScenarios(data: Record<string, unknown>, content: string): string[] {
  const scenarios: string[] = [];

  if (data.name && typeof data.name === 'string') {
    scenarios.push(data.name);
  }

  if (data.description && typeof data.description === 'string') {
    const keywords = data.description.toLowerCase().match(/\b[a-z\u4e00-\u9fa5]+\b/g);
    if (keywords) {
      scenarios.push(...keywords.slice(0, 5));
    }
  }

  const headings = content.match(/^##\s+(.+)$/gm);
  if (headings) {
    for (const h of headings.slice(0, 3)) {
      const title = h.replace(/^##\s+/, '').toLowerCase();
      scenarios.push(title);
    }
  }

  return [...new Set(scenarios)];
}
