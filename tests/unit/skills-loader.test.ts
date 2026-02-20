import { describe, test, expect, beforeEach } from 'bun:test';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { SkillsLoader } from '@microbot/core/skills';

const TEST_DIR = join(process.cwd(), 'test-skills-temp');
const WORKSPACE_DIR = join(TEST_DIR, 'workspace');
const BUILTIN_DIR = join(TEST_DIR, 'builtin');
const USER_SKILLS_DIR = join(WORKSPACE_DIR, 'skills');

/** 创建测试技能目录 */
function createSkill(
  baseDir: string,
  name: string,
  frontmatter: Record<string, string | string[]>,
  content: string
): void {
  const skillDir = join(baseDir, name);
  if (!existsSync(skillDir)) mkdirSync(skillDir, { recursive: true });

  const fm = Object.entries(frontmatter)
    .map(([k, v]) => {
      if (Array.isArray(v)) {
        return `${k}:\n${v.map(item => `  - ${item}`).join('\n')}`;
      }
      return `${k}: "${v}"`;
    })
    .join('\n');

  writeFileSync(
    join(skillDir, 'SKILL.md'),
    `---\n${fm}\n---\n\n${content}`
  );
}

describe('SkillsLoader', () => {
  beforeEach(() => {
    // 清理并创建测试目录
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
    mkdirSync(BUILTIN_DIR, { recursive: true });
    mkdirSync(USER_SKILLS_DIR, { recursive: true });
  });

  describe('技能加载', () => {
    test('should load skill from SKILL.md', () => {
      createSkill(
        BUILTIN_DIR,
        'test-skill',
        { name: 'test-skill', description: 'Test skill description' },
        '# Test Skill\n\nContent here.'
      );

      const loader = new SkillsLoader(WORKSPACE_DIR, BUILTIN_DIR);
      loader.load();

      const skill = loader.get('test-skill');
      expect(skill).toBeDefined();
      expect(skill?.name).toBe('test-skill');
      expect(skill?.description).toBe('Test skill description');
      expect(skill?.content).toBe('# Test Skill\n\nContent here.');
    });

    test('should return all skills', () => {
      createSkill(BUILTIN_DIR, 'skill-a', { name: 'skill-a', description: 'A' }, 'A');
      createSkill(BUILTIN_DIR, 'skill-b', { name: 'skill-b', description: 'B' }, 'B');

      const loader = new SkillsLoader(WORKSPACE_DIR, BUILTIN_DIR);
      loader.load();

      expect(loader.count).toBe(2);
      expect(loader.getAll().map(s => s.name).sort()).toEqual(['skill-a', 'skill-b']);
    });

    test('should generate summaries', () => {
      createSkill(BUILTIN_DIR, 'skill-a', { name: 'skill-a', description: 'Desc A' }, 'A');

      const loader = new SkillsLoader(WORKSPACE_DIR, BUILTIN_DIR);
      loader.load();

      const summaries = loader.getSummaries();
      expect(summaries).toHaveLength(1);
      expect(summaries[0]).toEqual({ name: 'skill-a', description: 'Desc A' });
    });

    test('should generate summaries markdown', () => {
      createSkill(BUILTIN_DIR, 'skill-a', { name: 'skill-a', description: 'Desc A' }, 'A');

      const loader = new SkillsLoader(WORKSPACE_DIR, BUILTIN_DIR);
      loader.load();

      const md = loader.getSummariesMarkdown();
      expect(md).toContain('## 可用技能');
      expect(md).toContain('**skill-a**: Desc A');
    });
  });

  describe('优先级', () => {
    test('should prefer user skill over builtin', () => {
      createSkill(
        BUILTIN_DIR,
        'my-skill',
        { name: 'my-skill', description: 'Builtin' },
        'Builtin content'
      );
      createSkill(
        USER_SKILLS_DIR,
        'my-skill',
        { name: 'my-skill', description: 'User' },
        'User content'
      );

      const loader = new SkillsLoader(WORKSPACE_DIR, BUILTIN_DIR);
      loader.load();

      const skill = loader.get('my-skill');
      expect(skill?.description).toBe('User');
      expect(skill?.content).toBe('User content');
    });
  });

  describe('名称验证', () => {
    test('should use directory name if name mismatch', () => {
      createSkill(
        BUILTIN_DIR,
        'correct-name',
        { name: 'wrong-name', description: 'Test' },
        'Content'
      );

      const loader = new SkillsLoader(WORKSPACE_DIR, BUILTIN_DIR);
      loader.load();

      const skill = loader.get('correct-name');
      expect(skill?.name).toBe('correct-name');
    });

    test('should validate skill name format', () => {
      createSkill(
        BUILTIN_DIR,
        'valid-name-123',
        { name: 'valid-name-123', description: 'Valid' },
        'Content'
      );

      const loader = new SkillsLoader(WORKSPACE_DIR, BUILTIN_DIR);
      loader.load();

      const skill = loader.get('valid-name-123');
      expect(skill).toBeDefined();
    });
  });

  describe('可选字段', () => {
    test('should parse dependencies', () => {
      createSkill(
        BUILTIN_DIR,
        'dep-skill',
        {
          name: 'dep-skill',
          description: 'With deps',
          dependencies: ['bun>=1.0', 'python>=3.8'],
        },
        'Content'
      );

      const loader = new SkillsLoader(WORKSPACE_DIR, BUILTIN_DIR);
      loader.load();

      const skill = loader.get('dep-skill');
      expect(skill?.dependencies).toEqual(['bun>=1.0', 'python>=3.8']);
    });

    test('should parse license and compatibility', () => {
      createSkill(
        BUILTIN_DIR,
        'advanced-skill',
        {
          name: 'advanced-skill',
          description: 'Advanced',
          license: 'MIT',
          compatibility: 'bun',
        },
        'Content'
      );

      const loader = new SkillsLoader(WORKSPACE_DIR, BUILTIN_DIR);
      loader.load();

      const skill = loader.get('advanced-skill');
      expect(skill?.license).toBe('MIT');
      expect(skill?.compatibility).toBe('bun');
    });

    test('should parse allowed-tools', () => {
      createSkill(
        BUILTIN_DIR,
        'tool-skill',
        {
          name: 'tool-skill',
          description: 'Tool',
          'allowed-tools': 'read_file write_file shell',
        },
        'Content'
      );

      const loader = new SkillsLoader(WORKSPACE_DIR, BUILTIN_DIR);
      loader.load();

      const skill = loader.get('tool-skill');
      expect(skill?.allowedTools).toEqual(['read_file', 'write_file', 'shell']);
    });

    test('should parse metadata', () => {
      createSkill(
        BUILTIN_DIR,
        'meta-skill',
        {
          name: 'meta-skill',
          description: 'Meta',
        },
        'Content'
      );

      const loader = new SkillsLoader(WORKSPACE_DIR, BUILTIN_DIR);
      loader.load();

      const skill = loader.get('meta-skill');
      expect(skill?.metadata).toEqual({});
      expect(skill?.skillPath).toContain('meta-skill');
    });
  });

  describe('错误处理', () => {
    test('should handle empty skills directory', () => {
      const loader = new SkillsLoader(WORKSPACE_DIR, BUILTIN_DIR);
      loader.load();

      expect(loader.count).toBe(0);
      expect(loader.getSummaries()).toEqual([]);
      expect(loader.getSummariesMarkdown()).toBe('');
    });

    test('should skip directories without SKILL.md', () => {
      const noSkillDir = join(BUILTIN_DIR, 'no-skill');
      mkdirSync(noSkillDir, { recursive: true });
      // 不创建 SKILL.md

      const loader = new SkillsLoader(WORKSPACE_DIR, BUILTIN_DIR);
      loader.load();

      expect(loader.count).toBe(0);
    });
  });
});